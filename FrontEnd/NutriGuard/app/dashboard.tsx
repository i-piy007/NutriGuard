import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Image, Modal, Pressable, Animated } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// react-native-circular-progress may not include TypeScript types in this project.
// Use a ts-ignore to avoid a compile-time error; consider installing types or
// adding a declaration file if you want stricter typing.
// @ts-ignore
import { AnimatedCircularProgress } from 'react-native-circular-progress';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from 'expo-router';
import { Buffer } from 'buffer';
import { styleText } from 'util';

type WeekDay = {
    day: string;
    day_name: string;
    status: 'achieved' | 'not_achieved' | 'no_data';
};

const Dashboard = () => {
    const insets = useSafeAreaInsets();
    // Start from zeros and load stored totals (replace, don't add to defaults)
    const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 });
    const [username, setUsername] = useState<string | null>(null);
    const [bmi, setBmi] = useState<number | null>(null);
    const [showBmiModal, setShowBmiModal] = useState(false);
    const [barWidth, setBarWidth] = useState(0);
    const pointerX = useRef(new Animated.Value(0)).current;
    const [weeklyStatus, setWeeklyStatus] = useState<WeekDay[]>([]);

    const fetchProfileForBmi = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            if (!token) return;
            const resp = await fetch('https://nutriguard-n98n.onrender.com/user/profile', { headers: { Authorization: `Bearer ${token}` } });
            if (!resp.ok) return;
            const j = await resp.json();
            const h = j.height; // in cm
            const w = j.weight; // in kg
            if (h && w) {
                const h_m = Number(h) / 100.0;
                if (h_m > 0) {
                    const bmiVal = Number(w) / (h_m * h_m);
                    setBmi(Math.round(bmiVal * 10) / 10);
                }
            }
        } catch (e) {
            console.warn('[dashboard] failed to fetch profile for BMI', e);
        }
    };

    const fetchWeeklyStatus = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            if (!token) return;
            const resp = await fetch('https://nutriguard-n98n.onrender.com/metrics/weekly-status', { 
                headers: { Authorization: `Bearer ${token}` } 
            });
            if (!resp.ok) return;
            const data = await resp.json();
            setWeeklyStatus(data.weekly_status || []);
        } catch (e) {
            console.warn('[dashboard] failed to fetch weekly status', e);
        }
    };

    const loadTotals = useCallback(async () => {
        try {
            const stored = await AsyncStorage.getItem("nutritionTotals");
            if (stored) {
                const data = JSON.parse(stored);
                setTotals({
                    calories: Number(data.calories || 0),
                    protein: Number(data.protein || 0),
                    carbs: Number(data.carbs || 0),
                    fat: Number(data.fat || 0),
                    sugar: Number(data.sugar || 0),
                    fiber: Number(data.fiber || 0),
                });
                return;
            }
            // if nothing stored, ensure zeros
            setTotals({ calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 });
        } catch (error) {
            console.error("Error loading totals:", error);
        }
    }, []);

    const loadUser = useCallback(async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            console.log('[dashboard] token from storage:', !!token);
            if (!token) {
                setUsername(null);
                return;
            }
            // Try to decode JWT payload without a library: middle segment base64
            try {
                const parts = token.split('.');
                if (parts.length >= 2) {
                    const payload = parts[1];
                    // base64 decode (handle URL-safe base64)
                    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
                    const json = Buffer.from(b64, 'base64').toString('utf8');
                    const obj = JSON.parse(json);
                    console.log('[dashboard] decoded token payload:', obj);
                    setUsername(obj.username || obj.name || obj.email || null);
                    return;
                }
            } catch (e) {
                console.warn('[dashboard] failed to decode token', e);
            }
            setUsername(null);
        } catch (e) {
            console.error('[dashboard] loadUser error', e);
            setUsername(null);
        }
    }, []);

    // Reload totals when the screen is focused so updates from FoodAdd are picked up
    useFocusEffect(
        useCallback(() => {
            loadTotals();
            loadUser();
            fetchProfileForBmi();
            fetchWeeklyStatus();
        }, [loadTotals])
    );

    // Arbitrary daily goals (adjust as needed)
    const calorieGoal = 2500; // kcal
    const proteinGoal = 150; // grams
    const carbsGoal = 300; // grams
    const fatGoal = 70; // grams
    const sugarGoal = 30; // grams
    const fiberGoal = 25; // grams

    const calorieFill = Math.min(100, (totals.calories / calorieGoal) * 100) || 0;
    const proteinFill = Math.min(100, (totals.protein / proteinGoal) * 100) || 0;
    const carbsFill = Math.min(100, (totals.carbs / carbsGoal) * 100) || 0;
    const fatFill = Math.min(100, (totals.fat / fatGoal) * 100) || 0;
    const sugarFill = Math.min(100, (totals.sugar / sugarGoal) * 100) || 0;
    const fiberFill = Math.min(100, (totals.fiber / fiberGoal) * 100) || 0;

    // Animate pointer when modal opens and bar width is measured
    useEffect(() => {
        if (!showBmiModal || !bmi || barWidth <= 0) return;

        const minBmi = 12;
        const maxBmi = 40;
        const val = Math.max(minBmi, Math.min(maxBmi, Number(bmi)));
        const ratio = (val - minBmi) / (maxBmi - minBmi);
        const target = ratio * barWidth;
        const adjust = -8; // center pointer
        Animated.timing(pointerX, {
            toValue: target + adjust,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, [showBmiModal, barWidth, bmi]);

    const getDotColor = (status: string) => {
        switch (status) {
            case 'achieved': return '#90be6d';  // Green
            case 'not_achieved': return '#f94144';  // Red
            case 'no_data': return '#d0d0d0';  // Grey
            default: return '#d0d0d0';
        }
    };

    return (
        <View style={styles.container}>
            {/* Weekly goal status */}
            {weeklyStatus.length > 0 && (
                <View style={styles.weeklyContainer}>
                    {weeklyStatus.map((day, index) => (
                        <View key={index} style={styles.daySquare}>
                            <Text style={styles.dayName}>{day.day_name}</Text>
                            <View style={[styles.statusDot, { backgroundColor: getDotColor(day.status) }]} />
                        </View>
                    ))}
                </View>
            )}

            {/* Top: Calorie circular progress */}
            <View style={styles.topCard}>
                <AnimatedCircularProgress
                    size={165}
                    width={16}
                    fill={calorieFill}
                    tintColor={totals.calories > calorieGoal ? '#f40000ff' : '#90be6d'}
                    backgroundColor="#f1f1f1"
                    rotation={0}
                    lineCap="round"
                >
                    {(fill: number) => (
                        <View style={styles.calorieInner}>
                            <Text style={styles.calorieValue}>{Math.ceil(totals.calories)} kcal</Text>
                            <Text style={styles.calorieGoal}>/ {calorieGoal} kcal</Text>
                        </View>
                    )}
                </AnimatedCircularProgress>
                <Text style={styles.calorieLabel}>Calories</Text>
            </View>

            {/* Macronutrient circular progress row */}
            <View style={styles.macroRow}>
                <View style={styles.macroItem}>
                    <AnimatedCircularProgress
                        size={90}
                        width={10}
                        fill={proteinFill}
                        tintColor={totals.protein > proteinGoal ? '#f40000ff' : '#4cc9f0'}
                        backgroundColor="#eee"
                        rotation={0}
                        lineCap="round"
                    >
                        {(fill: number) => (
                            <View style={styles.innerCircle}>
                                <Text style={styles.macroValue}>{Math.ceil(totals.protein)}g</Text>
                                <Text style={styles.macroGoal}>/ {proteinGoal}g</Text>
                            </View>
                        )}
                    </AnimatedCircularProgress>
                    <Text style={styles.title}>Protein</Text>
                </View>

                <View style={styles.macroItem}>
                    <AnimatedCircularProgress
                        size={90}
                        width={10}
                        fill={carbsFill}
                        tintColor={totals.carbs > carbsGoal ? '#f40000ff' : '#577590'}
                        backgroundColor="#eee"
                        rotation={0}
                        lineCap="round"
                    >
                        {(fill: number) => (
                            <View style={styles.innerCircle}>
                                <Text style={styles.macroValue}>{Math.ceil(totals.carbs)}g</Text>
                                <Text style={styles.macroGoal}>/ {carbsGoal}g</Text>
                            </View>
                        )}
                    </AnimatedCircularProgress>
                    <Text style={styles.title}>Carbohydrate</Text>
                </View>

                <View style={styles.macroItem}>
                    <AnimatedCircularProgress
                        size={90}
                        width={10}
                        fill={fatFill}
                        tintColor={totals.fat > fatGoal ? '#f40000ff' : '#4cc9f0'}
                        backgroundColor="#eee"
                        rotation={0}
                        lineCap="round"
                    >
                        {(fill: number) => (
                            <View style={styles.innerCircle}>
                                <Text style={styles.macroValue}>{Math.ceil(totals.fat)}g</Text>
                                <Text style={styles.macroGoal}>/ {fatGoal}g</Text>
                            </View>
                        )}
                    </AnimatedCircularProgress>
                    <Text style={styles.title}>Fat</Text>
                </View>
            </View>
            
            {/* Micro-nutrient circular progress row (Sugar & Fiber) */}
            <View style={styles.microRow}>
                <View style={styles.microItem}>
                    <AnimatedCircularProgress
                        size={90}
                        width={10}
                        fill={sugarFill}
                        tintColor={totals.sugar > sugarGoal ? '#f40000ff' : '#577590'}
                        backgroundColor="#eee"
                        rotation={0}
                        lineCap="round"
                    >
                        {(fill: number) => (
                            <View style={styles.innerCircle}>
                                <Text style={styles.macroValue}>{Math.ceil(totals.sugar)}g</Text>
                                <Text style={styles.macroGoal}>/ {sugarGoal}g</Text>
                            </View>
                        )}
                    </AnimatedCircularProgress>
                    <Text style={styles.title}>Sugar</Text>
                </View>

                <View style={styles.microItem}>
                    <AnimatedCircularProgress
                        size={90}
                        width={10}
                        fill={fiberFill}
                        tintColor={totals.fiber > fiberGoal ? '#f40000ff' : '#4cc9f0'}
                        backgroundColor="#eee"
                        rotation={0}
                        lineCap="round"
                    >
                        {(fill: number) => (
                            <View style={styles.innerCircle}>
                                <Text style={styles.macroValue}>{Math.ceil(totals.fiber)}g</Text>
                                <Text style={styles.macroGoal}>/ {fiberGoal}g</Text>
                            </View>
                        )}
                    </AnimatedCircularProgress>
                    <Text style={styles.title}>Fiber</Text>
                </View>
            </View>

            {/* Bottom: action buttons (BMI, Camera, New Feature) */}
            <View style={[styles.actionsRow, { paddingBottom: Math.max(12, insets.bottom) }]}>
                <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonPrimary]}
                    accessibilityLabel="BMI display"
                    onPress={() => {
                        if (!bmi) return;
                        setShowBmiModal(true);
                    }}
                >
                    <Text style={styles.actionTitle}>BMI</Text>
                    <Text style={styles.actionValue}>{bmi ? bmi.toString() : '—'}</Text>
                </TouchableOpacity>

                {/* BMI modal visual */}
                <Modal visible={showBmiModal} transparent animationType="slide" onRequestClose={() => setShowBmiModal(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <Text style={styles.modalTitle}>BMI Visual</Text>
                            {!bmi ? (
                                <Text style={styles.modalText}>BMI not available.</Text>
                            ) : (
                                <View style={{ width: '100%', alignItems: 'center' }}>
                                    <View style={styles.bmiBarContainer} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
                                        <View style={[styles.bmiSegment, { flex: 65, backgroundColor: '#8ecae6' }]} />
                                        <View style={[styles.bmiSegment, { flex: 65, backgroundColor: '#90be6d' }]} />
                                        <View style={[styles.bmiSegment, { flex: 50, backgroundColor: '#ffd166' }]} />
                                        <View style={[styles.bmiSegment, { flex: 100, backgroundColor: '#f94144' }]} />

                                        {barWidth > 0 && (
                                            <Animated.View style={[styles.pointer, { transform: [{ translateX: pointerX }] }]}>
                                                <View style={styles.pointerCircle} />
                                                <View style={styles.pointerLine} />
                                            </Animated.View>
                                        )}
                                    </View>

                                    <View style={styles.bmiLabelsRow}>
                                        <View style={{ flex: 65, alignItems: 'center' }}>
                                            <Text style={styles.bmiLabel}>Underweight
                                                <Text style={styles.bmiLabelSmall}>{'\n< 18.5'}</Text>
                                            </Text>
                                        </View>
                                        <View style={{ flex: 65, alignItems: 'center' }}>
                                            <Text style={styles.bmiLabel}>Normal
                                                <Text style={styles.bmiLabelSmall}>{'\n18.5–24.9'}</Text>
                                            </Text>
                                        </View>
                                        <View style={{ flex: 50, alignItems: 'center' }}>
                                            <Text style={styles.bmiLabel}>Overweight
                                                <Text style={styles.bmiLabelSmall}>{'\n25–29.9'}</Text>
                                            </Text>
                                        </View>
                                        <View style={{ flex: 100, alignItems: 'center' }}>
                                            <Text style={styles.bmiLabel}>Obesity
                                                <Text style={styles.bmiLabelSmall}>{'\n≥ 30'}</Text>
                                            </Text>
                                        </View>
                                    </View>

                                    <Text style={styles.modalText}><Text style={styles.modalTextBold}>Your BMI: </Text><Text style={styles.modalTextBold}>{bmi}</Text></Text>
                                </View>
                            )}

                            <Pressable style={styles.closeButton} onPress={() => setShowBmiModal(false)}>
                                <Text style={styles.closeButtonText}>Close</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>

                <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSecondary]}
                    onPress={() => router.push('/camera')}
                    accessibilityLabel="Open camera"
                >
                    <MaterialIcons name="photo-camera" size={40} color="#000" style={{ opacity: 0.75 }} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSecondary]}
                    onPress={() => router.push({ pathname: '/camera', params: { mode: 'raw_ingredients' } })}
                    accessibilityLabel="Open raw ingredients scanner"
                >
                    <Image 
                        source={require('../cooking_logo.png')} 
                        style={{ width: 70, height: 70, opacity: 0.85 }}
                        resizeMode="contain"
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default Dashboard;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: "#fff",
        justifyContent: "space-between",
    },

    // === Weekly Status ===
    weeklyContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    daySquare: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 42,
        height: 50,
        backgroundColor: '#fff',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 2,
    },
    dayName: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
        marginBottom: 6,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },

    // === Top Card ===
    topCard: {
        backgroundColor: "#fff",
        borderRadius: 20,
        paddingVertical: 30,
        alignItems: "center",
        marginBottom: 1,
    },
    topTitle: {
        fontSize: 28,
        fontWeight: "700",
        color: "#333",
    },
    topValue: {
        fontSize: 20,
        color: "#555",
        marginTop: 6,
    },

    // === Macro row / circular progress ===
    macroRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    macroItem: {
        width: 100,
        alignItems: 'center',
        marginHorizontal: 10,
    },
    innerCircle: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    macroValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#333',
    },
    macroGoal: {
        fontSize: 12,
        color: '#666',
    },

    // === Calorie circular inner ===
    calorieInner: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    calorieValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#333',
        marginTop: 4,
    },
    calorieGoal: {
        fontSize: 12,
        color: '#666',
    },

    calorieLabel: {
        fontSize: 22,
        fontWeight: '700',
        color: '#333',
        marginTop: 10,
        textAlign: 'center',
    },

    // === Micro row for sugar & fiber ===
    microRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 60,
        gap: 10,
    },
    microItem: {
        alignItems: 'center',
        width: '45%',
        marginHorizontal: 6,
    },

    // === Middle Grid ===
    middleGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        marginBottom: 20,
    },
    gridItem: {
        width: "30%", // 3 per row
        backgroundColor: "#f1f1f1",
        borderRadius: 15,
        paddingVertical: 20,
        marginBottom: 15,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
        color: "#333",
        textAlign: "center",
    },
    value: {
        fontSize: 14,
        color: "#666",
        textAlign: "center",
    },

    // === Actions row (three buttons) ===
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 15,
        marginBottom: 12,
        gap: 10,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 0,
        height: 77,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 9,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 3,
    },
    actionButtonPrimary: {
        backgroundColor: '#90be6d',
    },
    actionButtonSecondary: {
        backgroundColor: '#f1f1f1',
    },
    actionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#000',
    },
    actionValue: {
        fontSize: 14,
        color: '#000',
        marginTop: 6,
    },

    // === Bottom Card ===
    bottomCard: {
        backgroundColor: "#90be6d",
        borderRadius: 20,
        paddingVertical: 25,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    bottomTitle: {
        fontSize: 24,
        fontWeight: "700",
        color: "#000000",
    },
    bottomValue: {
        fontSize: 18,
        color: "#000000",
        marginTop: 6,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 18,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
        color: '#111',
    },
    modalText: {
        fontSize: 13,
        color: '#333',
        textAlign: 'center',
        marginVertical: 8,
    },
    modalTextBold: {
        fontSize: 13,
        color: '#111',
        fontWeight: '700',
    },
    bmiBarContainer: {
        width: '100%',
        height: 36,
        flexDirection: 'row',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        marginVertical: 12,
    },
    bmiSegment: {
        height: '100%',
    },
    pointer: {
        position: 'absolute',
        top: -22,
        left: 0,
        width: 16,
        alignItems: 'center',
    },
    pointerCircle: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#333',
    },
    pointerLine: {
        width: 2,
        height: 38,
        backgroundColor: '#333',
        marginTop: 2,
    },
    bmiLabelsRow: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    bmiLabel: {
        fontSize: 10,
        color: '#333',
        textAlign: 'center',
        fontWeight: '700',
    },
    bmiLabelSmall: {
        fontSize: 11,
        color: '#555',
        textAlign: 'center',
        lineHeight: 14,
    },
    closeButton: {
        marginTop: 12,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: '#90be6d',
        borderRadius: 8,
    },
    closeButtonText: {
        color: '#fff',
        fontWeight: '700',
    },
});

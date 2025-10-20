import React from 'react';
import { Text, View, StyleSheet, TouchableOpacity } from "react-native";
import { useState, useCallback } from "react";
// react-native-circular-progress may not include TypeScript types in this project.
// Use a ts-ignore to avoid a compile-time error; consider installing types or
// adding a declaration file if you want stricter typing.
// @ts-ignore
import { AnimatedCircularProgress } from 'react-native-circular-progress';
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from 'expo-router';
import { Buffer } from 'buffer';
import { styleText } from 'util';

const Dashboard = () => {
    // Start from zeros and load stored totals (replace, don't add to defaults)
    const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 });
    const [username, setUsername] = useState<string | null>(null);

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

    return (
        <View style={styles.container}>
            {/* Top: Calorie circular progress */}
            <View style={styles.topCard}>
                <AnimatedCircularProgress
                    size={180}
                    width={14}
                    fill={calorieFill}
                    tintColor="#90be6d"
                    backgroundColor="#f1f1f1"
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
                        size={100}
                        width={8}
                        fill={proteinFill}
                        tintColor="lightblue"
                        backgroundColor="#eee"
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
                        size={100}
                        width={8}
                        fill={carbsFill}
                        tintColor="#577590"
                        backgroundColor="#eee"
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
                        size={100}
                        width={8}
                        fill={fatFill}
                        tintColor="#f3722c"
                        backgroundColor="#eee"
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

            {/* Sugar & Fiber row (below macros) */}
            <View style={styles.microRow}>
                <View style={styles.microItem}>
                    <AnimatedCircularProgress
                        size={100}
                        width={8}
                        fill={sugarFill}
                        tintColor="#f3722c"
                        backgroundColor="#eee"
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
                        size={100}
                        width={8}
                        fill={fiberFill}
                        tintColor="#577590"
                        backgroundColor="#eee"
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

            {/* Bottom: BMI card (kept) */}
            <View style={styles.bottomCard}>
                <Text style={styles.bottomTitle}>BMI</Text>
                <Text style={styles.bottomValue}>22.5</Text>
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

    // === Top Card ===
    topCard: {
        backgroundColor: "#fff",
        borderRadius: 20,
        paddingVertical: 30,
        alignItems: "center",
        marginBottom: 20,
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
        width: 110,
        alignItems: 'center',
        marginHorizontal: 8,
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
        marginTop: 6,
    },
    calorieGoal: {
        fontSize: 12,
        color: '#666',
    },

    calorieLabel: {
        fontSize: 30,
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
        marginBottom: 24,
        paddingHorizontal: 50,
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
        color: "#fff",
    },
    bottomValue: {
        fontSize: 18,
        color: "#fff",
        marginTop: 6,
    },
});

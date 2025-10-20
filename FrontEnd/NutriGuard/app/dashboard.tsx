/*import { Text, View, StyleSheet } from "react-native";

const Dashboard = () => {
    return (
        <View style={styles.container}>
            <View style={styles.top}>
                <Text style={styles.title}>Calorie</Text>
                <Text style={styles.stat}>Protein</Text>
                <Text style={styles.stat}>Carbohydrate</Text>
                <Text style={styles.stat}>Fat</Text>
                <Text style={styles.stat}>Sugar</Text>
                <Text style={styles.stat}>Fiber</Text>
            </View>

            <View style={styles.bottom}>
                <View style={styles.card}>
                    <Text style={styles.cardText}>BMI</Text>
                </View>
            </View>
        </View>
    );
};

export default Dashboard;
const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#fff',
        justifyContent: 'space-between',
    },
    top: {
        // takes remaining space above the bottom card
    },
    bottom: {
        // bottom container; card will sit at the bottom because parent uses space-between
    },
    title: {
        fontSize: 40,
        textAlign: 'center',
        marginBottom: 8,
    },
    stat: {
        fontSize: 20,
        textAlign: 'center',
        marginBottom: 4,
    },
    card: {
        backgroundColor: 'lightgrey',
        padding: 20,
        borderRadius: 20,
        // cross-platform shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardText: {
        fontSize: 18,
        textAlign: 'center',
        fontWeight: '600',
    },
});*/

import { Text, View, StyleSheet } from "react-native";
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const Dashboard = () => {
    const [totals, setTotals] = useState({ calories: 2200, protein: 80, carbs: 250, fat: 70, sugar: 50, fiber: 25 });

    useEffect(() => {
        const loadTotals = async () => {
            try {
                const stored = await AsyncStorage.getItem("nutritionTotals");
                if (stored) {
                    const data = JSON.parse(stored);
                    setTotals(prev => ({
                        calories: prev.calories + (data.calories || 0),
                        protein: prev.protein + (data.protein || 0),
                        carbs: prev.carbs + (data.carbs || 0),
                        fat: prev.fat + (data.fat || 0),
                        sugar: prev.sugar + (data.sugar || 0),
                        fiber: prev.fiber + (data.fiber || 0),
                    }));
                }
            } catch (error) {
                console.error("Error loading totals:", error);
            }
        };
        loadTotals();
    }, []);

    return (
        <View style={styles.container}>
            {/* Top: Calorie Card */}
            <View style={styles.topCard}>
                <Text style={styles.topTitle}>Calorie</Text>
                <Text style={styles.topValue}>{totals.calories} kcal</Text>
            </View>

            {/* Middle: 3 per row grid */}
            <View style={styles.middleGrid}>
                <View style={styles.gridItem}>
                    <Text style={styles.title}>Protein</Text>
                    <Text style={styles.value}>{totals.protein} g</Text>
                </View>
                <View style={styles.gridItem}>
                    <Text style={styles.title}>Carbohydrate</Text>
                    <Text style={styles.value}>{totals.carbs} g</Text>
                </View>
                <View style={styles.gridItem}>
                    <Text style={styles.title}>Fat</Text>
                    <Text style={styles.value}>{totals.fat} g</Text>
                </View>
                <View style={styles.gridItem}>
                    <Text style={styles.title}>Sugar</Text>
                    <Text style={styles.value}>{totals.sugar} g</Text>
                </View>
                <View style={styles.gridItem}>
                    <Text style={styles.title}>Fiber</Text>
                    <Text style={styles.value}>{totals.fiber} g</Text>
                </View>
            </View>

            {/* Bottom: BMI card */}
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
        backgroundColor: "#f9c74f",
        borderRadius: 20,
        paddingVertical: 30,
        alignItems: "center",
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 4,
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

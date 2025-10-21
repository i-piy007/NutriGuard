import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function FoodAddScreen() {
  const insets = useSafeAreaInsets();
  const { imageUrl, itemName, nutrition } = useLocalSearchParams();
  console.log('FoodAddScreen route params:', { imageUrl, itemName, nutritionPreview: nutrition ? (typeof nutrition === 'string' ? nutrition.slice(0, 120) + '...' : JSON.stringify(nutrition).slice(0,120) + '...') : null });

  const nutritionData = nutrition ? JSON.parse(nutrition as string) : null;

  // Compute macro totals (calories, protein, carbs, fat) across returned items
  const macroTotals = React.useMemo(() => {
    const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    if (!nutritionData || !nutritionData.items) {
      console.log('Parsed nutrition in FoodAddScreen: null or no items', nutritionData);
      return totals;
    }
    for (const it of nutritionData.items) {
      totals.calories += Number(it.calories || 0);
      totals.protein_g += Number(it.protein_g || 0);
      totals.carbs_g += Number(it.carbohydrates_total_g || 0);
      totals.fat_g += Number(it.fat_total_g || 0);
    }
    // Round up to remove decimals
    const rounded = {
      calories: Math.ceil(totals.calories),
      protein_g: Math.ceil(totals.protein_g),
      carbs_g: Math.ceil(totals.carbs_g),
      fat_g: Math.ceil(totals.fat_g),
    };
    console.log('Computed macroTotals in FoodAddScreen (rounded up):', rounded);
    return rounded;
  }, [nutritionData]);

  const handleAdd = async () => {
    try {
      // Get existing totals
      const stored = await AsyncStorage.getItem("nutritionTotals");
      const totals = stored ? JSON.parse(stored) : { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 };

      // Add current nutrition: sum floats then round up before adding to stored totals
      if (nutritionData && nutritionData.items) {
        const add = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 };
        nutritionData.items.forEach((item: any) => {
          add.calories += Number(item.calories || 0);
          add.protein += Number(item.protein_g || 0);
          add.carbs += Number(item.carbohydrates_total_g || 0);
          add.fat += Number(item.fat_total_g || 0);
          add.sugar += Number(item.sugar_g || 0);
          add.fiber += Number(item.fiber_g || 0);
        });
        // Round up each aggregated field
        add.calories = Math.ceil(add.calories);
        add.protein = Math.ceil(add.protein);
        add.carbs = Math.ceil(add.carbs);
        add.fat = Math.ceil(add.fat);
        add.sugar = Math.ceil(add.sugar);
        add.fiber = Math.ceil(add.fiber);

        totals.calories += add.calories;
        totals.protein += add.protein;
        totals.carbs += add.carbs;
        totals.fat += add.fat;
        totals.sugar += add.sugar;
        totals.fiber += add.fiber;
      }

      // Save updated totals locally
      await AsyncStorage.setItem("nutritionTotals", JSON.stringify(totals));
      console.log("Updated totals:", totals);

      // Also POST the metrics to backend if user is logged in
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const saveBody = { day: new Date().toISOString().slice(0, 10), nutrition: nutritionData };
          const resp = await fetch('https://nutriguard-n98n.onrender.com/metrics/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(saveBody),
          });
          const j = await resp.json();
          console.log('Saved metrics server response:', j);
        }
      } catch (e) {
        console.warn('Failed to save metrics to server:', e);
      }

      // After saving, navigate to the dashboard to show updated totals
      try {
        router.replace('/dashboard');
      } catch (navErr) {
        // Fallback to back if replace fails for some reason
        console.warn('router.replace failed, falling back to back()', navErr);
        router.back();
      }
    } catch (error) {
      console.error("Error saving data:", error);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.container}>
      <Text style={styles.title}>Food Identified</Text>
      {imageUrl && <Image source={{ uri: imageUrl as string }} style={styles.image} />}
      <Text style={styles.itemName}>{itemName}</Text>

      {/* Macro summary */}
      <View style={styles.macroSummary}>
        <Text style={styles.macroTitle}>Macro breakdown</Text>
        <View style={styles.macroRow}>
          <Text style={styles.macroLabel}>Calories</Text>
          <Text style={styles.macroValue}>{Math.round(macroTotals.calories)} kcal</Text>
        </View>
        <View style={styles.macroRow}>
          <Text style={styles.macroLabel}>Protein</Text>
          <Text style={styles.macroValue}>{Math.round(macroTotals.protein_g)} g</Text>
        </View>
        <View style={styles.macroRow}>
          <Text style={styles.macroLabel}>Carbs</Text>
          <Text style={styles.macroValue}>{Math.round(macroTotals.carbs_g)} g</Text>
        </View>
        <View style={styles.macroRow}>
          <Text style={styles.macroLabel}>Fat</Text>
          <Text style={styles.macroValue}>{Math.round(macroTotals.fat_g)} g</Text>
        </View>
      </View>

      {nutritionData && nutritionData.items && nutritionData.items.length > 0 && (
        <View style={styles.nutritionContainer}>
          {nutritionData.items.map((item: any, index: number) => (
            <View key={index} style={styles.nutritionItem}>
              <Text style={styles.nutritionTitle}>{item.name}</Text>
              <Text>Calories: {item.calories}</Text>
              <Text>Protein: {item.protein_g}g</Text>
              <Text>Carbs: {item.carbohydrates_total_g}g</Text>
              <Text>Fat: {item.fat_total_g}g</Text>
              <Text>Sugar: {item.sugar_g}g</Text>
              <Text>Fiber: {item.fiber_g}g</Text>
            </View>
          ))}
        </View>
      )}

      </ScrollView>

      {/* Floating add button placed above navigation bar and content */}
      <SafeAreaView
        edges={["bottom"]}
        style={[
          styles.floatingSafeArea,
          { paddingBottom: Math.max(12, insets.bottom) }
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAdd}
        >
          <Text style={styles.addButtonText}>Add to Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  itemName: {
    fontSize: 20,
    textAlign: "center",
    marginBottom: 16,
  },
  nutritionContainer: {
    marginBottom: 16,
  },
  nutritionItem: {
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  nutritionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  addButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: 8,
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  macroSummary: {
    backgroundColor: "#fff7e6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  macroTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  macroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  macroLabel: {
    fontSize: 14,
    color: "#333",
  },
  macroValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  scrollContent: {
    paddingBottom: 150, // space for floating button
  },
  floatingSafeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 999,
    elevation: 12,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
  },
});
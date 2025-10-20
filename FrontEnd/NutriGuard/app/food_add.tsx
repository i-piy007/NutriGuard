import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function FoodAddScreen() {
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
    console.log('Computed macroTotals in FoodAddScreen:', totals);
    return totals;
  }, [nutritionData]);

  const handleAdd = async () => {
    try {
      // Get existing totals
      const stored = await AsyncStorage.getItem("nutritionTotals");
      const totals = stored ? JSON.parse(stored) : { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 };

      // Add current nutrition
      if (nutritionData && nutritionData.items) {
        nutritionData.items.forEach((item: any) => {
          totals.calories += item.calories || 0;
          totals.protein += item.protein_g || 0;
          totals.carbs += item.carbohydrates_total_g || 0;
          totals.fat += item.fat_total_g || 0;
          totals.sugar += item.sugar_g || 0;
          totals.fiber += item.fiber_g || 0;
        });
      }

      // Save updated totals
      await AsyncStorage.setItem("nutritionTotals", JSON.stringify(totals));
      console.log("Updated totals:", totals);
      router.back();
    } catch (error) {
      console.error("Error saving data:", error);
    }
  };

  return (
    <ScrollView style={styles.container}>
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

      <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
        <Text style={styles.addButtonText}>Add to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
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
    borderRadius: 8,
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 18,
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
});
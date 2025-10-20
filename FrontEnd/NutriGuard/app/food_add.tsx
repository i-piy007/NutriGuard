import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function FoodAddScreen() {
  const { imageUrl, itemName, nutrition } = useLocalSearchParams();

  const nutritionData = nutrition ? JSON.parse(nutrition as string) : null;

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
});
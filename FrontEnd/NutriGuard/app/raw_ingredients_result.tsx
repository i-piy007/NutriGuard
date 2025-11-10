import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

export default function RawIngredientsResult() {
  const params = useLocalSearchParams();
  const imageUrl = params.imageUrl as string;

  type Dish = { name: string; description?: string; image_url?: string | null; steps?: string[]; nutrition?: any; ingredients?: string[] };

  const parseIngredientsFromText = (text: string): string[] => {
    try {
      const lines = String(text).split(/\r?\n/);
      const out: string[] = [];
      let inSection = false;
      for (const line of lines) {
        if (/^\s*ingredients\s*found/i.test(line)) { inSection = true; continue; }
        if (/^\s*suggested\s*dishes/i.test(line)) { inSection = false; }
        if (inSection) {
          const m = line.match(/^\s*[-•]\s*(.+)$/);
          if (m && m[1]) out.push(m[1].trim());
        }
      }
      return out;
    } catch { return []; }
  };

  const parseDishesFromText = (text: string): Dish[] => {
    try {
      const lines = String(text).split(/\r?\n/);
      const out: Dish[] = [];
      let inSection = false;
      for (const line of lines) {
        if (/^\s*suggested\s*dishes/i.test(line)) { inSection = true; continue; }
        if (!inSection) continue;
        const m = line.match(/^\s*\d+\.\s*(.+?)\s*:\s*(.+)$/);
        if (m) {
          out.push({ name: m[1].trim(), description: m[2].trim() });
        }
      }
      // If nothing matched numbered list, fallback: split by line and take before colon as name
      if (out.length === 0) {
        for (const line of lines) {
          const m2 = line.match(/^\s*(.+?)\s*:\s*(.+)$/);
          if (m2) out.push({ name: m2[1].trim(), description: m2[2].trim() });
        }
      }
      return out;
    } catch { return []; }
  };

  const ingredients = useMemo(() => {
    try {
      if (!params.ingredients) return [];
      const parsed = JSON.parse(String(params.ingredients));
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'string') return parseIngredientsFromText(parsed);
      return [];
    } catch {
      return parseIngredientsFromText(String(params.ingredients));
    }
  }, [params.ingredients]);

  const dishes: Dish[] = useMemo(() => {
    try {
      if (!params.dishes) return [];
      const parsed = JSON.parse(String(params.dishes));
      if (Array.isArray(parsed)) return parsed as Dish[];
      if (typeof parsed === 'string') return parseDishesFromText(parsed);
      return [];
    } catch {
      return parseDishesFromText(String(params.dishes));
    }
  }, [params.dishes]);

  return (
    <ScrollView style={styles.container}>
      {/* Header with captured image */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Raw Ingredients Analysis</Text>
        {imageUrl && (
          <Image 
            source={{ uri: imageUrl }} 
            style={styles.capturedImage}
            resizeMode="cover"
          />
        )}
      </View>

      {/* Ingredients Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="kitchen" size={24} color="#90be6d" />
          <Text style={styles.sectionTitle}>Ingredients Found</Text>
        </View>
        {ingredients.length > 0 ? (
          <View style={styles.ingredientsList}>
            {ingredients.map((ingredient: string, index: number) => (
              <View key={index} style={styles.ingredientChip}>
                <MaterialIcons name="check-circle" size={16} color="#90be6d" />
                <Text style={styles.ingredientText}>{ingredient}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No ingredients detected</Text>
        )}
      </View>

      {/* Suggested Dishes Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="restaurant" size={24} color="#4cc9f0" />
          <Text style={styles.sectionTitle}>Suggested Dishes</Text>
        </View>
        {Array.isArray(dishes) && dishes.length > 0 ? (
          dishes.map((dish: any, index: number) => (
            <Pressable key={index} style={styles.dishCard} onPress={() => {
              try {
                router.push({ pathname: '/recipe_detail', params: { dish: JSON.stringify(dish) } });
              } catch {
                router.push('/recipe_detail');
              }
            }}>
              {dish.image_url && (
                <Image 
                  source={{ uri: dish.image_url }} 
                  style={styles.dishImage}
                  resizeMode="cover"
                />
              )}
              <View style={styles.dishContent}>
                <Text style={styles.dishName}>{dish.name}</Text>
                <Text style={styles.dishDescription}>{dish.description}</Text>
              </View>
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyText}>No dish suggestions available</Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => router.push('/camera')}
        >
          <MaterialIcons name="photo-camera" size={20} color="#000" />
          <Text style={styles.buttonText}>Scan Again</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => router.push('/dashboard')}
        >
          <MaterialIcons name="home" size={20} color="#fff" />
          <Text style={[styles.buttonText, styles.buttonTextWhite]}>Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  capturedImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginTop: 8,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginLeft: 8,
  },
  ingredientsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ingredientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f8f4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#90be6d',
    gap: 6,
  },
  ingredientText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  dishCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  dishImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#e0e0e0',
  },
  dishContent: {
    padding: 12,
  },
  dishName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
  },
  dishDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  buttonPrimary: {
    backgroundColor: '#90be6d',
  },
  buttonSecondary: {
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  buttonTextWhite: {
    color: '#fff',
  },
});

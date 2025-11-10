import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

interface Dish {
  name: string;
  description?: string;
  image_url?: string | null;
  steps?: string[];
  nutrition?: Record<string, any>;
  ingredients?: string[];
}

export default function RecipeDetail() {
  const params = useLocalSearchParams();
  const dish: Dish | null = useMemo(() => {
    try {
      if (params.dish) {
        return JSON.parse(String(params.dish));
      }
    } catch {}
    return null;
  }, [params.dish]);

  if (!dish) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.empty}>No recipe data.</Text>
      </View>
    );
  }

  const macroOrder = ['calories','protein','carbohydrates','fat','sugar','fiber'];
  const nutrition = dish.nutrition || {};

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {dish.image_url && (
        <Image source={{ uri: dish.image_url }} style={styles.hero} resizeMode="cover" />
      )}
      <View style={styles.headerBlock}>
        <Text style={styles.title}>{dish.name}</Text>
        {dish.description ? <Text style={styles.subtitle}>{dish.description}</Text> : null}
      </View>

      {/* Nutrition Section */}
      {Object.keys(nutrition).length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="restaurant" size={22} color="#90be6d" />
            <Text style={styles.sectionTitle}>Nutrition</Text>
          </View>
          {macroOrder.filter(k => nutrition[k] != null).length === 0 ? (
            <Text style={styles.emptySmall}>No macro data available</Text>
          ) : (
            macroOrder.filter(k => nutrition[k] != null).map(key => (
              <View key={key} style={styles.macroRow}>
                <Text style={styles.macroKey}>{key.charAt(0).toUpperCase()+key.slice(1)}</Text>
                <Text style={styles.macroValue}>{nutrition[key]}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {/* Ingredients */}
      {dish.ingredients && dish.ingredients.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="kitchen" size={22} color="#4cc9f0" />
            <Text style={styles.sectionTitle}>Ingredients</Text>
          </View>
          {dish.ingredients.map((ing, i) => (
            <View key={i} style={styles.ingredientRow}>
              <MaterialIcons name="check" size={16} color="#90be6d" />
              <Text style={styles.ingredientText}>{ing}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Steps */}
      {dish.steps && dish.steps.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="format-list-numbered" size={22} color="#f8961e" />
            <Text style={styles.sectionTitle}>Steps</Text>
          </View>
          {dish.steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{i+1}</Text></View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 16, color: '#666' },
  hero: { width: '100%', height: 240, backgroundColor: '#eee' },
  headerBlock: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#222', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#555', lineHeight: 20 },
  section: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  macroKey: { fontSize: 14, fontWeight: '600', color: '#444' },
  macroValue: { fontSize: 14, fontWeight: '500', color: '#222' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  ingredientText: { fontSize: 14, color: '#333', flex: 1 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  stepBadge: { backgroundColor: '#90be6d', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: '#fff', fontWeight: '700' },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  emptySmall: { fontSize: 13, color: '#999', fontStyle: 'italic' },
});

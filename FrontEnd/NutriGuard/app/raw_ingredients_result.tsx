import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Pressable, useWindowDimensions, Switch } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

export default function RawIngredientsResult() {
  const params = useLocalSearchParams();
  const imageUrl = params.imageUrl as string;
  const fromHistory = params.fromHistory as string; // Flag to indicate if opened from history

  type Dish = { name: string; description?: string; justification?: string; image_url?: string | null; steps?: string[]; nutrition?: any; ingredients?: string[] };

  // Save to history on mount (once) - but only if not opened from history
  React.useEffect(() => {
    (async () => {
      try {
        // Don't save to history if we're viewing from history
        if (fromHistory === 'true') {
          console.log('Skipping history save - opened from history');
          return;
        }
        
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const token = await AsyncStorage.getItem('token');
        if (token && params.ingredients && params.dishes) {
          await fetch('https://nutriguard-n98n.onrender.com/history/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              image_url: imageUrl,
              scan_type: 'raw_ingredients',
              result_json: JSON.stringify({ ingredients: params.ingredients, dishes: params.dishes })
            })
          });
          console.log('Saved raw ingredients scan to history');
        }
      } catch (err) {
        console.warn('Failed to save raw ingredients to history:', err);
      }
    })();
  }, []);

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

  // Responsive filter panel state
  const { width } = useWindowDimensions();
  const [showFilters, setShowFilters] = useState(false);
  const [filterTimes, setFilterTimes] = useState({
    breakfast: true,
    lunch: true,
    snacks: true,
    dinner: true,
  });
  // Age filter: single-select string ('child' | 'adult' | 'old')
  const [filterAge, setFilterAge] = useState<string | null>('adult');
  // Diabetes toggle similar to profile (boolean)
  const [filterDiabetic, setFilterDiabetic] = useState(false);
  // Filtered dishes state and loading
  const [filteredDishes, setFilteredDishes] = useState<Dish[] | null>(null);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  const applyFilters = async () => {
    try {
      setIsLoadingFilters(true);
      
      // Build filter object with selected times
      const selectedTimes = Object.entries(filterTimes)
        .filter(([_, selected]) => selected)
        .map(([time]) => time);
      
      const filterData = {
        ingredients,
        times: selectedTimes,
        age: filterAge,
        diabetic: filterDiabetic,
      };
      
      console.log('Applying filters:', filterData);
      
      // Read token for auth-aware defaults on backend
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage.getItem('token');
      const response = await fetch('https://nutriguard-n98n.onrender.com/suggest-dishes-with-filters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(filterData),
      });
      
      if (!response.ok) {
        throw new Error(`Filter request failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Filtered dishes response:', data);
      
      // Update filtered dishes
      if (data.dishes && Array.isArray(data.dishes)) {
        setFilteredDishes(data.dishes);
      }
      
      // Close filter panel on mobile
      setShowFilters(false);
    } catch (error) {
      console.error('Error applying filters:', error);
      alert('Failed to apply filters. Please try again.');
    } finally {
      setIsLoadingFilters(false);
    }
  };

  const clearFilters = () => {
    setFilterTimes({ breakfast: true, lunch: true, snacks: true, dinner: true });
    setFilterAge('adult');
    setFilterDiabetic(false);
    setFilteredDishes(null);
  };

  // Auto-apply default filters once on initial load (not when opened from history)
  const autoAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoAppliedRef.current) return;
    if (fromHistory === 'true') return;
    if (ingredients.length === 0) return;
    autoAppliedRef.current = true;
    // Apply default filters to get tailored dishes for the first render
    applyFilters();
  }, [fromHistory, ingredients]);

  // Use filtered dishes if available, otherwise use original dishes
  const displayDishes = filteredDishes !== null ? filteredDishes : dishes;

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

      {/* Ingredients Section with right-side Filter Panel */}
      <View style={[styles.section, styles.sectionWithFilters]}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="kitchen" size={24} color="#90be6d" />
          <Text style={styles.sectionTitle}>Ingredients Found</Text>
          {/* Filters button for small screens (opens a selection panel) */}
          {width < 700 && (
            <TouchableOpacity style={styles.filterToggleButton} onPress={() => setShowFilters(s => !s)}>
              <MaterialIcons name="filter-list" size={22} color="#333" />
              <Text style={styles.filterToggleText}>Filters</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.rowContainer, width >= 700 ? styles.row : styles.column]}>
          <View style={styles.leftColumn}>
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

            {/* Keep Suggested Dishes under the ingredients in the left column */}
            <View style={{ marginTop: 12 }}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="restaurant" size={20} color="#4cc9f0" />
                <Text style={[styles.sectionTitle, { fontSize: 16, marginLeft: 8 }]}>Suggested Dishes</Text>
                {filteredDishes !== null && (
                  <Text style={styles.filteredBadge}>(Filtered)</Text>
                )}
              </View>
              {isLoadingFilters ? (
                <Text style={styles.emptyText}>Loading filtered dishes...</Text>
              ) : Array.isArray(displayDishes) && displayDishes.length > 0 ? (
                displayDishes.map((dish: any, index: number) => (
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
                      {dish.description && (
                        <Text style={styles.dishDescription}>{dish.description}</Text>
                      )}
                      {dish.justification && (
                        <View style={styles.justificationContainer}>
                          <MaterialIcons name="info-outline" size={16} color="#4cc9f0" />
                          <Text style={styles.justificationText}>{dish.justification}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.emptyText}>No dish suggestions available</Text>
              )}
            </View>
          </View>

          {/* Filter Panel (side panel on wide screens) */}
          {width >= 700 && (
            <View style={styles.filterPanel}>
              <View style={styles.filterHeader}>
                <MaterialIcons name="tune" size={20} color="#333" />
                <Text style={styles.filterTitle}>Filters</Text>
              </View>

              {/* Time selection (Breakfast / Lunch / Snacks / Dinner) */}
              <View style={{ marginVertical: 6 }}>
                <Text style={styles.filterSectionLabel}>Time</Text>
                <View style={styles.timeOptions}>
                  {[
                    { key: 'breakfast', label: 'Breakfast' },
                    { key: 'lunch', label: 'Lunch' },
                    { key: 'snacks', label: 'Snacks' },
                    { key: 'dinner', label: 'Dinner' },
                  ].map(opt => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.timeChip,
                        filterTimes[opt.key as keyof typeof filterTimes] ? styles.timeChipActive : null,
                      ]}
                      onPress={() => setFilterTimes(t => ({ ...t, [opt.key]: !t[opt.key as keyof typeof t] }))}
                    >
                      <Text style={[styles.timeChipText, filterTimes[opt.key as keyof typeof filterTimes] ? styles.timeChipTextActive : null]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Age selection (Child / Adult / Old) - single select */}
              <View style={{ marginVertical: 6 }}>
                <Text style={styles.filterSectionLabel}>Age</Text>
                <View style={styles.timeOptions}>
                  {[
                    { key: 'child', label: 'Child' },
                    { key: 'adult', label: 'Adult' },
                    { key: 'Senior', label: 'Senior' },
                  ].map(opt => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.timeChip,
                        filterAge === opt.key ? styles.timeChipActive : null,
                      ]}
                      onPress={() => setFilterAge(prev => (prev === opt.key ? null : opt.key))}
                    >
                      <Text style={[styles.timeChipText, filterAge === opt.key ? styles.timeChipTextActive : null]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Diabetes toggle (like profile) */}
              <View style={styles.filterOption}>
                <Text style={styles.filterLabel}>Diabetic</Text>
                <Switch value={filterDiabetic} onValueChange={setFilterDiabetic} />
              </View>

              <View style={styles.filterActions}>
                <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={clearFilters}>
                  <Text style={styles.buttonText}>Clear</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={applyFilters} disabled={isLoadingFilters}>
                  <Text style={[styles.buttonText, styles.buttonTextWhite]}>{isLoadingFilters ? 'Loading...' : 'Apply'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Mobile overlay panel (bottom sheet style) */}
          {width < 700 && showFilters && (
            <View style={styles.modalBackdrop}>
              {/* Left drawer panel first, backdrop to the right */}
              <View style={styles.modalPanel}>
                <View style={styles.modalHeader}>
                  <Text style={styles.filterTitle}>Filters</Text>
                  <TouchableOpacity onPress={() => setShowFilters(false)}>
                    <MaterialIcons name="close" size={22} color="#333" />
                  </TouchableOpacity>
                </View>

                {/* Time selection (Breakfast / Lunch / Snacks / Dinner) */}
                <View style={{ marginVertical: 6 }}>
                  <Text style={styles.filterSectionLabel}>Time</Text>
                  <View style={styles.timeOptions}>
                    {[
                      { key: 'breakfast', label: 'Breakfast' },
                      { key: 'lunch', label: 'Lunch' },
                      { key: 'snacks', label: 'Snacks' },
                      { key: 'dinner', label: 'Dinner' },
                    ].map(opt => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.timeChip,
                          filterTimes[opt.key as keyof typeof filterTimes] ? styles.timeChipActive : null,
                        ]}
                        onPress={() => setFilterTimes(t => ({ ...t, [opt.key]: !t[opt.key as keyof typeof t] }))}
                      >
                        <Text style={[styles.timeChipText, filterTimes[opt.key as keyof typeof filterTimes] ? styles.timeChipTextActive : null]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Age selection (Child / Adult / Old) - single select */}
                <View style={{ marginVertical: 6 }}>
                  <Text style={styles.filterSectionLabel}>Age</Text>
                  <View style={styles.timeOptions}>
                    {[
                      { key: 'child', label: 'Child' },
                      { key: 'adult', label: 'Adult' },
                      { key: 'old', label: 'Old' },
                    ].map(opt => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.timeChip,
                          filterAge === opt.key ? styles.timeChipActive : null,
                        ]}
                        onPress={() => setFilterAge(prev => (prev === opt.key ? null : opt.key))}
                      >
                        <Text style={[styles.timeChipText, filterAge === opt.key ? styles.timeChipTextActive : null]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Diabetes toggle (like profile) */}
                <View style={styles.filterOption}>
                  <Text style={styles.filterLabel}>Diabetic</Text>
                  <Switch value={filterDiabetic} onValueChange={setFilterDiabetic} />
                </View>

                <View style={styles.filterActions}>
                  <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={clearFilters}>
                    <Text style={styles.buttonText}>Clear</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={applyFilters} disabled={isLoadingFilters}>
                    <Text style={[styles.buttonText, styles.buttonTextWhite]}>{isLoadingFilters ? 'Loading...' : 'Apply'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={styles.backdropTouchable} onPress={() => setShowFilters(false)} />
            </View>
          )}
        </View>
      </View>

      {/* (Suggested Dishes are shown above inside the left column when filters are visible) */}

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => router.push({ pathname: '/camera', params: { mode: 'raw_ingredients' } })}
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
  filteredBadge: {
    fontSize: 12,
    color: '#90be6d',
    fontWeight: '600',
    marginLeft: 8,
    fontStyle: 'italic',
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
    marginBottom: 8,
  },
  justificationContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e8f4fd',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  justificationText: {
    flex: 1,
    fontSize: 13,
    color: '#0077b6',
    lineHeight: 18,
    fontStyle: 'italic',
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
  /* Layout for filters */
  sectionWithFilters: {
    paddingBottom: 8,
  },
  rowContainer: {
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flexDirection: 'column',
  },
  leftColumn: {
    flex: 1,
  },
  filterToggleButton: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  filterToggleText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  filterPanel: {
    width: 260,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterTitle: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  filterLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  filterActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  filterSectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  timeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  timeChipActive: {
    backgroundColor: '#90be6d',
    borderColor: '#90be6d',
  },
  timeChipText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#fff',
  },
  /* Mobile overlay styles */
  modalBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    flexDirection: 'row',
  },
  backdropTouchable: {
    flex: 1,
  },
  modalPanel: {
    width: '80%',
    maxWidth: 360,
    height: '100%',
    backgroundColor: '#fff',
    padding: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
});

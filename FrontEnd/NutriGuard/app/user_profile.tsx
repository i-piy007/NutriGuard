import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getMacroPlan, saveUserTargets } from '../utils/api';

export default function UserProfile() {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('token');
      setToken(t);
      if (t) fetchProfile(t);
    })();
  }, []);

  const fetchProfile = async (t: string) => {
    setLoading(true);
    try {
      const resp = await fetch('https://nutriguard-n98n.onrender.com/user/profile', {
        method: 'GET',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.warn('[profile] fetch failed', resp.status, txt);
        Alert.alert('Error', 'Failed to load profile');
        setLoading(false);
        return;
      }
      const j = await resp.json();
      setProfile(j);
    } catch (e) {
      console.error('[profile] fetch exception', e);
      Alert.alert('Error', String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!token) return Alert.alert('Not logged in');
    try {
      const body: any = {};
      if (profile.name !== undefined) body.name = profile.name;
      if (profile.height !== undefined) body.height = profile.height ? Number(profile.height) : null;
      if (profile.weight !== undefined) body.weight = profile.weight ? Number(profile.weight) : null;
      if (profile.gender !== undefined) body.gender = profile.gender;
      if (profile.age !== undefined) body.age = profile.age ? Number(profile.age) : null;
      if (profile.is_diabetic !== undefined) body.is_diabetic = profile.is_diabetic;
      const resp = await fetch('https://nutriguard-n98n.onrender.com/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.warn('[profile] save failed', resp.status, txt);
        Alert.alert('Save failed', txt);
        return;
      }
      const j = await resp.json();
      if (j && j.profile) setProfile(j.profile);
      Alert.alert('Saved');
    } catch (e) {
      console.error('[profile] save exception', e);
      Alert.alert('Error', String(e));
    }
  };

  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain');
  const [activity, setActivity] = useState<'sedentary' | 'light' | 'moderate' | 'very_active' | 'athlete'>('sedentary');

  const handleCalculatePlan = async () => {
    try {
      if (!profile || !profile.weight || !profile.height || !profile.age || !profile.gender) {
        return Alert.alert('Missing info', 'Please fill weight, height, age, and gender.');
      }
      const resp = await getMacroPlan({
        weightKg: Number(profile.weight),
        heightCm: Number(profile.height),
        age: Number(profile.age),
        sex: String(profile.gender).toLowerCase().startsWith('m') ? 'male' : 'female',
        goal,
        activityLevel: activity,
        isDiabetic: !!profile.is_diabetic,
      });
      const targetsToStore = {
        calories: resp.calories,
        protein: resp.protein,
        fat: resp.fat,
        carbs: resp.carbs,
        maxSugar: resp.maxSugar,
        fiberTarget: resp.fiberTarget,
      };
      await AsyncStorage.setItem('dailyTarget', JSON.stringify(targetsToStore));
      // Persist to backend if token available
      if (token) {
        await saveUserTargets(token, targetsToStore);
      }
      Alert.alert('Daily target set', `Calories: ${resp.calories} kcal`);
      // After first calculation (or recalculation), navigate back to dashboard
      router.replace('/dashboard');
    } catch (e: any) {
      console.warn('[macro] failed', e);
      Alert.alert('Error', String(e?.message || e));
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('nutritionTotals');
    router.replace('/login');
  };

  const handleClearTodayAndOpenDev = async () => {
    // legacy combined handler kept for backward compatibility but will not be used by UI
    await handleClearToday();
    await handleOpenDev();
  };

  const handleClearToday = async () => {
    // Clear local totals
    await AsyncStorage.setItem('nutritionTotals', JSON.stringify({ calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 }));
    // Also clear server-side metric for today if logged in
    const t = await AsyncStorage.getItem('token');
    if (t) {
      try {
        const zeroPayload = { day: new Date().toISOString().slice(0,10), nutrition: { items: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 } } };
        const resp = await fetch('https://nutriguard-n98n.onrender.com/metrics/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
          body: JSON.stringify(zeroPayload),
        });
        if (!resp.ok) {
          const txt = await resp.text();
          console.warn('[profile] failed clearing server metrics', resp.status, txt);
        } else {
          Alert.alert('Cleared', "Today's macros cleared on server and locally.");
        }
      } catch (e) {
        console.warn('[profile] exception clearing server metrics', e);
        Alert.alert('Cleared', "Local totals cleared; server update failed.");
      }
    } else {
      Alert.alert('Cleared', "Today's macros cleared locally.");
    }
  };

  const handleOpenDev = async () => {
    const dummyNutrition = {
      items: [
        { name: 'Dev Sample: Apple', calories: 95, protein_g: 0.5, carbohydrates_total_g: 25, fat_total_g: 0.3, sugar_g: 19, fiber_g: 4.4 },
        { name: 'Dev Sample: Boiled Egg', calories: 78, protein_g: 6, carbohydrates_total_g: 0.6, fat_total_g: 5.3, sugar_g: 0.6, fiber_g: 0 }
      ],
      totals: { calories: 173, protein: 6.5, carbs: 25.6, fat: 5.6, sugar: 19.6, fiber: 4.4 }
    };
    router.push({ pathname: '/food_add', params: { imageUrl: 'https://indiaforbeginners.com/wp-content/uploads/2020/04/India-for-Beginners-custom-tours-8.jpg', itemName: 'Development Sample', nutrition: JSON.stringify(dummyNutrition) } });
  };

  const handleOpenDevRawIngredients = async () => {
    const dummyIngredients = ['Tomatoes', 'Onions', 'Garlic', 'Bell Peppers', 'Chicken Breast'];
    const dummyDishes = [
      {
        name: 'Chicken Stir Fry',
        description: 'A healthy and quick stir fry with vegetables',
        justification: 'Perfect for dinner time with balanced protein and vegetables',
        image_url: 'https://www.southernliving.com/thmb/x5c8PFlEHjDCn0L5AmS_i_jCMw8=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/Extra_Easy_Chicken_Stir-fry_014-d77baf5fc67c4cf6b0b1f3ce2c72c2e9.jpg'
      },
      {
        name: 'Stuffed Bell Peppers',
        description: 'Bell peppers stuffed with seasoned chicken and vegetables',
        justification: 'Low-carb option ideal for diabetic users',
        image_url: 'https://www.allrecipes.com/thmb/LwZ0vZoqgz2z-gSzLkR9xaXl_bw=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/22065-stuffed-peppers-DDMFS-4x3-1140-84d321bad90e4e82a8d2a0d4ce093e2f.jpg'
      }
    ];
    router.push({ 
      pathname: '/raw_ingredients_result', 
      params: { 
        imageUrl: 'https://www.southernliving.com/thmb/x5c8PFlEHjDCn0L5AmS_i_jCMw8=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/Extra_Easy_Chicken_Stir-fry_014-d77baf5fc67c4cf6b0b1f3ce2c72c2e9.jpg',
        ingredients: JSON.stringify(dummyIngredients),
        dishes: JSON.stringify(dummyDishes)
      } 
    });
  };

  if (!token) {
    return (
      <View style={styles.notSignedInContainer}>
        <MaterialIcons name="account-circle" size={80} color="#ddd" />
        <Text style={styles.notSignedInTitle}>Not Signed In</Text>
        <Text style={styles.notSignedInSubtitle}>Please log in to view your profile</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/login')}>
          <Text style={styles.primaryButtonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <MaterialIcons name="account-circle" size={80} color="#90be6d" />
        </View>
        <Text style={styles.username}>{profile?.username || 'User'}</Text>
      </View>

      {profile ? (
        <>
          {/* Personal Information Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="person" size={24} color="#90be6d" />
              <Text style={styles.cardTitle}>Personal Information</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput 
                style={styles.input} 
                value={profile.name || ''} 
                onChangeText={(t) => setProfile({ ...profile, name: t })}
                placeholder="Enter your name"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Age</Text>
              <TextInput 
                style={styles.input} 
                keyboardType="numeric" 
                value={profile.age ? String(profile.age) : ''} 
                onChangeText={(t) => setProfile({ ...profile, age: t })}
                placeholder="Enter your age"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.genderContainer}>
                {['Male', 'Female', 'Other'].map((g) => (
                  <Pressable 
                    key={g} 
                    style={[styles.genderButton, profile.gender === g && styles.genderButtonActive]}
                    onPress={() => setProfile({ ...profile, gender: g })}
                  >
                    <Text style={[styles.genderButtonText, profile.gender === g && styles.genderButtonTextActive]}>
                      {g}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Physical Stats Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="straighten" size={24} color="#4cc9f0" />
              <Text style={styles.cardTitle}>Physical Stats</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.label}>Height (cm)</Text>
                <TextInput 
                  style={styles.input} 
                  keyboardType="numeric" 
                  value={profile.height ? String(profile.height) : ''} 
                  onChangeText={(t) => setProfile({ ...profile, height: t })}
                  placeholder="0"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.statItem}>
                <Text style={styles.label}>Weight (kg)</Text>
                <TextInput 
                  style={styles.input} 
                  keyboardType="numeric" 
                  value={profile.weight ? String(profile.weight) : ''} 
                  onChangeText={(t) => setProfile({ ...profile, weight: t })}
                  placeholder="0"
                  placeholderTextColor="#999"
                />
              </View>
            </View>
          </View>

          {/* Goals & Activity Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="flag" size={24} color="#577590" />
              <Text style={styles.cardTitle}>Goal & Activity</Text>
            </View>

            <Text style={styles.label}>Goal</Text>
            <View style={styles.genderContainer}>
              {([
                { k: 'lose', label: 'Lose' },
                { k: 'maintain', label: 'Maintain' },
                { k: 'gain', label: 'Gain' },
              ] as const).map((g) => (
                <Pressable key={g.k} style={[styles.genderButton, goal === g.k && styles.genderButtonActive]} onPress={() => setGoal(g.k)}>
                  <Text style={[styles.genderButtonText, goal === g.k && styles.genderButtonTextActive]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 12 }]}>Activity Level</Text>
            <View style={styles.genderContainer}>
              {([
                { k: 'sedentary', label: 'Sedentary' },
                { k: 'light', label: 'Light' },
                { k: 'moderate', label: 'Moderate' },
                { k: 'very_active', label: 'Very Active' },
                { k: 'athlete', label: 'Athlete' },
              ] as const).map((a) => (
                <Pressable key={a.k} style={[styles.genderButton, activity === a.k && styles.genderButtonActive]} onPress={() => setActivity(a.k)}>
                  <Text style={[styles.genderButtonText, activity === a.k && styles.genderButtonTextActive]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

            <TouchableOpacity style={[styles.saveButton, { marginTop: 12 }]} onPress={handleCalculatePlan}>
              <MaterialIcons name="calculate" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Calculate Daily Target</Text>
            </TouchableOpacity>
          </View>

          {/* Health Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="health-and-safety" size={24} color="#f94144" />
              <Text style={styles.cardTitle}>Health Information</Text>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleLabel}>
                <MaterialIcons name="bloodtype" size={20} color="#666" />
                <Text style={styles.toggleText}>Diabetic</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, profile.is_diabetic && styles.toggleActive]}
                onPress={() => setProfile({ ...profile, is_diabetic: !profile.is_diabetic })}
              >
                <View style={[styles.toggleThumb, profile.is_diabetic && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <MaterialIcons name="save" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>

          {/* Actions Card */}
          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Quick Actions</Text>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                Alert.alert('Clear Today\'s Data', 'This will clear today\'s macros locally and on the server. Continue?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', onPress: handleClearToday, style: 'destructive' }
                ]);
              }}
            >
              <MaterialIcons name="clear-all" size={22} color="#ff8c00" />
              <Text style={styles.actionButtonText}>Clear Today's Macros</Text>
              <MaterialIcons name="chevron-right" size={22} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                Alert.alert('Dev Mode', 'Open Food Add screen with sample data?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open', onPress: handleOpenDev }
                ]);
              }}
            >
              <MaterialIcons name="code" size={22} color="#4cc9f0" />
              <Text style={styles.actionButtonText}>Open Dev FoodAdd</Text>
              <MaterialIcons name="chevron-right" size={22} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                Alert.alert('Dev Mode', 'Open Raw Ingredients screen with sample data?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open', onPress: handleOpenDevRawIngredients }
                ]);
              }}
            >
              <MaterialIcons name="restaurant-menu" size={22} color="#90be6d" />
              <Text style={styles.actionButtonText}>Open Dev Raw Ingredients</Text>
              <MaterialIcons name="chevron-right" size={22} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.logoutButton]}
              onPress={() => {
                Alert.alert('Logout', 'Are you sure you want to logout?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Logout', onPress: handleLogout, style: 'destructive' }
                ]);
              }}
            >
              <MaterialIcons name="logout" size={22} color="#f94144" />
              <Text style={[styles.actionButtonText, styles.logoutButtonText]}>Logout</Text>
              <MaterialIcons name="chevron-right" size={22} color="#ccc" />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Not Signed In
  notSignedInContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
  },
  notSignedInTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  notSignedInSubtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#90be6d',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Main Layout
  scrollView: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  avatarContainer: {
    marginBottom: 12,
  },
  username: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
  },

  // Cards
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 10,
  },

  // Input Groups
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#333',
  },

  // Gender Buttons
  genderContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  genderButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  genderButtonActive: {
    borderColor: '#90be6d',
    backgroundColor: '#f1f8f4',
  },
  genderButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  genderButtonTextActive: {
    color: '#90be6d',
    fontWeight: '600',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flex: 1,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  toggle: {
    width: 56,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    padding: 3,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#90be6d',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },

  // Save Button
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#90be6d',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  // Actions Card
  actionsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  logoutButton: {
    borderBottomWidth: 0,
  },
  logoutButtonText: {
    color: '#f94144',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
});

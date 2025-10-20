import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ScrollView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

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

  if (!token) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Not signed in</Text>
        <Button title="Go to Login" onPress={() => router.push('/login')} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>User Profile</Text>
      {profile ? (
        <>
          <Text>Username (read-only)</Text>
          <TextInput style={styles.input} value={profile.username} editable={false} />

          <Text>Name</Text>
          <TextInput style={styles.input} value={profile.name || ''} onChangeText={(t) => setProfile({ ...profile, name: t })} />

          <Text>Gender</Text>
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {['Male', 'Female', 'Other'].map((g) => (
              <TouchableOpacity key={g} style={{ marginRight: 8 }} onPress={() => setProfile({ ...profile, gender: g })}>
                <View style={{ padding: 8, borderWidth: 1, borderColor: profile.gender === g ? '#007AFF' : '#ccc', borderRadius: 6 }}>
                  <Text style={{ color: profile.gender === g ? '#007AFF' : '#000' }}>{g}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <Text>Age</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={profile.age ? String(profile.age) : ''} onChangeText={(t) => setProfile({ ...profile, age: t })} />

          <Text>Height (cm)</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={profile.height ? String(profile.height) : ''} onChangeText={(t) => setProfile({ ...profile, height: t })} />

          <Text>Weight (kg)</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={profile.weight ? String(profile.weight) : ''} onChangeText={(t) => setProfile({ ...profile, weight: t })} />

          <View style={{ marginTop: 12, width: '100%' }}>
            <Button title="Save" onPress={handleSave} />
          </View>
          <View style={{ marginTop: 12, width: '100%' }}>
            <Button title="Clear today's macros" onPress={async () => {
              Alert.alert('Clear today', 'This will clear today\'s macros locally and on the server (if logged in). Continue?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Continue', onPress: handleClearToday }
              ]);
            }} color="#ff8c00" />
          </View>

          <View style={{ marginTop: 12, width: '100%' }}>
            <Button title="Open Dev FoodAdd" onPress={async () => {
              Alert.alert('Open Dev FoodAdd', 'This will open the Food Add screen with development sample data. Continue?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Continue', onPress: handleOpenDev }
              ]);
            }} color="#007AFF" />
          </View>

          <View style={{ marginTop: 12, width: '100%' }}>
            <Button title="Logout" onPress={handleLogout} color="#d33" />
          </View>
        </>
      ) : (
        <Text>Loading...</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, alignItems: 'stretch' },
  title: { fontSize: 20, textAlign: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 10, borderRadius: 6 },
});

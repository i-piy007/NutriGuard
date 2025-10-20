import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ScrollView } from 'react-native';
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
          <TextInput style={styles.input} value={profile.gender || ''} onChangeText={(t) => setProfile({ ...profile, gender: t })} />

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

import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export default function Onboarding() {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [isDiabetic, setIsDiabetic] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    if (!name || !age || !height || !weight || !gender) {
      Alert.alert('Missing fields', 'Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Error', 'Not logged in');
        router.replace('/login');
        return;
      }

      const body = {
        name,
        age: Number(age),
        height: Number(height),
        weight: Number(weight),
        gender,
        is_diabetic: isDiabetic
      };

      const resp = await fetch('https://nutriguard-n98n.onrender.com/user/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.warn('[onboarding] save failed', resp.status, txt);
        Alert.alert('Error', 'Failed to save profile');
        return;
      }

      Alert.alert('Welcome!', 'Your profile has been set up', [
        { text: 'OK', onPress: () => router.replace('/dashboard') }
      ]);
    } catch (e) {
      console.error('[onboarding] exception', e);
      Alert.alert('Error', String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome to NutriGuard!</Text>
      <Text style={styles.subtitle}>Let's set up your profile</Text>

      <Text style={styles.label}>Name *</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
      />

      <Text style={styles.label}>Age *</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={age}
        onChangeText={setAge}
        placeholder="Enter your age"
      />

      <Text style={styles.label}>Height (cm) *</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={height}
        onChangeText={setHeight}
        placeholder="Enter your height"
      />

      <Text style={styles.label}>Weight (kg) *</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={weight}
        onChangeText={setWeight}
        placeholder="Enter your weight"
      />

      <Text style={styles.label}>Gender *</Text>
      <View style={styles.genderRow}>
        {['Male', 'Female', 'Other'].map((g) => (
          <TouchableOpacity
            key={g}
            style={[
              styles.genderButton,
              gender === g && styles.genderButtonSelected
            ]}
            onPress={() => setGender(g)}
          >
            <Text style={[
              styles.genderButtonText,
              gender === g && styles.genderButtonTextSelected
            ]}>
              {g}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Are you diabetic?</Text>
      <View style={styles.diabeticRow}>
        <TouchableOpacity
          style={styles.toggleContainer}
          onPress={() => setIsDiabetic(!isDiabetic)}
        >
          <View style={[
            styles.toggle,
            isDiabetic && styles.toggleActive
          ]}>
            <View style={[
              styles.toggleThumb,
              isDiabetic && styles.toggleThumbActive
            ]} />
          </View>
        </TouchableOpacity>
        <Text style={styles.toggleLabel}>{isDiabetic ? 'Yes' : 'No'}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={loading ? 'Saving...' : 'Complete Setup'}
          onPress={handleComplete}
          disabled={loading}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: '#666',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  genderButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  genderButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  genderButtonText: {
    fontSize: 16,
    color: '#333',
  },
  genderButtonTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  diabeticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleContainer: {
    marginRight: 12,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: '#34C759',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  toggleLabel: {
    fontSize: 16,
    color: '#333',
  },
  buttonContainer: {
    marginTop: 24,
    marginBottom: 20,
  },
});

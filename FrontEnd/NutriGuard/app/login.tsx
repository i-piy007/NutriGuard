import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Text, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export default function LoginScreen() {
  // Keep only name and password as requested
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const saveToken = async (token: string) => {
    await AsyncStorage.setItem('token', token);
  };

  const handleRegister = async () => {
    console.log('[login] handleRegister called with name=', name);
    try {
      // Send username to server
      const resp = await fetch('https://nutriguard-n98n.onrender.com/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password, name }),
      });
      console.log('[login] register response status', resp.status);
      if (!resp.ok) {
        try {
          const j = await resp.json();
          console.warn('[login] register failed json:', j);
          Alert.alert('Register failed', j.detail || JSON.stringify(j));
        } catch (err) {
          const txt = await resp.text();
          console.warn('[login] Non-JSON register response:', txt);
          Alert.alert('Register failed', txt);
        }
        return;
      }
      const j = await resp.json();
      console.log('[login] register success payload:', j);
      await saveToken(j.token);
      router.replace('/dashboard');
    } catch (e) {
      console.error('[login] register exception', e);
      Alert.alert('Error', String(e));
    }
  };

  const handleLogin = async () => {
    console.log('[login] handleLogin called with name=', name);
    try {
      const resp = await fetch('https://nutriguard-n98n.onrender.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password }),
      });
      console.log('[login] login response status', resp.status);
      if (!resp.ok) {
        // If 401 (user not found or invalid), try to register automatically
        if (resp.status === 401) {
          console.log('[login] user not found or invalid credentials; attempting to register');
          await handleRegister();
          return;
        }
        try {
          const j = await resp.json();
          console.warn('[login] login failed json:', j);
          Alert.alert('Login failed', j.detail || JSON.stringify(j));
        } catch (err) {
          const txt = await resp.text();
          console.warn('[login] Non-JSON login response:', txt);
          Alert.alert('Login failed', txt);
        }
        return;
      }
      const j = await resp.json();
      console.log('[login] login success payload:', j);
      await saveToken(j.token);
      router.replace('/dashboard');
    } catch (e) {
      console.error('[login] login exception', e);
      Alert.alert('Error', String(e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login / Register</Text>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={styles.input} autoCapitalize="none" />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />
      <View style={styles.buttons}>
        <Button title="Submit" onPress={handleLogin} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 12, borderRadius: 6 },
  buttons: { flexDirection: 'row', justifyContent: 'space-around' },
  title: { fontSize: 20, textAlign: 'center', marginBottom: 12 },
});

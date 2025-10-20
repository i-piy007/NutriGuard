import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, StyleSheet, Text, Alert } from 'react-native';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export default function LoginScreen() {
  // Keep only name and password as requested
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const saveToken = async (token: string) => {
    await AsyncStorage.setItem('token', token);
  };

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem('token');
        setIsLoggedIn(!!t);
        console.log('[login] initial token present:', !!t);
        if (t) {
          try {
            const parts = t.split('.');
            if (parts.length >= 2) {
              const payload = parts[1];
              const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
              const json = Buffer.from(b64, 'base64').toString('utf8');
              const obj = JSON.parse(json);
              const uname = obj.username || obj.name || obj.email || null;
              setCurrentUser(uname);
              console.log('[login] decoded token payload:', obj);
            }
          } catch (e) {
            console.warn('[login] failed to decode token', e);
          }
        }
      } catch (e) {
        console.warn('[login] error checking token', e);
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      console.log('[login] logout: clearing token and local totals');
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('nutritionTotals');
      setIsLoggedIn(false);
      setCurrentUser(null);
      // navigate back to login (replace to avoid back navigation)
      router.replace('/login');
    } catch (e) {
      console.error('[login] logout error', e);
      Alert.alert('Logout error', String(e));
    }
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
      // update UI state
      setIsLoggedIn(true);
      try {
        const t = j.token as string;
        const parts = t.split('.');
        if (parts.length >= 2) {
          const payload = parts[1];
          const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
          const json = Buffer.from(b64, 'base64').toString('utf8');
          const obj = JSON.parse(json);
          setCurrentUser(obj.username || obj.name || obj.email || null);
        }
      } catch (e) {
        console.warn('[login] failed to decode token after register', e);
      }
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
      // update UI state
      setIsLoggedIn(true);
      try {
        const t = j.token as string;
        const parts = t.split('.');
        if (parts.length >= 2) {
          const payload = parts[1];
          const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
          const json = Buffer.from(b64, 'base64').toString('utf8');
          const obj = JSON.parse(json);
          setCurrentUser(obj.username || obj.name || obj.email || null);
        }
      } catch (e) {
        console.warn('[login] failed to decode token after login', e);
      }
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
        {isLoggedIn ? (
          <Button title="Logout" onPress={handleLogout} color="#d33" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center', marginBottom: 250  },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 15, borderRadius: 6 },
  buttons: { flexDirection: 'row', justifyContent: 'space-around' },
  title: { fontSize: 20, textAlign: 'center', marginBottom: 12 },
});

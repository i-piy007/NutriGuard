import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Text, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const saveToken = async (token: string) => {
    await AsyncStorage.setItem('token', token);
  };

  const handleRegister = async () => {
    try {
      const resp = await fetch('https://nutriguard-n98n.onrender.com/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      console.log('register response status', resp.status, resp.headers);
      if (!resp.ok) {
        // Try to parse JSON, fallback to text
        try {
          const j = await resp.json();
          Alert.alert('Register failed', j.detail || JSON.stringify(j));
        } catch (err) {
          const txt = await resp.text();
          console.warn('Non-JSON register response:', txt);
          Alert.alert('Register failed', txt);
        }
        return;
      }
      // OK response - parse JSON safely
      let j: any = null;
      try {
        j = await resp.json();
      } catch (err) {
        const txt = await resp.text();
        console.warn('Register returned non-JSON on success:', txt);
        Alert.alert('Register error', 'Unexpected response from server: ' + txt);
        return;
      }
      await saveToken(j.token);
      router.replace('/dashboard');
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const handleLogin = async () => {
    try {
      const resp = await fetch('https://nutriguard-n98n.onrender.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      console.log('login response status', resp.status, resp.headers);
      if (!resp.ok) {
        try {
          const j = await resp.json();
          Alert.alert('Login failed', j.detail || JSON.stringify(j));
        } catch (err) {
          const txt = await resp.text();
          console.warn('Non-JSON login response:', txt);
          Alert.alert('Login failed', txt);
        }
        return;
      }
      let j: any = null;
      try {
        j = await resp.json();
      } catch (err) {
        const txt = await resp.text();
        console.warn('Login returned non-JSON on success:', txt);
        Alert.alert('Login error', 'Unexpected response from server: ' + txt);
        return;
      }
      await saveToken(j.token);
      router.replace('/dashboard');
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login / Register</Text>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} style={styles.input} autoCapitalize="none" />
      <TextInput placeholder="Name (register only)" value={name} onChangeText={setName} style={styles.input} />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />
      <View style={styles.buttons}>
        <Button title="Login" onPress={handleLogin} />
        <Button title="Register" onPress={handleRegister} />
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

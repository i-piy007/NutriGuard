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
      if (!resp.ok) {
        const j = await resp.json();
        Alert.alert('Register failed', j.detail || JSON.stringify(j));
        return;
      }
      const j = await resp.json();
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
      if (!resp.ok) {
        const j = await resp.json();
        Alert.alert('Login failed', j.detail || JSON.stringify(j));
        return;
      }
      const j = await resp.json();
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

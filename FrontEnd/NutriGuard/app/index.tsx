import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";

export default function Index() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");

  const handleApiCall = async () => {
    if (!inputValue.trim()) {
      Alert.alert("Error", "Please enter a value first!");
      return;
    }

    try {
        const response = await fetch("https://nutriguard-n98n.onrender.com/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: inputValue }), // matches backend model
        });


      const data = await response.json();
      console.log("Response:", data);
      Alert.alert("Success", JSON.stringify(data));
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not reach the server!");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to NutriGuard!</Text>

      {/* ✅ Input Box */}
      <TextInput
        style={styles.input}
        placeholder="Enter food name..."
        placeholderTextColor="#888"
        value={inputValue}
        onChangeText={setInputValue}
      />

      {/* ✅ API Call Button */}
      <TouchableOpacity style={styles.apiButton} onPress={handleApiCall}>
        <Text style={styles.buttonText}>Send to Backend</Text>
      </TouchableOpacity>

      {/* ✅ Camera Button */}
      <TouchableOpacity
        style={styles.cameraButton}
        onPress={() => router.push("/camera")}
      >
        <Text style={styles.buttonText}>Open Camera</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f8f8",
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    marginBottom: 20,
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  apiButton: {
    backgroundColor: "#34C759",
    paddingVertical: 15,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  cameraButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 15,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});

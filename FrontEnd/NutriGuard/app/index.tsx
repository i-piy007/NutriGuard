import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";

export default function Index() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);

  const handleApiCall = async () => {
    if (!inputValue.trim()) {
      Alert.alert("Error", "Please enter a value first!");
      return;
    }

    setLoading(true); // show loading screen

    try {
      console.log("Sending request:", inputValue.slice(0, 3) + "...");

      const response = await fetch("https://nutriguard-n98n.onrender.com/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputValue }),
      });

      console.log("Request sent. Awaiting response...");

      const data = await response.json();

      console.log("Received response:", JSON.stringify(data).slice(0, 3) + "...");
      Alert.alert("Success", JSON.stringify(data));
    } catch (error) {
      console.error("Error fetching from backend:", error);
      Alert.alert("Error", "Could not reach the server!");
    } finally {
      setLoading(false); // hide loading screen
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to NutriGuard!</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter food name..."
        placeholderTextColor="#888"
        value={inputValue}
        onChangeText={setInputValue}
      />

      <TouchableOpacity style={styles.apiButton} onPress={handleApiCall}>
        <Text style={styles.buttonText}>Send to Backend</Text>
      </TouchableOpacity>

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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f8f8",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 18,
    color: "#555",
  },
});

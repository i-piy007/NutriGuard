import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Camera, CameraView } from "expo-camera";

export default function CameraScreen() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const cameraRef = useRef<any>(null);

  // Request camera permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setPermission(status === "granted");
    })();
  }, []);

  const takePictureAndUpload = async () => {
    if (!cameraRef.current) {
      console.log("Camera ref is null, cannot take picture");
      return;
    }
    setLoading(true);
    console.log("Starting picture capture and upload");

    try {
      // Take picture
      console.log("Taking picture...");
      const photo = await cameraRef.current.takePictureAsync({ base64: false });
      console.log("Photo captured:", photo.uri.slice(0, 10) + "...");

      // Prepare form data
      console.log("Preparing form data...");
      const formData = new FormData();
      formData.append("file", {
        uri: photo.uri,
        name: "photo.jpg",
        type: "image/jpeg",
      } as any);
      console.log("Form data prepared");

      // Send to backend
      console.log("Sending request to backend...");
      const response = await fetch("https://nutriguard-n98n.onrender.com/upload", {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      console.log("Response received, status:", response.status);

      const data = await response.json();
      console.log("Response data:", JSON.stringify(data).slice(0, 50) + "...");
      Alert.alert("Success", JSON.stringify(data));

    } catch (error) {
      console.error("Error in takePictureAndUpload:", error);
      Alert.alert("Error", "Failed to upload image.");
    } finally {
      setLoading(false);
      console.log("Upload process finished");
    }
  };

  if (permission === null) {
    return <Text>Requesting camera permission...</Text>;
  }

  if (permission === false) {
    return (
      <View style={styles.container}>
        <Text>We need your permission to access the camera</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setPermission(status === "granted");
          }}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {React.createElement(CameraView as any, { style: styles.camera, ref: cameraRef })}

      <View style={styles.controls}>
        {loading ? (
          <ActivityIndicator size="large" color="#007AFF" />
        ) : (
          <TouchableOpacity style={styles.button} onPress={takePictureAndUpload}>
            <Text style={styles.buttonText}>Take Picture & Upload</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  controls: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
  },
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image } from "react-native";
import { Camera, CameraView } from "expo-camera";

export default function CameraScreen() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
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
    console.log("Starting picture capture and identification");

    try {
      // Take picture with base64
      console.log("Taking picture...");
      const photo = await cameraRef.current.takePictureAsync({ base64: true });
      console.log("Photo captured, base64 length:", photo.base64?.length || 0);
      setCapturedImage(photo.uri);

      // Send base64 directly to identify
      console.log("Sending base64 to backend for identification...");
      const identifyResponse = await fetch("https://nutriguard-n98n.onrender.com/identify-food", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image_base64: photo.base64 }),
      });
      console.log("Identify response status:", identifyResponse.status);

      if (!identifyResponse.ok) {
        throw new Error(`Identification failed: ${identifyResponse.status}`);
      }

      const identifyData = await identifyResponse.json();
      console.log("Identify response data:", identifyData);
      Alert.alert("Success", `Item identified: ${identifyData.item_name}`);

    } catch (error) {
      console.error("Error in takePictureAndUpload:", error);
      Alert.alert("Error", `Failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
      setCapturedImage(null);
      console.log("Identification process finished");
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
      {capturedImage ? (
        <View style={styles.container}>
          <Image source={{ uri: capturedImage }} style={styles.camera} />
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Processing image...</Text>
            </View>
          )}
        </View>
      ) : (
        React.createElement(CameraView as any, { style: styles.camera, ref: cameraRef })
      )}

      <View style={styles.controls}>
        {loading ? (
          <ActivityIndicator size="large" color="#007AFF" />
        ) : capturedImage ? (
          <TouchableOpacity style={styles.button} onPress={() => setCapturedImage(null)}>
            <Text style={styles.buttonText}>Retake</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.button} onPress={takePictureAndUpload}>
            <Text style={styles.buttonText}>Take Picture & Identify</Text>
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
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 10,
  },
});

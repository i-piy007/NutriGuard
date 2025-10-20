import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image } from "react-native";
import { Camera, CameraView } from "expo-camera";
import { router } from "expo-router";

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
    console.log("Starting picture capture and upload");

    try {
      // Take picture
      console.log("Taking picture...");
      const photo = await cameraRef.current.takePictureAsync({ base64: false });
      console.log("Photo captured:", photo.uri.slice(0, 10) + "...");
      setCapturedImage(photo.uri);

      // Prepare form data
      console.log("Preparing form data...");
      const formData = new FormData();
      formData.append("file", {
        uri: photo.uri,
        name: "photo.jpg",
        type: "image/jpeg",
      } as any);
      console.log("Form data prepared");

      // First, upload the image to backend
      console.log("Uploading image to backend...");
      const uploadResponse = await fetch("https://nutriguard-n98n.onrender.com/upload", {
        method: "POST",
        body: formData,
      });
      console.log("Upload response status:", uploadResponse.status);

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      console.log("Upload response data:", uploadData);
      const imageUrl = uploadData.image_url;

      // Now, send the image URL to identify food
      console.log("Identifying food with URL:", imageUrl);
      const identifyResponse = await fetch("https://nutriguard-n98n.onrender.com/identify-food", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      console.log("Identify response status:", identifyResponse.status);

      if (!identifyResponse.ok) {
        throw new Error(`Identify failed: ${identifyResponse.status}`);
      }

      const identifyData = await identifyResponse.json();
      console.log("Identify response data:", identifyData);
      // Log a short preview of nutrition if present
      try {
        const nutritionPreview = identifyData?.nutrition ? JSON.stringify(identifyData.nutrition).slice(0, 120) + '...' : 'null';
        console.log('Nutrition preview:', nutritionPreview);
      } catch (e) {
        console.log('Error previewing nutrition:', e);
      }
      // Navigate to food_add with data
      router.push({
        pathname: "/food_add",
        params: {
          imageUrl: imageUrl,
          itemName: identifyData.item_name,
          nutrition: JSON.stringify(identifyData.nutrition),
        },
      });

    } catch (error) {
      console.error("Error in takePictureAndUpload:", error);
      Alert.alert("Error", `Failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
      setCapturedImage(null);
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

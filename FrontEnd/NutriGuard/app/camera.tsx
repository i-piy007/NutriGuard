import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image } from "react-native";
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Camera, CameraView } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";

export default function CameraScreen() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  const cameraRef = useRef<any>(null);
  const { mode } = useLocalSearchParams(); // Get mode parameter from URL

  // Request camera permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setPermission(status === "granted");
    })();
  }, []);

  const takePicture = async () => {
    if (!cameraRef.current) {
      console.log("Camera ref is null, cannot take picture");
      return;
    }
    console.log("Taking picture...");
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: false });
      console.log("Photo captured:", photo.uri.slice(0, 10) + "...");
      setCapturedImage(photo.uri);
    } catch (error) {
      console.error("Error taking picture:", error);
      Alert.alert("Error", "Failed to take picture");
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Permission to access the photo library is required.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      // Modern versions return { canceled, assets } else { cancelled, uri }
      const uri = (result as any).assets && (result as any).assets.length > 0
        ? (result as any).assets[0].uri
        : (result as any).uri;

      if (!uri) return;

      setCapturedImage(uri);
      // Immediately process/upload the picked image
      await confirmAndUpload();
    } catch (err) {
      console.error('Error picking image:', err);
      Alert.alert('Error', 'Unable to pick the image.');
    }
  };

  const confirmAndUpload = async () => {
    if (!capturedImage) return;
    setLoading(true);
    console.log("Starting upload and processing");

    try {
      // Create form data
      console.log("Creating FormData...");
      const formData = new FormData();
      formData.append("file", {
        uri: capturedImage,
        type: "image/jpeg",
        name: "photo.jpg",
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

      // Determine which endpoint to use based on mode
      const isRawIngredientsMode = mode === 'raw_ingredients';
      const endpoint = isRawIngredientsMode 
        ? "https://nutriguard-n98n.onrender.com/identify-raw-ingredients"
        : "https://nutriguard-n98n.onrender.com/identify-food";
      
      console.log(`Identifying ${isRawIngredientsMode ? 'raw ingredients' : 'food'} with URL:`, imageUrl);
      const identifyResponse = await fetch(endpoint, {
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
      
      // For raw ingredients mode, navigate to results screen and save to history
      if (isRawIngredientsMode) {
        const displayImageUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + `t=${Date.now()}`;
        router.push({
          pathname: "/raw_ingredients_result",
          params: {
            imageUrl: displayImageUrl,
            ingredients: JSON.stringify(identifyData.ingredients || []),
            dishes: JSON.stringify(identifyData.dishes || []),
          },
        });
        return;
      }
      
      // For normal food mode, continue with nutrition tracking
      try {
        const nutritionPreview = identifyData?.nutrition ? JSON.stringify(identifyData.nutrition).slice(0, 120) + '...' : 'null';
        console.log('Nutrition preview:', nutritionPreview);
      } catch (e) {
        console.log('Error previewing nutrition:', e);
      }
      // Append cache-busting query param for display so RN Image doesn't use a stale cached file
      const displayImageUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + `t=${Date.now()}`;
      // Navigate to food_add with data (use displayImageUrl for UI, keep original imageUrl for backend references)
      router.push({
        pathname: "/food_add",
        params: {
          imageUrl: displayImageUrl,
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
              <Text style={styles.loadingText}>Processing your food image...</Text>
            </View>
          )}
          {!loading && (
            <View style={styles.controlPanel}>
              <View style={styles.previewControls}>
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={() => setCapturedImage(null)}
                >
                  <MaterialIcons name="close" size={40} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={confirmAndUpload}
                >
                  <MaterialIcons name="check" size={40} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ) : (
        <>
          <CameraView
            style={styles.camera}
            ref={cameraRef}
            facing="back"
            flash={flashMode}
          />
          {/* Grid overlay */}
          <View style={styles.gridOverlay}>
            {/* Vertical lines */}
            <View style={[styles.gridLine, styles.gridLineVertical, { left: '33.33%' }]} />
            <View style={[styles.gridLine, styles.gridLineVertical, { left: '66.66%' }]} />
            {/* Horizontal lines */}
            <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '33.33%' }]} />
            <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '66.66%' }]} />
          </View>
          {/* Camera controls panel */}
          <View style={styles.controlPanel}>
            <View style={styles.cameraControls}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => setFlashMode(flashMode === 'off' ? 'on' : 'off')}
              >
                <MaterialIcons 
                  name={flashMode === 'on' ? 'flash-on' : 'flash-off'} 
                  size={30} 
                  color="#fff" 
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={takePicture}
                accessibilityLabel="Take picture"
              >
                <MaterialIcons name="photo-camera" size={45} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={pickImage}
              >
                <MaterialIcons name="image" size={30} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
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
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
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
    fontSize: 20,
    marginTop: 10,
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 140,
    pointerEvents: 'none',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: '#fff',
    opacity: 0.5,
  },
  gridLineVertical: {
    width: 2,
    height: '100%',
  },
  gridLineHorizontal: {
    height: 2,
    width: '100%',
  },
  controlPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(30, 30, 30, 0.98)',
    paddingVertical: 50,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    // LIFTED: translateY moves the controls up so they overlap the bottom of the camera view
    // This makes the buttons sit slightly above the control panel and overlap the screen bottom.
    transform: [{ translateY: -20 }],
  },
  previewControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    // LIFTED: translateY moves the preview controls up for better visibility/overlap
    transform: [{ translateY: -20 }],
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  retakeButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  confirmButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});

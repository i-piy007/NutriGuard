import { Stack, useRouter } from "expo-router";
import { TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export default function RootLayout() {
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen
        name="dashboard"
        options={{
          title: "NutriGuard",
          headerTitleAlign: 'center',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.push('/user_profile')}
              style={{ paddingHorizontal: 12 }}
              accessibilityLabel="Open user profile"
            >
              <MaterialIcons name="person" size={22} color="#000" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/history')}
              style={{ paddingHorizontal: 12 }}
              accessibilityLabel="Open history"
            >
              <MaterialIcons name="history" size={24} color="#000" />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="camera"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="user_profile"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}

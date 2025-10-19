import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="dashboard"
        options={{ title: "NutriGuard"}}
      />
    </Stack>
  );
}

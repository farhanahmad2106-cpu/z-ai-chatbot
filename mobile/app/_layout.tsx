import { Stack } from 'expo-router';
import { NativeWindStyleSheet } from "nativewind";

NativeWindStyleSheet.setOutput({ default: "native" });

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020617' } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

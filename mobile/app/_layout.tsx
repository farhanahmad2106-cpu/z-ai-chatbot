import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useOfflineSyncStore } from '@/stores/useOfflineSyncStore';

export default function RootLayout() {
  const initializeSync = useOfflineSyncStore((s) => s.initialize);
  const startMonitoring = useOfflineSyncStore((s) => s.startNetworkMonitoring);
  const stopMonitoring = useOfflineSyncStore((s) => s.stopNetworkMonitoring);

  useEffect(() => {
    initializeSync();
    startMonitoring();
    return () => {
      stopMonitoring();
    };
  }, [initializeSync, startMonitoring, stopMonitoring]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020617' } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}


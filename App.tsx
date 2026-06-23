/**
 * Z-AI Chatbot — Application Root
 * react-navigation v6 Stack + Drawer navigator.
 *
 * Navigation hierarchy:
 *   RootStack
 *   ├── Splash     → Initial loading + routing screen
 *   ├── Setup      → First-boot PIN creation (reuses UnlockScreen in setup mode)
 *   ├── Unlock     → Returning user PIN entry
 *   └── Main       → MainDrawer (all authenticated screens)
 *
 * MainDrawer
 *   ├── ChatHome   → Primary chat interface
 *   ├── Dashboard  → System metrics + activity overview
 *   ├── Models     → Model manager (install, load, configure)
 *   ├── Sync       → LAN device pairing + sync status
 *   ├── Backup     → Backup management + scheduling
 *   └── Settings   → App preferences + security
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { CONVEX_URL } from './convex/convex';

const convex = new ConvexReactClient(CONVEX_URL);
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { theme } from './src/theme';
import { RootStackParamList, MainDrawerParamList } from './src/types/chat';

// ── Screen Imports ────────────────────────────────────────────────────────────
import SplashScreen from './src/screens/SplashScreen';
import UnlockScreen from './src/screens/UnlockScreen';
import ChatHomeScreen from './src/screens/ChatHomeScreen';
import { AppDrawer } from './src/components/navigation/AppDrawer';
import DashboardScreen from './src/screens/DashboardScreen';

// Phase 2+ screens — imported lazily when implemented
import ModelsScreen from './src/screens/ModelsScreen';
import SyncScreen from './src/screens/SyncScreen';
import BackupScreen from './src/screens/BackupScreen';
import UpgradeScreen from './src/screens/UpgradeScreen';
// import SettingsScreen from './src/screens/SettingsScreen';

// ─────────────────────────────────────────────────────────────────────────────
// Navigator instances
// ─────────────────────────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<MainDrawerParamList>();

// ─────────────────────────────────────────────────────────────────────────────
// Main Drawer — all authenticated screens
// ─────────────────────────────────────────────────────────────────────────────
function MainDrawerNavigator(): React.JSX.Element {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <AppDrawer {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: theme.colors.surface,
          width: 280,
          borderRightWidth: 1,
          borderRightColor: theme.colors.border,
        },
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.text.secondary,
        drawerLabelStyle: {
          fontFamily: theme.typography.fontFamily.medium,
          fontSize: theme.typography.fontSize.sm,
          letterSpacing: theme.typography.letterSpacing.wide,
          textTransform: 'uppercase',
          marginLeft: -8,
        },
        drawerItemStyle: {
          borderRadius: 0, // Brutalist — no rounded items
          marginHorizontal: 0,
          paddingHorizontal: theme.spacing.lg,
        },
        overlayColor: `${theme.colors.background}cc`,
      }}
      initialRouteName="ChatHome"
    >
      <Drawer.Screen
        name="ChatHome"
        component={ChatHomeScreen}
        options={{ drawerLabel: 'Chat', title: 'Chat' }}
      />
      <Drawer.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ drawerLabel: 'Dashboard', title: 'Dashboard' }}
      />
      {/* Phase 2+ screens — uncomment as implemented */}
      <Drawer.Screen name="Models" component={ModelsScreen} options={{ drawerLabel: 'Models' }} />
      <Drawer.Screen name="Sync" component={SyncScreen} options={{ drawerLabel: 'Sync' }} />
      <Drawer.Screen name="Backup" component={BackupScreen} options={{ drawerLabel: 'Backup' }} />
      <Drawer.Screen name="Upgrade" component={UpgradeScreen} options={{ drawerLabel: 'Upgrade' }} />
      {/* <Drawer.Screen name="Settings" component={SettingsScreen} options={{ drawerLabel: 'Settings' }} /> */}
    </Drawer.Navigator>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root Stack — unauthenticated entry flow
// ─────────────────────────────────────────────────────────────────────────────
function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: theme.colors.background },
      }}
      initialRouteName="Splash"
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Setup" component={UnlockScreen} />
      <Stack.Screen name="Unlock" component={UnlockScreen} />
      <Stack.Screen name="Main" component={MainDrawerNavigator} />
    </Stack.Navigator>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App Root
// ─────────────────────────────────────────────────────────────────────────────
export default function App(): React.JSX.Element {
  return (
    <ConvexProvider client={convex}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer>
            <StatusBar
              barStyle="light-content"
              backgroundColor={theme.colors.background}
              translucent={false}
            />
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ConvexProvider>
  );
}


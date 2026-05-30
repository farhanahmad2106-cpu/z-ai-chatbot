/**
 * SplashScreen
 * First screen shown on app launch.
 * Responsibilities:
 *   1. Call GET /api/v1/auth/status to check backend health + lock state.
 *   2. Route to SetupScreen (first boot), UnlockScreen (returning user),
 *      or directly to Main (if backend reports already unlocked — hot reload edge case).
 *   3. Display brand identity and a minimal loading state.
 *   4. Show a retry button if the backend is unreachable.
 *
 * Navigation: Splash → Setup | Unlock | Main
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { theme } from '../theme';
import { RootStackParamList } from '../types/chat';
import { useAuthStore } from '../stores/useAuthStore';
import { getBaseUrl } from '../services/baseUrl';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SPLASH_MIN_DURATION_MS = 1200;

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SplashScreen({ navigation }: Props): React.JSX.Element {
  const setAuthStatus = useAuthStore((s) => s.setAuthStatus);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Fade-in animation refs
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;

  const runEntrance = useCallback(() => {
    logoOpacity.setValue(0);
    taglineOpacity.setValue(0);
    dotsOpacity.setValue(0);

    Animated.sequence([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(dotsOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoOpacity, taglineOpacity, dotsOpacity]);

  const checkBackendAndRoute = useCallback(async () => {
    setError(null);
    setRetrying(true);
    const BACKEND_URL = getBaseUrl();
    const startTime = Date.now();

    try {
      // 1. Health probe — backend must be running
      const healthRes = await fetch(`${BACKEND_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!healthRes.ok) {
        throw new Error(`Backend returned status ${healthRes.status}`);
      }

      // 2. Auth status — determines routing
      const statusRes = await fetch(`${BACKEND_URL}/api/v1/auth/status`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!statusRes.ok) {
        throw new Error(`Auth status check failed: ${statusRes.status}`);
      }

      const status = await statusRes.json();

      // Store the status in Zustand
      setAuthStatus(status);

      // 3. Enforce minimum splash duration (brand moment)
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, SPLASH_MIN_DURATION_MS - elapsed);
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));

      // 4. Route based on status
      if (status.is_unlocked) {
        navigation.replace('Main');
      } else if (status.is_first_launch) {
        navigation.replace('Setup');
      } else {
        navigation.replace('Unlock');
      }
    } catch (err: any) {
      const message =
        err?.name === 'AbortError' || err?.message?.includes('fetch')
          ? 'Cannot reach the local backend.\nMake sure the Z-AI backend is running on this device.'
          : err?.message || 'An unexpected error occurred.';
      setError(message);
      setRetrying(false);
    }
  }, [navigation, setAuthStatus]);

  useEffect(() => {
    runEntrance();
    checkBackendAndRoute();
  }, [runEntrance, checkBackendAndRoute]);

  return (
    <View style={styles.container}>
      {/* Brand Mark */}
      <Animated.View style={[styles.brandContainer, { opacity: logoOpacity }]}>
        <View style={styles.logoMark}>
          <Text style={styles.logoZ}>Z</Text>
        </View>
        <Text style={styles.appName}>Z-AI</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Quietly Intelligent. Entirely Yours.
      </Animated.Text>

      {/* Error State */}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              runEntrance();
              checkBackendAndRoute();
            }}
            activeOpacity={0.75}
          >
            <Text style={styles.retryText}>RETRY CONNECTION</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Loading indicator */
        <Animated.View style={[styles.loadingRow, { opacity: dotsOpacity }]}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </Animated.View>
      )}

      {/* Version */}
      <Text style={styles.version}>v1.0.0</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  logoMark: {
    width: 72,
    height: 72,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  logoZ: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 40,
    color: theme.colors.background,
    letterSpacing: -1,
  },
  appName: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.fontSize['3xl'],
    color: theme.colors.text.primary,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  tagline: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.muted,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
    marginBottom: theme.spacing['2xl'],
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing['3xl'],
  },
  dot: {
    width: 6,
    height: 6,
    backgroundColor: theme.colors.text.muted,
    opacity: 0.3,
  },
  dotActive: {
    backgroundColor: theme.colors.primary,
    opacity: 1,
  },
  errorContainer: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing['3xl'],
    gap: 12,
  },
  errorIcon: {
    fontSize: 28,
    color: theme.colors.error,
  },
  errorText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.error,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.background,
    letterSpacing: theme.typography.letterSpacing.wide,
  },
  version: {
    position: 'absolute',
    bottom: theme.spacing.xl,
    fontFamily: theme.typography.fontFamily.mono,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.muted,
    opacity: 0.4,
  },
});

/**
 * UnlockScreen
 * Shown when the app is installed but locked (not first boot).
 * Also used as the SetupScreen variant (isSetup=true) for first-boot PIN creation.
 *
 * Responsibilities:
 *   - Render 6-dot PIN pad UI
 *   - Animate each digit entry with a subtle scale pulse
 *   - Call /auth/setup (first boot) or /auth/unlock (returning user)
 *   - Store JWT in useAuthStore on success
 *   - Display shake animation + error message on wrong PIN
 *   - Navigate to Main on success
 *
 * Navigation: Unlock → Main
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { theme } from '../theme';
import { RootStackParamList, TokenResponse } from '../types/chat';
import { useAuthStore } from '../stores/useAuthStore';
import { getBaseUrl } from '../services/baseUrl';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const PIN_LENGTH = 6;

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ScreenMode = 'unlock' | 'setup' | 'confirm'; // confirm = second PIN entry for setup

type Props =
  | NativeStackScreenProps<RootStackParamList, 'Unlock'>
  | NativeStackScreenProps<RootStackParamList, 'Setup'>;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function UnlockScreen({ navigation, route }: Props): React.JSX.Element {
  const isSetup = route.name === 'Setup';

  const [mode, setMode] = useState<ScreenMode>(isSetup ? 'setup' : 'unlock');
  const [pin, setPin] = useState<string>('');
  const [firstPin, setFirstPin] = useState<string>(''); // Only used in setup confirm step
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setSession = useAuthStore((s) => s.setSession);

  // Animations
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(0)).current;

  // Dot scale animations (one per PIN digit)
  const dotScales = useRef(
    Array.from({ length: PIN_LENGTH }, () => new Animated.Value(1))
  ).current;

  // ── Entrance animation ───────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(containerOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [containerOpacity]);

  // ── Shake on error ───────────────────────────────────────────────────────
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // ── Dot pulse on digit entry ─────────────────────────────────────────────
  const pulseDot = useCallback(
    (index: number) => {
      Animated.sequence([
        Animated.timing(dotScales[index], {
          toValue: 1.4,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(dotScales[index], {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [dotScales]
  );

  // ── Key press handler ────────────────────────────────────────────────────
  const handleKey = useCallback(
    (key: string) => {
      if (isLoading) return;
      setErrorMessage(null);

      if (key === '⌫') {
        setPin((prev) => prev.slice(0, -1));
        return;
      }

      if (pin.length >= PIN_LENGTH) return;

      const newPin = pin + key;
      pulseDot(newPin.length - 1);
      setPin(newPin);

      // Auto-submit when PIN_LENGTH is reached
      if (newPin.length === PIN_LENGTH) {
        handleSubmit(newPin);
      }
    },
    [pin, isLoading, pulseDot] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Submit handler ───────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (completedPin: string) => {
      setIsLoading(true);

      try {
        if (mode === 'setup') {
          // First PIN entry — move to confirm step
          setFirstPin(completedPin);
          setPin('');
          setMode('confirm');
          setIsLoading(false);
          return;
        }

        if (mode === 'confirm') {
          // Confirm step — PINs must match
          if (completedPin !== firstPin) {
            setPin('');
            setErrorMessage("PINs don't match. Try again.");
            triggerShake();
            setMode('setup');
            setFirstPin('');
            setIsLoading(false);
            return;
          }
          // PINs match — proceed to /auth/setup
          await callAuthEndpoint('/api/v1/auth/setup', firstPin);
          return;
        }

        // mode === 'unlock'
        await callAuthEndpoint('/api/v1/auth/unlock', completedPin);
      } catch {
        setPin('');
        setIsLoading(false);
      }
    },
    [mode, firstPin, triggerShake] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── API call ─────────────────────────────────────────────────────────────
  const callAuthEndpoint = async (endpoint: string, pinValue: string) => {
    const res = await fetch(`${getBaseUrl()}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinValue }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      setPin('');
      setErrorMessage(
        res.status === 401 ? 'Incorrect PIN. Try again.' : (err.detail ?? 'Something went wrong.')
      );
      triggerShake();
      setIsLoading(false);
      return;
    }

    const data: TokenResponse = await res.json();
    setSession(data);
    setIsLoading(false);
    navigation.replace('Main');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  const title = mode === 'unlock' ? 'Enter PIN' : mode === 'setup' ? 'Create PIN' : 'Confirm PIN';
  const subtitle =
    mode === 'unlock'
      ? 'Enter your PIN to access Z-AI'
      : mode === 'setup'
      ? `Choose a ${PIN_LENGTH}-digit PIN to protect your data`
      : 'Enter the same PIN again to confirm';

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoMark}>
          <Text style={styles.logoZ}>Z</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {/* PIN Dots */}
      <Animated.View
        style={[
          styles.dotsContainer,
          { transform: [{ translateX: shakeAnim }] },
        ]}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const isFilled = i < pin.length;
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                isFilled && styles.dotFilled,
                { transform: [{ scale: dotScales[i] }] },
              ]}
            />
          );
        })}
      </Animated.View>

      {/* Error Message */}
      {errorMessage != null && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}

      {/* Spacer */}
      <View style={styles.spacer} />

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYPAD_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((key, keyIndex) => {
              if (key === '') {
                return <View key={keyIndex} style={styles.keyPlaceholder} />;
              }
              return (
                <Pressable
                  key={keyIndex}
                  style={({ pressed }) => [
                    styles.key,
                    key === '⌫' && styles.keyBackspace,
                    pressed && styles.keyPressed,
                  ]}
                  onPress={() => handleKey(key)}
                  accessibilityLabel={key === '⌫' ? 'Delete' : key}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.keyText,
                      key === '⌫' && styles.keyBackspaceText,
                    ]}
                  >
                    {key}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Loading overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Verifying…</Text>
        </View>
      )}
    </Animated.View>
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
    paddingTop: 80,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing['2xl'],
  },
  logoMark: {
    width: 56,
    height: 56,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  logoZ: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 30,
    color: theme.colors.background,
  },
  title: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.fontSize['2xl'],
    color: theme.colors.text.primary,
    letterSpacing: theme.typography.letterSpacing.tight,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.muted,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: theme.spacing.lg,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 0, // Brutalist — square dots
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  errorText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.status.error,
    textAlign: 'center',
  },
  spacer: {
    flex: 1,
  },
  keypad: {
    width: '100%',
    maxWidth: 300,
    gap: 12,
    paddingHorizontal: theme.spacing.lg,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  key: {
    flex: 1,
    aspectRatio: 1.4,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  keyBackspace: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  keyPressed: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  keyPlaceholder: {
    flex: 1,
    aspectRatio: 1.4,
  },
  keyText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.fontSize.xl,
    color: theme.colors.text.primary,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  keyBackspaceText: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.secondary,
  },
  loadingOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: `${theme.colors.background}cc`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily.mono,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.muted,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
});

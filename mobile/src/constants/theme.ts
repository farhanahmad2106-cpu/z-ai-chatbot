import { Platform } from 'react-native';

/**
 * Z-SeHealth Unified Design System & Theme Tokens
 */
export const Palette = {
  // Surface / Dark Brutalist backgrounds
  slate950: '#020617', // Root background
  slate900: '#0f172a', // Cards, elevated containers, modals
  slate800: '#1e293b', // Borders, separators, item backgrounds
  slate700: '#334155', // Highlight borders / active borders
  slate600: '#475569', // Muted borders
  slate500: '#64748b', // Secondary muted text
  slate400: '#94a3b8', // Primary body text / subtext
  slate300: '#cbd5e1', // High contrast text
  slate200: '#e2e8f0', // Soft white text
  slate100: '#f1f5f9', // White / bright text

  // Accents & Semantic Colorways
  emerald400: '#34d399', // Primary accent, success, safe badge
  emerald500: '#10b981', // Button fill, active indicators
  rose400: '#f43f5e',    // Danger, critical allergen, high risk
  rose500: '#e11d48',    // Error fill
  amber400: '#fbbf24',   // Warning, streak, moderate risk
  amber500: '#f59e0b',   // Warning fill
  sky400: '#38bdf8',     // Info, protein indicators
} as const;

export const Colors = {
  light: {
    text: '#020617',
    background: '#ffffff',
    backgroundElement: '#f1f5f9',
    backgroundSelected: '#e2e8f0',
    textSecondary: '#64748b',
    border: '#cbd5e1',
    primary: Palette.emerald500,
    accent: Palette.emerald400,
    danger: Palette.rose400,
    warning: Palette.amber400,
  },
  dark: {
    text: Palette.slate100,
    background: Palette.slate950,
    backgroundElement: Palette.slate900,
    backgroundSelected: Palette.slate800,
    textSecondary: Palette.slate400,
    border: Palette.slate800,
    primary: Palette.emerald400,
    accent: Palette.emerald400,
    danger: Palette.rose400,
    warning: Palette.amber400,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display, Inter, sans-serif)',
    serif: 'var(--font-serif, Georgia, serif)',
    rounded: 'var(--font-rounded, sans-serif)',
    mono: 'var(--font-mono, monospace)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

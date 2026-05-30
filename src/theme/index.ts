import { AppTheme } from './types';

export const theme: AppTheme = {
  colors: {
    background: '#0d0e12',
    onBackground: '#e4e6eb',
    surface: '#16181f',
    onSurface: '#e4e6eb',
    surfaceVariant: '#20232d',
    onSurfaceVariant: '#a0a5b5',
    outline: '#383c4a',
    outlineVariant: '#4f5466',
    primary: '#4f46e5',
    onPrimary: '#ffffff',
    secondary: '#10b981',
    onSecondary: '#ffffff',
    tertiary: '#f59e0b',
    onTertiary: '#ffffff',
    error: '#ef4444',
    onError: '#ffffff',
    errorContainer: '#7f1d1d',

    // Custom mappings
    border: '#383c4a',
    text: {
      primary: '#e4e6eb',
      secondary: '#a0a5b5',
      muted: '#717684',
    },
    status: {
      error: '#ef4444',
    },
  },
  typography: {
    displayLg: {
      fontFamily: 'System',
      fontSize: 36,
      fontWeight: '700',
      lineHeight: 44,
      letterSpacing: -0.5,
    },
    headlineLg: {
      fontFamily: 'System',
      fontSize: 26,
      fontWeight: '600',
      lineHeight: 32,
      letterSpacing: -0.2,
    },
    headlineMd: {
      fontFamily: 'System',
      fontSize: 20,
      fontWeight: '600',
      lineHeight: 26,
    },
    bodyLg: {
      fontFamily: 'System',
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
    },
    bodyMd: {
      fontFamily: 'System',
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 20,
    },
    labelMd: {
      fontFamily: 'System',
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 18,
    },
    labelSm: {
      fontFamily: 'System',
      fontSize: 11,
      fontWeight: '600',
      lineHeight: 16,
      letterSpacing: 0.5,
    },

    // Custom mappings
    fontFamily: {
      bold: 'System',
      medium: 'System',
      regular: 'System',
      mono: 'System',
    },
    fontSize: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      '2xl': 24,
      '3xl': 32,
    },
    letterSpacing: {
      tight: -0.5,
      wide: 0.5,
    },
  },
  spacing: {
    unit: 4,
    gutter: 16,
    marginMobile: 16,
    marginDesktop: 32,
    sidebarWidth: 280,
    maxWidthChat: 800,

    // Custom mappings
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
  },
};

export default theme;

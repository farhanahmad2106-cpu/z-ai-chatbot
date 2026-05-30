export interface ThemeColors {
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  tertiary: string;
  onTertiary: string;
  error: string;
  onError: string;
  errorContainer: string;

  // Custom tokens used by SplashScreen/UnlockScreen/App
  border: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  status: {
    error: string;
  };
}

export interface TypographyToken {
  fontFamily: string;
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700' | 'bold' | 'normal';
  lineHeight: number;
  letterSpacing?: number;
}

export interface ThemeTypography {
  displayLg: TypographyToken;
  headlineLg: TypographyToken;
  headlineMd: TypographyToken;
  bodyLg: TypographyToken;
  bodyMd: TypographyToken;
  labelMd: TypographyToken;
  labelSm: TypographyToken;

  // Custom tokens used by SplashScreen/UnlockScreen/App
  fontFamily: {
    bold: string;
    medium: string;
    regular: string;
    mono: string;
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    '2xl': number;
    '3xl': number;
  };
  letterSpacing: {
    tight: number;
    wide: number;
  };
}

export interface ThemeSpacing {
  unit: number;
  gutter: number;
  marginMobile: number;
  marginDesktop: number;
  sidebarWidth: number;
  maxWidthChat: number;

  // Custom tokens used by SplashScreen/UnlockScreen/App
  sm: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
  '3xl': number;
}

export interface AppTheme {
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
}

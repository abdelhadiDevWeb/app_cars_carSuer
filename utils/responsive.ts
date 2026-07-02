import { Dimensions, Platform, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Breakpoints
const breakpoints = {
  small: 375,   // iPhone SE, small phones
  medium: 414,  // iPhone 11 Pro Max, medium phones
  large: 768,   // Tablets
};

// Responsive scaling function
const scale = (size: number): number => {
  const baseWidth = 375; // iPhone X width as base
  return (SCREEN_WIDTH / baseWidth) * size;
};

// Font scaling function
const fontScale = (size: number): number => {
  const baseWidth = 375;
  const scaleFactor = SCREEN_WIDTH / baseWidth;
  const newSize = size * scaleFactor;
  
  // Limit font scaling
  if (Platform.OS === 'ios') {
    return Math.max(12, Math.min(newSize, size * 1.2));
  }
  return Math.max(12, Math.min(newSize, size * 1.3));
};

// Get responsive value based on screen width
const getResponsiveValue = <T,>(values: {
  small?: T;
  medium?: T;
  large?: T;
  default: T;
}): T => {
  if (SCREEN_WIDTH < breakpoints.small) {
    return values.small ?? values.default;
  } else if (SCREEN_WIDTH < breakpoints.medium) {
    return values.medium ?? values.default;
  } else if (SCREEN_WIDTH < breakpoints.large) {
    return values.large ?? values.default;
  }
  return values.default;
};

// Check if device is small
const isSmallDevice = (): boolean => SCREEN_WIDTH < breakpoints.small;

// Check if device is tablet
const isTablet = (): boolean => SCREEN_WIDTH >= breakpoints.large;

// Get responsive padding
const getPadding = (): {
  horizontal: number;
  vertical: number;
  small: number;
  medium: number;
  large: number;
} => {
  if (SCREEN_WIDTH < breakpoints.small) {
    return {
      horizontal: scale(12),
      vertical: scale(12),
      small: scale(8),
      medium: scale(12),
      large: scale(16),
    };
  } else if (SCREEN_WIDTH < breakpoints.medium) {
    return {
      horizontal: scale(16),
      vertical: scale(16),
      small: scale(12),
      medium: scale(16),
      large: scale(20),
    };
  } else {
    return {
      horizontal: scale(20),
      vertical: scale(20),
      small: scale(16),
      medium: scale(20),
      large: scale(24),
    };
  }
};

// Get responsive font sizes
const getFontSizes = () => ({
  xs: fontScale(10),
  sm: fontScale(12),
  base: fontScale(14),
  md: fontScale(16),
  lg: fontScale(18),
  xl: fontScale(20),
  '2xl': fontScale(24),
  '3xl': fontScale(30),
  '4xl': fontScale(36),
});

/** Responsive app logo size — centered, clamped for all phone/tablet widths. */
export type AppLogoVariant = 'splash' | 'auth' | 'header';

const APP_LOGO_CONFIG: Record<
  AppLogoVariant,
  { ratio: number; min: number; max: number }
> = {
  splash: { ratio: 0.36, min: 120, max: 200 },
  auth: { ratio: 0.22, min: 72, max: 104 },
  header: { ratio: 0.12, min: 40, max: 56 },
};

const getAppLogoSize = (variant: AppLogoVariant = 'auth'): number => {
  const minDim = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT);
  const { ratio, min, max } = APP_LOGO_CONFIG[variant];
  const computed = minDim * ratio;
  return Math.round(Math.max(min, Math.min(max, computed)));
};

export {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  scale,
  fontScale,
  getResponsiveValue,
  isSmallDevice,
  isTablet,
  getPadding,
  getFontSizes,
  getAppLogoSize,
  breakpoints,
};

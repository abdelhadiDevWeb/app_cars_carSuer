import { Platform, StyleSheet } from 'react-native';
import { getFontSizes, scale } from '@/utils/responsive';

const fontSizes = getFontSizes();

/** Avoid clipped ascenders on bold titles (Android + heavy font weights). */
export const pageTitleBlockStyles = StyleSheet.create({
  block: {
    alignItems: 'center',
    marginBottom: scale(20),
    paddingHorizontal: scale(8),
    width: '100%',
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    lineHeight: Math.round(fontSizes['3xl'] * 1.35),
    letterSpacing: 0.5,
    marginBottom: scale(8),
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  subtitle: {
    fontSize: fontSizes.md,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
    lineHeight: Math.round(fontSizes.md * 1.45),
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  /** Headers with icon + title row (cars tab). */
  headerTitle: {
    fontSize: fontSizes['2xl'],
    fontWeight: '800',
    color: '#1f2937',
    lineHeight: Math.round(fontSizes['2xl'] * 1.35),
    marginBottom: scale(4),
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  headerSubtitle: {
    fontSize: fontSizes.sm,
    fontWeight: '500',
    color: '#64748b',
    lineHeight: Math.round(fontSizes.sm * 1.45),
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  /** Centered card headers (workshops tab). */
  cardTitle: {
    fontSize: fontSizes['2xl'],
    fontWeight: '800',
    color: '#1f2937',
    textAlign: 'center',
    width: '100%',
    lineHeight: Math.round(fontSizes['2xl'] * 1.35),
    marginBottom: scale(6),
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  cardSubtitle: {
    fontSize: fontSizes.sm,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
    width: '100%',
    lineHeight: Math.round(fontSizes.sm * 1.45),
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
});

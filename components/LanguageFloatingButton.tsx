import React from 'react';
import { Modal, Platform, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { getPadding, scale } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const padding = getPadding();

type Props = {
  position?: 'top-right' | 'bottom-right';
  bottomOffset?: number; // extra offset above tab bar if needed
  variant?: 'icon' | 'icon+label';
};

export function LanguageFloatingButton({
  position = 'top-right',
  bottomOffset = 0,
  variant = 'icon',
}: Props) {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);

  const currentLabel =
    language === 'fr'
      ? t('settings.language_fr')
      : language === 'en'
        ? t('settings.language_en')
        : t('settings.language_ar');

  return (
    <>
      <View pointerEvents="box-none" style={[styles.container, getPositionStyle(position, insets, bottomOffset)]}>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.85}
          style={styles.fabWrapper}
        >
          <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.fab}>
            <IconSymbol name="globe" size={scale(18)} color="#ffffff" />
            {variant === 'icon+label' ? (
              <ThemedText style={styles.fabText} numberOfLines={1}>
                {currentLabel}
              </ThemedText>
            ) : null}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />

          <Animated.View entering={FadeInDown.duration(250).springify()} style={styles.modalCard}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.modalCardInner}
            >
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>{t('settings.language')}</ThemedText>
                <TouchableOpacity onPress={() => setOpen(false)} activeOpacity={0.8}>
                  <IconSymbol name="xmark.circle.fill" size={scale(24)} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.options}>
                <TouchableOpacity
                  style={styles.option}
                  activeOpacity={0.8}
                  onPress={async () => {
                    await setLanguage('fr');
                    setOpen(false);
                  }}
                >
                  <ThemedText style={styles.optionText}>
                    {'🇫🇷  '}
                    {t('settings.language_fr')}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.option}
                  activeOpacity={0.8}
                  onPress={async () => {
                    await setLanguage('en');
                    setOpen(false);
                  }}
                >
                  <ThemedText style={styles.optionText}>
                    {'🇬🇧  '}
                    {t('settings.language_en')}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.option}
                  activeOpacity={0.8}
                  onPress={async () => {
                    await setLanguage('ar');
                    setOpen(false);
                  }}
                >
                  <ThemedText style={styles.optionText}>
                    {'🇩🇿  '}
                    {t('settings.language_ar')}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

function getPositionStyle(
  position: 'top-right' | 'bottom-right',
  insets: { top: number; bottom: number },
  bottomOffset: number
): ViewStyle {
  if (position === 'bottom-right') {
    // Sit above the bottom tab bar. 92 is a safe default for this app's custom tab bar.
    return {
      top: undefined,
      bottom: Math.max(scale(12), insets.bottom + scale(92) + bottomOffset),
    };
  }
  return {
    top: Math.max(scale(8), insets.top + scale(6)),
    bottom: undefined,
  };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: scale(12),
    right: scale(16),
    zIndex: 10000,
    elevation: 10000,
  },
  fabWrapper: {
    borderRadius: scale(18),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingHorizontal: padding.medium,
    paddingVertical: scale(10),
    borderRadius: scale(18),
  },
  fabText: {
    color: '#ffffff',
    fontWeight: '800',
    maxWidth: scale(120),
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    marginTop: scale(90),
    marginHorizontal: padding.horizontal,
    borderRadius: scale(18),
    overflow: 'hidden',
  },
  modalCardInner: {
    padding: padding.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: padding.medium,
  },
  modalTitle: {
    fontWeight: '900',
    fontSize: scale(18),
    color: '#0f172a',
  },
  options: {
    gap: padding.small,
  },
  option: {
    paddingVertical: padding.medium,
    paddingHorizontal: padding.medium,
    borderRadius: scale(14),
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
  },
  optionText: {
    fontWeight: '800',
    color: '#0f172a',
  },
});


import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { getPadding, scale } from '@/utils/responsive';

const padding = getPadding();

type Props = {
  visible: boolean;
  onRequestClose: () => void;
};

/**
 * Language picker (FR / EN / AR). Replaces the old floating globe FAB.
 */
export function LanguageSelectionModal({ visible, onRequestClose }: Props) {
  const { setLanguage } = useLanguage();
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onRequestClose} />

        <Animated.View entering={FadeInDown.duration(250).springify()} style={styles.modalCard}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.modalCardInner}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('settings.language')}</ThemedText>
              <TouchableOpacity onPress={onRequestClose} activeOpacity={0.8}>
                <IconSymbol name="xmark.circle.fill" size={scale(24)} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.options}>
              <TouchableOpacity
                style={styles.option}
                activeOpacity={0.8}
                onPress={async () => {
                  await setLanguage('fr');
                  onRequestClose();
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
                  onRequestClose();
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
                  onRequestClose();
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
  );
}

const styles = StyleSheet.create({
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

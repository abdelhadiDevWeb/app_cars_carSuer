import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getFontSizes, scale } from '@/utils/responsive';
import type { StarterPlanInfo } from '@/utils/starterPlan';

const fontSizes = getFontSizes();

type ModalShellProps = {
  iconName: string;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  buttonLabel: string;
  onPress: () => void;
  gradient?: [string, string];
};

function ModalShell({
  iconName,
  iconBg,
  iconColor,
  title,
  body,
  buttonLabel,
  onPress,
  gradient = ['#0d9488', '#14b8a6'],
}: ModalShellProps) {
  return (
    <View style={styles.modalOverlay}>
      <Animated.View entering={ZoomIn.duration(400).springify()} style={styles.modalContent}>
        <LinearGradient colors={['#ffffff', '#f8fafc']} style={styles.modalInner}>
          <View style={[styles.modalIconCircle, { backgroundColor: iconBg }]}>
            <IconSymbol name={iconName as any} size={scale(32)} color={iconColor} />
          </View>
          <ThemedText style={styles.modalTitle}>{title}</ThemedText>
          <ThemedText style={styles.modalText}>{body}</ThemedText>
          <TouchableOpacity onPress={onPress} style={styles.modalBtn} activeOpacity={0.9}>
            <LinearGradient colors={gradient} style={styles.modalBtnGradient}>
              <ThemedText style={styles.modalBtnText}>{buttonLabel}</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export function StarterPlanWelcomeModal({
  plan,
  onContinue,
}: {
  plan: StarterPlanInfo | null;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const days = plan?.time ?? 365;
  const isFree = plan?.isFree ?? plan?.price === 0;
  const planName = plan?.name ?? 'Starter Plan';

  return (
    <View style={styles.modalOverlay}>
      <Animated.View entering={ZoomIn.duration(400).springify()} style={styles.modalContent}>
        <LinearGradient colors={['#ffffff', '#f0fdf4']} style={styles.modalInner}>
          <View style={[styles.modalIconCircle, { backgroundColor: '#dcfce7' }]}>
            <IconSymbol name="checkmark.seal.fill" size={scale(32)} color="#16a34a" />
          </View>
          <ThemedText style={styles.modalTitle}>{t('starterPlan.welcomeTitle')}</ThemedText>
          <ThemedText style={styles.modalText}>
            {isFree
              ? t('starterPlan.welcomeBodyFree', { days })
              : t('starterPlan.welcomeBodyPaid', { days, price: plan?.price ?? 0 })}
          </ThemedText>

          <View style={styles.planDetailsCard}>
            <View style={styles.planDetailRow}>
              <ThemedText style={styles.planDetailLabel}>{t('starterPlan.planLabel')}</ThemedText>
              <ThemedText style={styles.planDetailValue}>{planName}</ThemedText>
            </View>
            <View style={styles.planDetailDivider} />
            <View style={styles.planDetailRow}>
              <ThemedText style={styles.planDetailLabel}>{t('starterPlan.priceLabel')}</ThemedText>
              <ThemedText style={[styles.planDetailValue, isFree && styles.planDetailFree]}>
                {isFree ? t('starterPlan.priceFree') : `${plan?.price ?? 0} DZD`}
              </ThemedText>
            </View>
            <View style={styles.planDetailDivider} />
            <View style={styles.planDetailRow}>
              <ThemedText style={styles.planDetailLabel}>{t('starterPlan.durationLabel')}</ThemedText>
              <ThemedText style={styles.planDetailValue}>
                {days >= 365
                  ? t('starterPlan.durationOneYear', { days })
                  : t('starterPlan.durationDays', { days })}
              </ThemedText>
            </View>
          </View>

          <TouchableOpacity onPress={onContinue} style={styles.modalBtn} activeOpacity={0.9}>
            <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.modalBtnGradient}>
              <ThemedText style={styles.modalBtnText}>{t('login.goToMySpace')}</ThemedText>
              <IconSymbol name="arrow.right" size={scale(16)} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export function StarterPlanBlockedModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <ModalShell
      iconName="exclamationmark.triangle.fill"
      iconBg="#fef3c7"
      iconColor="#f59e0b"
      title={t('starterPlan.blockedTitle')}
      body={t('starterPlan.blockedBody')}
      buttonLabel={t('starterPlan.blockedOk')}
      onPress={onClose}
      gradient={['#64748b', '#475569']}
    />
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(24),
    zIndex: 99999,
    elevation: 99999,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  modalInner: {
    padding: scale(32),
    alignItems: 'center',
    borderRadius: scale(24),
  },
  modalIconCircle: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(16),
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: scale(10),
    textAlign: 'center',
  },
  modalText: {
    fontSize: fontSizes.base,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: scale(24),
    lineHeight: scale(22),
  },
  modalBtn: {
    borderRadius: scale(14),
    overflow: 'hidden',
    width: '100%',
  },
  modalBtnGradient: {
    paddingVertical: scale(14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
  },
  planDetailsCard: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: scale(16),
    marginBottom: scale(24),
  },
  planDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: scale(12),
  },
  planDetailDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: scale(12),
  },
  planDetailLabel: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    fontWeight: '600',
    flex: 1,
  },
  planDetailValue: {
    fontSize: fontSizes.sm,
    color: '#0f172a',
    fontWeight: '800',
    textAlign: 'right',
    flex: 1,
  },
  planDetailFree: {
    color: '#059669',
  },
  modalBtnText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#ffffff',
  },
});

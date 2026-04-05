import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { useTranslation } from 'react-i18next';

const padding = getPadding();
const fontSizes = getFontSizes();

export default function FAQScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const { t } = useTranslation();

  const faqs = (t('faq.items', { returnObjects: true }) as any[]) || [];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(600).springify()}
          style={styles.header}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.headerGradient}
          >
            <ThemedText style={styles.title}>{t('faq.title')}</ThemedText>
            <ThemedText style={styles.subtitle}>
              {t('faq.subtitle')}
            </ThemedText>
          </LinearGradient>
        </Animated.View>

        {/* FAQ Items */}
        <View style={styles.faqContainer}>
          {faqs.map((faq: any, index: number) => (
            <Animated.View
              key={index}
              entering={FadeInDown.duration(600).delay(index * 50).springify()}
              style={styles.faqItem}
            >
              <TouchableOpacity
                onPress={() => toggleFAQ(index)}
                style={styles.faqHeader}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.faqQuestion}>{faq.question}</ThemedText>
                <IconSymbol
                  name={openIndex === index ? 'chevron.up' : 'chevron.down'}
                  size={scale(20)}
                  color="#0d9488"
                />
              </TouchableOpacity>
              {openIndex === index && (
                <View style={styles.faqAnswerContainer}>
                  <ThemedText style={styles.faqAnswer}>{faq.answer}</ThemedText>
                </View>
              )}
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: padding.large * 2,
  },
  header: {
    marginBottom: padding.large,
    borderRadius: scale(24),
    overflow: 'hidden',
    marginHorizontal: padding.horizontal,
    marginTop: padding.medium,
  },
  headerGradient: {
    padding: padding.large,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: '900',
    color: '#0d9488',
    marginBottom: padding.small,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: '#64748b',
    textAlign: 'center',
  },
  faqContainer: {
    paddingHorizontal: padding.horizontal,
    gap: padding.medium,
  },
  faqItem: {
    backgroundColor: '#ffffff',
    borderRadius: scale(16),
    overflow: 'hidden',
    borderWidth: scale(1),
    borderColor: '#e5e7eb',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: padding.medium,
    gap: padding.small,
  },
  faqQuestion: {
    flex: 1,
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#1f2937',
  },
  faqAnswerContainer: {
    paddingHorizontal: padding.medium,
    paddingBottom: padding.medium,
  },
  faqAnswer: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    lineHeight: fontSizes.sm * 1.6,
  },
});

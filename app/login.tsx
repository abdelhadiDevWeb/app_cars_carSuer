import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  ZoomIn,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { apiRequest } from '@/utils/backend';
import { useAuth } from '@/contexts/AuthContext';
import { SCREEN_WIDTH, SCREEN_HEIGHT, getPadding, getFontSizes, scale } from '@/utils/responsive';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

const padding = getPadding();
const fontSizes = getFontSizes();

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

const ADMIN_WEB_APP_URL = 'https://carsure-dz.vercel.app/';
const ADMIN_WEB_ONLY_NOTICE_KEY = 'admin_web_only_notice';

function AnimatedBlob({ delay, startX, startY, size, colors }: {
  delay: number; startX: number; startY: number; size: number; colors: string[];
}) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scaleVal = useSharedValue(1);

  useEffect(() => {
    translateY.value = withDelay(delay,
      withRepeat(
        withSequence(
          withTiming(-20, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(20, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, true
      )
    );
    translateX.value = withDelay(delay + 500,
      withRepeat(
        withSequence(
          withTiming(15, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
          withTiming(-15, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, true
      )
    );
    scaleVal.value = withDelay(delay + 200,
      withRepeat(
        withSequence(
          withTiming(1.15, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.9, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scaleVal.value },
    ],
  }));

  return (
    <Animated.View style={[{
      position: 'absolute',
      top: startY,
      left: startX,
      width: size,
      height: size,
      borderRadius: size / 2,
    }, animatedStyle]}>
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </Animated.View>
  );
}

function FocusableInput({
  icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, autoComplete,
  showToggle, onToggle, toggleActive, style,
}: {
  icon: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  autoComplete?: any;
  showToggle?: boolean;
  onToggle?: () => void;
  toggleActive?: boolean;
  style?: any;
}) {
  const [focused, setFocused] = useState(false);
  const borderProgress = useSharedValue(0);

  useEffect(() => {
    borderProgress.value = withSpring(focused ? 1 : 0, { damping: 15, stiffness: 150 });
  }, [focused]);

  const wrapperAnimStyle = useAnimatedStyle(() => {
    const borderColor = focused
      ? 'rgba(13, 148, 136, 0.5)'
      : '#e2e8f0';
    return {
      borderColor,
      shadowOpacity: interpolate(borderProgress.value, [0, 1], [0, 0.12]),
      shadowRadius: interpolate(borderProgress.value, [0, 1], [0, 12]),
      transform: [{ scale: interpolate(borderProgress.value, [0, 1], [1, 1.01]) }],
    };
  });

  return (
    <Animated.View style={[styles.inputWrapper, wrapperAnimStyle, style]}>
      <View style={[styles.inputIconContainer, focused && styles.inputIconContainerFocused]}>
        <IconSymbol name={icon as any} size={18} color={focused ? '#0d9488' : '#94a3b8'} />
      </View>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showToggle && (
        <TouchableOpacity onPress={onToggle} style={styles.eyeButton}>
          <IconSymbol
            name={toggleActive ? 'eye.fill' as any : 'eye.slash.fill' as any}
            size={20}
            color={toggleActive ? '#0d9488' : '#94a3b8'}
          />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const SUPPORT_PHONE = '0562232628';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [showAdminWebModal, setShowAdminWebModal] = useState(false);
  const [showVerifyEmailModal, setShowVerifyEmailModal] = useState(false);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState('');
  const [verifyAccountType, setVerifyAccountType] = useState<'user' | 'workshop'>('user');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyModalError, setVerifyModalError] = useState('');
  const [verifyInfoBanner, setVerifyInfoBanner] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [showEmailConfirmedModal, setShowEmailConfirmedModal] = useState(false);
  const [confirmedEmailHasAccess, setConfirmedEmailHasAccess] = useState(false);

  const buttonScale = useSharedValue(1);
  const logoPulse = useSharedValue(1);

  useEffect(() => {
    logoPulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, true
    );
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoPulse.value }],
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const onButtonPressIn = useCallback(() => {
    buttonScale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  }, []);
  const onButtonPressOut = useCallback(() => {
    buttonScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const v = await AsyncStorage.getItem(ADMIN_WEB_ONLY_NOTICE_KEY);
        if (cancelled || v !== '1') return;
        await AsyncStorage.removeItem(ADMIN_WEB_ONLY_NOTICE_KEY);
        setShowAdminWebModal(true);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const completeLoginAfterEmailVerification = async (loginEmail: string, loginPassword: string) => {
    try {
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      let data: Record<string, unknown>;
      try { data = await response.json(); } catch { setError(t('login.serverError')); return; }
      if (!response.ok) {
        if (data.needsActivation && data.status === false) {
          setConfirmedEmailHasAccess(false);
          setShowEmailConfirmedModal(true);
          return;
        }
        setError(typeof data.message === 'string' && data.message.trim() !== '' ? data.message : t('login.loginError'));
        return;
      }
      if (data.token && data.user) {
        const isAdmin = data.type === 'user' && data.role === 'admin';
        if (isAdmin) { setShowAdminWebModal(true); return; }
        await login(data.token as string, {
          _id: (data.user as any)._id || (data.user as any).id,
          email: (data.user as any).email,
          firstName: (data.user as any).firstName,
          lastName: (data.user as any).lastName,
          type: data.type as string,
          role: data.role as string,
        });
        const isSellerClient = data.type === 'user' && data.role !== 'admin';
        if (isSellerClient) {
          try {
            const res = await apiRequest('/abonnement/my-subscription');
            if (res.status === 401) return;
            if (!res.ok) { setConfirmedEmailHasAccess(true); setShowEmailConfirmedModal(true); return; }
            const subData = await res.json().catch(() => null);
            const now = Date.now();
            const isExpired = !subData?.ok || !subData?.hasSubscription || !subData?.subscription?.date_end || new Date(subData.subscription.date_end).getTime() < now;
            if (isExpired) {
              setShowExpiredModal(true);
              try { await apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify({ status: false }) }); } catch {}
              try { await apiRequest('/abonnement/deactivate', { method: 'POST' }); } catch {}
              return;
            }
          } catch {}
        }
        setConfirmedEmailHasAccess(true);
        setShowEmailConfirmedModal(true);
      }
    } catch { setError(t('login.cannotConnect')); }
  };

  const submitLoginWithCredentials = async (loginEmail: string, loginPassword: string) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      let data: Record<string, unknown>;
      try { data = await response.json(); } catch { setError(t('login.serverError')); setIsLoading(false); return; }
      if (!response.ok) {
        if (data.needsVerification) {
          const sent = data.verificationEmailSent !== false && data.verificationEmailSent !== 'false';
          const apiMsg = typeof data.message === 'string' ? data.message.trim() : '';
          const devCode = typeof data.verificationCode === 'string' ? data.verificationCode : '';
          setPendingVerifyEmail(loginEmail.trim());
          setVerifyAccountType(data.accountType === 'workshop' ? 'workshop' : 'user');
          setVerifyCode(''); setVerifyModalError('');
          if (!sent) {
            setVerifyInfoBanner(devCode ? `${apiMsg || t('login.verificationEmailNotSent')} (${t('login.devCodeHint')}: ${devCode})` : apiMsg || t('login.verificationEmailNotSent'));
          } else { setVerifyInfoBanner(null); }
          setShowVerifyEmailModal(true); setIsLoading(false); return;
        }
        if (data.needsActivation && data.status === false) { setShowActivationModal(true); setIsLoading(false); return; }
        setError(t('login.loginError')); setIsLoading(false); return;
      }
      if (data.token && data.user) {
        const isAdmin = data.type === 'user' && data.role === 'admin';
        if (isAdmin) { setShowAdminWebModal(true); setIsLoading(false); return; }
        await login(data.token as string, {
          _id: (data.user as any)._id || (data.user as any).id,
          email: (data.user as any).email,
          firstName: (data.user as any).firstName,
          lastName: (data.user as any).lastName,
          type: data.type as string,
          role: data.role as string,
        });
        const isSellerClient = data.type === 'user' && data.role !== 'admin';
        if (isSellerClient) {
          try {
            const res = await apiRequest('/abonnement/my-subscription');
            if (res.status === 401) { setIsLoading(false); return; }
            if (!res.ok) { router.replace('/(tabs)'); setIsLoading(false); return; }
            const subData = await res.json().catch(() => null);
            const now = Date.now();
            const isExpired = !subData?.ok || !subData?.hasSubscription || !subData?.subscription?.date_end || new Date(subData.subscription.date_end).getTime() < now;
            if (isExpired) {
              setShowExpiredModal(true);
              try { await apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify({ status: false }) }); } catch {}
              try { await apiRequest('/abonnement/deactivate', { method: 'POST' }); } catch {}
              setIsLoading(false); return;
            }
          } catch {}
        }
        router.replace('/(tabs)');
      }
      setIsLoading(false);
    } catch {
      setError(t('login.cannotConnect'));
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) { setError(t('auth.requiredFields')); return; }
    await submitLoginWithCredentials(email.trim(), password);
  };

  const handleResendVerification = async () => {
    if (!pendingVerifyEmail.trim()) return;
    setIsResending(true); setVerifyModalError('');
    try {
      const response = await apiRequest('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: pendingVerifyEmail.trim() }) });
      let data: any = {};
      try { data = await response.json(); } catch { setVerifyModalError(t('login.resendFailed')); setIsResending(false); return; }
      if (response.status === 400 && data.alreadyVerified) { setVerifyModalError(t('login.alreadyVerified')); setIsResending(false); return; }
      if (!response.ok || data.ok !== true) { setVerifyModalError(typeof data.message === 'string' && data.message.trim() !== '' ? data.message : t('login.resendFailed')); setIsResending(false); return; }
      if (data.sent === true) { Alert.alert('', t('login.resendSuccessSent')); setVerifyInfoBanner(null); }
      else {
        const devCode = typeof data.verificationCode === 'string' ? data.verificationCode : '';
        setVerifyModalError(devCode ? `${t('login.resendFailed')} (${t('login.devCodeHint')}: ${devCode})` : t('login.resendFailed'));
      }
    } catch { setVerifyModalError(t('login.cannotConnect')); } finally { setIsResending(false); }
  };

  const handleConfirmVerifyCode = async () => {
    const normalized = verifyCode.replace(/\D/g, '');
    if (normalized.length !== 6) { setVerifyModalError(t('register.codeMustBe6')); return; }
    setIsVerifyingCode(true); setVerifyModalError('');
    try {
      const typeForApi = verifyAccountType === 'workshop' ? 'workshop' : 'user';
      const response = await apiRequest('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: pendingVerifyEmail.trim(), code: normalized, type: typeForApi }) });
      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok || data.ok !== true) { setVerifyModalError(typeof data.message === 'string' && data.message.trim() !== '' ? data.message : t('register.invalidOrExpired')); setIsVerifyingCode(false); return; }
      setShowVerifyEmailModal(false); setVerifyCode(''); setVerifyModalError(''); setVerifyInfoBanner(null);
      await completeLoginAfterEmailVerification(pendingVerifyEmail.trim(), password);
    } catch { setVerifyModalError(t('register.invalidOrExpired')); } finally { setIsVerifyingCode(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Animated Background */}
      <LinearGradient
        colors={['#f8fafc', '#f1f5f9', '#ffffff']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <AnimatedBlob delay={0} startX={-80} startY={-60} size={260} colors={['rgba(13,148,136,0.1)', 'rgba(20,184,166,0.05)']} />
      <AnimatedBlob delay={800} startX={SCREEN_WIDTH - 120} startY={SCREEN_HEIGHT * 0.15} size={200} colors={['rgba(56,189,248,0.08)', 'rgba(14,165,233,0.04)']} />
      <AnimatedBlob delay={1500} startX={SCREEN_WIDTH * 0.3} startY={SCREEN_HEIGHT * 0.65} size={320} colors={['rgba(13,148,136,0.06)', 'rgba(45,212,191,0.03)']} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>
              {/* Logo / Icon */}
              <Animated.View entering={ZoomIn.duration(700).springify()} style={styles.logoSection}>
                <Animated.View style={[styles.logoOuter, logoAnimStyle]}>
                  <LinearGradient
                    colors={['#0d9488', '#14b8a6', '#2dd4bf']}
                    style={styles.logoGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <IconSymbol name="car.fill" size={scale(36)} color="#ffffff" />
                  </LinearGradient>
                </Animated.View>
              </Animated.View>

              {/* Title */}
              <Animated.View entering={FadeInDown.duration(600).delay(150).springify()}>
                <ThemedText style={styles.title}>{t('auth.login')}</ThemedText>
                <ThemedText style={styles.subtitle}>
                  {t('login.noAccount').replace(/\s*$/, '') || 'Welcome back to CarSure'}
                </ThemedText>
              </Animated.View>

              {/* Form Card */}
              <Animated.View entering={FadeInUp.duration(700).delay(300).springify()} style={styles.formCard}>
                <View style={styles.formCardInner}>
                  {/* Email */}
                  <Animated.View entering={FadeInDown.duration(500).delay(400)} style={styles.fieldGroup}>
                    <ThemedText style={styles.label}>{t('auth.email')}</ThemedText>
                    <FocusableInput
                      icon="envelope.fill"
                      placeholder="email@example.com"
                      value={email}
                      onChangeText={(text) => { setEmail(text); setError(''); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                    />
                  </Animated.View>

                  {/* Password */}
                  <Animated.View entering={FadeInDown.duration(500).delay(500)} style={styles.fieldGroup}>
                    <ThemedText style={styles.label}>{t('auth.password')}</ThemedText>
                    <FocusableInput
                      icon="lock.fill"
                      placeholder="••••••••"
                      value={password}
                      onChangeText={(text) => { setPassword(text); setError(''); }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoComplete="password"
                      showToggle
                      onToggle={() => setShowPassword(!showPassword)}
                      toggleActive={showPassword}
                    />
                  </Animated.View>

                  {/* Error */}
                  {error ? (
                    <Animated.View entering={FadeIn.duration(300)} style={styles.errorContainer}>
                      <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#ef4444" />
                      <ThemedText style={styles.errorText}>{error}</ThemedText>
                    </Animated.View>
                  ) : null}

                  {/* Forgot Password */}
                  <Animated.View entering={FadeInDown.duration(500).delay(600)}>
                    <TouchableOpacity onPress={() => router.push('/forgot-password')} style={styles.forgotRow}>
                      <ThemedText style={styles.forgotText}>{t('login.forgotPassword')}</ThemedText>
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Submit Button */}
                  <Animated.View entering={FadeInDown.duration(600).delay(700)} style={styles.buttonWrap}>
                    <AnimatedTouchableOpacity
                      onPress={handleSubmit}
                      onPressIn={onButtonPressIn}
                      onPressOut={onButtonPressOut}
                      disabled={isLoading}
                      activeOpacity={0.9}
                      style={[styles.submitButton, buttonAnimStyle]}
                    >
                      <LinearGradient
                        colors={['#0d9488', '#14b8a6', '#2dd4bf']}
                        style={styles.submitGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {isLoading ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <>
                            <ThemedText style={styles.submitText}>{t('auth.login')}</ThemedText>
                            <IconSymbol name="arrow.right" size={18} color="#ffffff" />
                          </>
                        )}
                      </LinearGradient>
                    </AnimatedTouchableOpacity>
                  </Animated.View>

                  {/* Register Link */}
                  <Animated.View entering={FadeIn.duration(500).delay(850)} style={styles.registerRow}>
                    <ThemedText style={styles.registerText}>{t('login.noAccount')} </ThemedText>
                    <TouchableOpacity onPress={() => router.push('/register')}>
                      <ThemedText style={styles.registerLink}>{t('auth.register')}</ThemedText>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </Animated.View>

              {/* Back to Home */}
              <Animated.View entering={FadeIn.duration(500).delay(950)}>
                <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backButton}>
                  <IconSymbol name="chevron.left" size={14} color="#94a3b8" />
                  <ThemedText style={styles.backText}>{t('login.back')}</ThemedText>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ──── MODALS ──── */}

      {/* Activation Required */}
      {showActivationModal && (
        <View style={styles.modalOverlay}>
          <Animated.View entering={ZoomIn.duration(400).springify()} style={styles.modalContent}>
            <LinearGradient colors={['#ffffff', '#f8fafc']} style={styles.modalInner}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#fef3c7' }]}>
                <IconSymbol name="checkmark.circle.fill" size={32} color="#f59e0b" />
              </View>
              <ThemedText style={styles.modalTitle}>{t('login.activationTitle')}</ThemedText>
              <ThemedText style={styles.modalText}>{t('login.activationBody')}</ThemedText>
              <TouchableOpacity onPress={() => setShowActivationModal(false)} style={styles.modalBtn}>
                <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.modalBtnGradient}>
                  <ThemedText style={styles.modalBtnText}>{t('login.activationOk')}</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {/* Email Verification */}
      {showVerifyEmailModal && (
        <View style={styles.modalOverlay}>
          <Animated.View entering={ZoomIn.duration(400).springify()} key={i18n.language} style={[styles.modalContent, { maxHeight: '92%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <LinearGradient colors={['#ffffff', '#f8fafc']} style={styles.modalInner}>
                <View style={[styles.modalIconCircle, { backgroundColor: '#dbeafe' }]}>
                  <IconSymbol name="envelope.fill" size={scale(28)} color="#2563eb" />
                </View>
                <ThemedText style={styles.modalTitle}>{t('login.confirmEmailTitle')}</ThemedText>
                <ThemedText style={styles.modalSubtext}>{t('login.confirmEmailSubtitle')}</ThemedText>
                <ThemedText style={styles.modalEmailHighlight}>{pendingVerifyEmail}</ThemedText>

                {verifyInfoBanner ? (
                  <View style={styles.verifyBanner}>
                    <ThemedText style={styles.verifyBannerText}>{verifyInfoBanner}</ThemedText>
                  </View>
                ) : null}

                <View style={styles.verifyField}>
                  <ThemedText style={styles.verifyLabel}>{t('login.confirmationCodeLabel')}</ThemedText>
                  <TextInput
                    style={styles.verifyInput}
                    placeholder={t('register.verifyCodePlaceholder')}
                    placeholderTextColor="#94a3b8"
                    value={verifyCode}
                    onChangeText={(v) => { setVerifyCode(v.replace(/\D/g, '').slice(0, 6)); setVerifyModalError(''); }}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>

                {verifyModalError ? (
                  <View style={styles.verifyErrorBox}>
                    <ThemedText style={styles.verifyErrorText}>{verifyModalError}</ThemedText>
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={handleConfirmVerifyCode}
                  disabled={isVerifyingCode || verifyCode.replace(/\D/g, '').length !== 6}
                  style={[styles.modalBtn, (isVerifyingCode || verifyCode.replace(/\D/g, '').length !== 6) && { opacity: 0.5 }]}
                >
                  <LinearGradient colors={['#14b8a6', '#0d9488']} style={[styles.modalBtnGradient, isVerifyingCode && { flexDirection: 'row', gap: scale(10) }]}>
                    {isVerifyingCode ? <><ActivityIndicator color="#ffffff" /><ThemedText style={styles.modalBtnText}>{t('login.verifyingCode')}</ThemedText></> : <ThemedText style={styles.modalBtnText}>{t('login.confirmCodeButton')}</ThemedText>}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleResendVerification} disabled={isResending} style={[styles.resendBtn, isResending && { opacity: 0.5 }]}>
                  {isResending ? <ActivityIndicator color="#374151" /> : <ThemedText style={styles.resendBtnText}>{t('login.resendVerificationEmail')}</ThemedText>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setShowVerifyEmailModal(false); setVerifyCode(''); setVerifyModalError(''); setVerifyInfoBanner(null); }}>
                  <ThemedText style={styles.modalDismiss}>{t('common.cancel')}</ThemedText>
                </TouchableOpacity>
              </LinearGradient>
            </ScrollView>
          </Animated.View>
        </View>
      )}

      {/* Email Confirmed */}
      {showEmailConfirmedModal && (
        <View style={styles.modalOverlay}>
          <Animated.View entering={ZoomIn.duration(400).springify()} key={`confirmed-${i18n.language}`} style={styles.modalContent}>
            <LinearGradient colors={['#ffffff', '#f8fafc']} style={styles.modalInner}>
              <View style={[styles.modalIconCircle, { backgroundColor: confirmedEmailHasAccess ? '#dcfce7' : '#fef9c3' }]}>
                <IconSymbol name={confirmedEmailHasAccess ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'} size={scale(36)} color={confirmedEmailHasAccess ? '#16a34a' : '#ca8a04'} />
              </View>
              <ThemedText style={styles.modalTitle}>{t('login.emailConfirmedTitle')}</ThemedText>
              <ThemedText style={styles.modalText}>{confirmedEmailHasAccess ? t('login.emailConfirmedBodyHasAccess') : t('login.emailConfirmedBodyNoAccess')}</ThemedText>
              {confirmedEmailHasAccess ? (
                <TouchableOpacity onPress={() => { setShowEmailConfirmedModal(false); router.replace('/(tabs)'); }} style={styles.modalBtn}>
                  <LinearGradient colors={['#14b8a6', '#0d9488']} style={styles.modalBtnGradient}><ThemedText style={styles.modalBtnText}>{t('login.goToMySpace')}</ThemedText></LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setShowEmailConfirmedModal(false)} style={styles.modalBtn}>
                  <LinearGradient colors={['#64748b', '#475569']} style={styles.modalBtnGradient}><ThemedText style={styles.modalBtnText}>{t('login.activationOk')}</ThemedText></LinearGradient>
                </TouchableOpacity>
              )}
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {/* Admin Web Only */}
      {showAdminWebModal && (
        <View style={styles.modalOverlay}>
          <Animated.View entering={ZoomIn.duration(400).springify()} key={i18n.language} style={styles.modalContent}>
            <LinearGradient colors={['#ffffff', '#f8fafc']} style={styles.modalInner}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#e2e8f0' }]}>
                <IconSymbol name="lock.fill" size={32} color="#64748b" />
              </View>
              <ThemedText style={styles.modalTitle}>{t('login.adminWebOnlyTitle')}</ThemedText>
              <ThemedText style={styles.modalText}>{t('login.adminWebOnlyBody')}</ThemedText>
              <ThemedText style={[styles.modalText, { fontWeight: '700', color: '#0d9488', marginBottom: 16 }]}>{ADMIN_WEB_APP_URL}</ThemedText>
              <View style={{ width: '100%', gap: 10 }}>
                <TouchableOpacity onPress={async () => { try { await Linking.openURL(ADMIN_WEB_APP_URL); } catch {} }} style={styles.modalBtn}>
                  <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.modalBtnGradient}><ThemedText style={styles.modalBtnText}>{t('login.adminWebOpenSite')}</ThemedText></LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowAdminWebModal(false)} style={styles.modalBtn}>
                  <LinearGradient colors={['#64748b', '#475569']} style={styles.modalBtnGradient}><ThemedText style={styles.modalBtnText}>{t('common.ok')}</ThemedText></LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {/* Subscription Expired */}
      {showExpiredModal && (
        <View style={styles.modalOverlay}>
          <Animated.View entering={ZoomIn.duration(400).springify()} key={i18n.language} style={styles.modalContent}>
            <LinearGradient colors={['#ffffff', '#f8fafc']} style={styles.modalInner}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#fef3c7' }]}>
                <IconSymbol name="exclamationmark.triangle.fill" size={32} color="#f59e0b" />
              </View>
              <ThemedText style={styles.modalTitle}>{t('subscription.expiredTitle')}</ThemedText>
              <ThemedText style={styles.modalText}>{t('subscription.expiredContactBody')}</ThemedText>
              <View style={{ width: '100%', gap: 10 }}>
                <TouchableOpacity onPress={async () => { try { await Linking.openURL(`tel:${SUPPORT_PHONE}`); } catch {} }} style={styles.modalBtn}>
                  <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.modalBtnGradient}><ThemedText style={styles.modalBtnText}>{t('subscription.callSupport')} • {SUPPORT_PHONE}</ThemedText></LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => { try { await logout(); } finally { setShowExpiredModal(false); } }} style={styles.modalBtn}>
                  <LinearGradient colors={['#64748b', '#475569']} style={styles.modalBtnGradient}><ThemedText style={styles.modalBtnText}>{t('common.ok')}</ThemedText></LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: scale(24), paddingTop: scale(20) },

  logoSection: { alignItems: 'center', marginBottom: scale(24) },
  logoOuter: {
    ...Platform.select({
      ios: { shadowColor: '#14b8a6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  logoGradient: { width: scale(80), height: scale(80), borderRadius: scale(24), alignItems: 'center', justifyContent: 'center' },

  title: { fontSize: fontSizes['3xl'], fontWeight: '900', color: '#0f172a', textAlign: 'center', marginBottom: scale(6), letterSpacing: 0.5 },
  subtitle: { fontSize: fontSizes.md, color: '#64748b', textAlign: 'center', marginBottom: scale(28) },

  formCard: {
    borderRadius: scale(24),
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: scale(16),
    ...Platform.select({
      ios: { shadowColor: '#94a3b8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24 },
      android: { elevation: 10 },
    }),
  },
  formCardInner: { padding: scale(24) },

  fieldGroup: { marginBottom: scale(20) },
  label: { fontSize: fontSizes.sm, fontWeight: '700', color: '#374151', marginBottom: scale(8), letterSpacing: 0.3 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 0 },
  },
  inputIconContainer: {
    width: scale(44),
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdfa',
    borderRadius: scale(12),
    marginLeft: scale(4),
  },
  inputIconContainerFocused: { backgroundColor: '#ccfbf1' },
  input: { flex: 1, height: scale(48), fontSize: fontSizes.md, color: '#1e293b', paddingHorizontal: scale(12) },
  eyeButton: { padding: scale(12) },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    padding: scale(12),
    backgroundColor: '#fef2f2',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: scale(12),
  },
  errorText: { flex: 1, fontSize: fontSizes.sm, color: '#dc2626', fontWeight: '500' },

  forgotRow: { alignItems: 'flex-end', marginBottom: scale(24) },
  forgotText: { fontSize: fontSizes.sm, color: '#0d9488', fontWeight: '600' },

  buttonWrap: { marginBottom: scale(20) },
  submitButton: {
    borderRadius: scale(16),
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#14b8a6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  submitGradient: { paddingVertical: scale(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8) },
  submitText: { fontSize: fontSizes.lg, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },

  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  registerText: { fontSize: fontSizes.sm, color: '#6b7280' },
  registerLink: { fontSize: fontSizes.sm, color: '#0d9488', fontWeight: '700' },

  backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), marginTop: scale(16) },
  backText: { fontSize: fontSizes.sm, color: '#94a3b8', fontWeight: '500' },

  // Modals
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', padding: scale(24), zIndex: 9999, elevation: 9999 },
  modalContent: { width: '100%', maxWidth: 400, borderRadius: scale(24), overflow: 'hidden', zIndex: 10000, elevation: 10000 },
  modalInner: { padding: scale(28), alignItems: 'center', borderRadius: scale(24) },
  modalIconCircle: { width: scale(72), height: scale(72), borderRadius: scale(36), alignItems: 'center', justifyContent: 'center', marginBottom: scale(18) },
  modalTitle: { fontSize: fontSizes.xl, fontWeight: '800', color: '#0f172a', marginBottom: scale(10), textAlign: 'center' },
  modalText: { fontSize: fontSizes.base, color: '#64748b', textAlign: 'center', marginBottom: scale(20), lineHeight: scale(22) },
  modalSubtext: { fontSize: fontSizes.sm, color: '#64748b', textAlign: 'center', lineHeight: scale(20), marginBottom: scale(8) },
  modalEmailHighlight: { fontSize: fontSizes.base, fontWeight: '700', color: '#0d9488', textAlign: 'center', marginBottom: scale(16) },
  modalBtn: { borderRadius: scale(14), overflow: 'hidden', width: '100%', marginBottom: scale(8) },
  modalBtnGradient: { paddingVertical: scale(14), alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: fontSizes.md, fontWeight: '700', color: '#ffffff' },
  modalDismiss: { fontSize: fontSizes.md, fontWeight: '600', color: '#94a3b8', textAlign: 'center', paddingVertical: scale(8) },

  // Verify modal
  verifyBanner: { width: '100%', backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: scale(12), padding: scale(12), marginBottom: scale(12) },
  verifyBannerText: { fontSize: fontSizes.sm, color: '#92400e', lineHeight: scale(20) },
  verifyField: { width: '100%', marginBottom: scale(12) },
  verifyLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: '#374151', marginBottom: scale(8) },
  verifyInput: { width: '100%', height: scale(52), fontSize: fontSizes.xl, color: '#1f2937', backgroundColor: '#f1f5f9', borderRadius: scale(14), borderWidth: 2, borderColor: '#e2e8f0', paddingHorizontal: scale(16), textAlign: 'center', letterSpacing: 6, fontWeight: '700' },
  verifyErrorBox: { width: '100%', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: scale(12), padding: scale(12), marginBottom: scale(12) },
  verifyErrorText: { fontSize: fontSizes.sm, color: '#b91c1c', textAlign: 'center' },
  resendBtn: { width: '100%', paddingVertical: scale(14), borderRadius: scale(12), backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: scale(10) },
  resendBtnText: { fontSize: fontSizes.md, fontWeight: '700', color: '#374151' },
});

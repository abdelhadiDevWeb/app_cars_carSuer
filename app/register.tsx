import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
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
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { apiRequest } from '@/utils/backend';
import { SCREEN_WIDTH, SCREEN_HEIGHT, getFontSizes, scale } from '@/utils/responsive';
import { pageTitleBlockStyles } from '@/utils/pageTitleStyles';
import { AppLogo } from '@/components/AppLogo';
import { StarterPlanBlockedModal } from '@/components/StarterPlanModals';
import { useAuth } from '@/contexts/AuthContext';
import { parseStarterPlanFromVerify } from '@/utils/starterPlan';
import { useTranslation } from 'react-i18next';

const fontSizes = getFontSizes();

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

function sanitizeRegisterPhoneInput(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits[0] !== '0') return '';
  return digits.slice(0, 10);
}

const REGISTER_PHONE_PATTERN = /^0\d{7,9}$/;

function AnimatedBlob({ delay, startX, startY, size, colors }: {
  delay: number; startX: number; startY: number; size: number; colors: string[];
}) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scaleVal = useSharedValue(1);

  useEffect(() => {
    translateY.value = withDelay(delay,
      withRepeat(withSequence(
        withTiming(-18, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
        withTiming(18, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      ), -1, true)
    );
    translateX.value = withDelay(delay + 400,
      withRepeat(withSequence(
        withTiming(12, { duration: 3800, easing: Easing.inOut(Easing.ease) }),
        withTiming(-12, { duration: 3800, easing: Easing.inOut(Easing.ease) }),
      ), -1, true)
    );
    scaleVal.value = withDelay(delay + 200,
      withRepeat(withSequence(
        withTiming(1.12, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.92, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
      ), -1, true)
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { translateX: translateX.value }, { scale: scaleVal.value }],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top: startY, left: startX, width: size, height: size, borderRadius: size / 2 }, animatedStyle]}>
      <LinearGradient colors={colors as [string, string, ...string[]]} style={{ width: size, height: size, borderRadius: size / 2 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
    </Animated.View>
  );
}

function FocusableInput({
  icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, maxLength,
  showToggle, onToggle, toggleActive,
}: {
  icon: string; placeholder: string; value: string; onChangeText: (t: string) => void;
  secureTextEntry?: boolean; keyboardType?: any; autoCapitalize?: any; maxLength?: number;
  showToggle?: boolean; onToggle?: () => void; toggleActive?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderProgress = useSharedValue(0);

  useEffect(() => {
    borderProgress.value = withSpring(focused ? 1 : 0, { damping: 15, stiffness: 150 });
  }, [focused]);

  const wrapperAnimStyle = useAnimatedStyle(() => ({
    borderColor: focused ? 'rgba(13,148,136,0.5)' : '#e2e8f0',
    shadowOpacity: interpolate(borderProgress.value, [0, 1], [0, 0.12]),
    shadowRadius: interpolate(borderProgress.value, [0, 1], [0, 12]),
    transform: [{ scale: interpolate(borderProgress.value, [0, 1], [1, 1.01]) }],
  }));

  return (
    <Animated.View style={[styles.inputWrapper, wrapperAnimStyle]}>
      <View style={[styles.inputIconBox, focused && styles.inputIconBoxFocused]}>
        <IconSymbol name={icon as any} size={16} color={focused ? '#0d9488' : '#94a3b8'} />
      </View>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showToggle && (
        <TouchableOpacity onPress={onToggle} style={styles.eyeButton}>
          <IconSymbol name={toggleActive ? 'eye.fill' as any : 'eye.slash.fill' as any} size={18} color={toggleActive ? '#0d9488' : '#94a3b8'} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

type RegisterType = 'client';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();
  const registerAs: RegisterType = 'client';
  const passwordRef = useRef('');
  const [showVerification, setShowVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [codeError, setCodeError] = useState('');
  const [showStarterBlockedModal, setShowStarterBlockedModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [userData, setUserData] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const buttonScale = useSharedValue(1);
  const logoPulse = useSharedValue(1);

  useEffect(() => {
    logoPulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    );
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoPulse.value }] }));
  const buttonAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));
  const onBtnPressIn = useCallback(() => { buttonScale.value = withSpring(0.96, { damping: 15, stiffness: 300 }); }, []);
  const onBtnPressOut = useCallback(() => { buttonScale.value = withSpring(1, { damping: 15, stiffness: 300 }); }, []);

  useEffect(() => {
    if (!showVerification) return;
    const timer = setInterval(() => { setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1)); }, 1000);
    return () => clearInterval(timer);
  }, [showVerification]);

  const handleUserChange = (field: string, value: string) => {
    const nextValue = field === 'phone' ? sanitizeRegisterPhoneInput(value) : value;
    setUserData({ ...userData, [field]: nextValue });
    if (formError) setFormError('');
    if (formErrors.length > 0) setFormErrors([]);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true); setFormError(''); setFormErrors([]);
    if (userData.password !== userData.confirmPassword) { setFormError(t('register.passwordsNoMatch')); setIsSubmitting(false); return; }
    const phoneTrimmed = userData.phone.trim();
    if (!REGISTER_PHONE_PATTERN.test(phoneTrimmed)) { setFormError(t('register.phoneInvalid')); setIsSubmitting(false); return; }
    try {
      const response = await apiRequest('/auth/register/user', {
        method: 'POST',
        body: JSON.stringify({ firstName: userData.firstName, lastName: userData.lastName, email: userData.email.trim(), phone: userData.phone.trim(), password: userData.password }),
      });
      let data;
      try { data = await response.json(); } catch { setFormError(t('login.serverError')); setIsSubmitting(false); return; }
      if (!response.ok) { setFormError(t('register.registerError')); setIsSubmitting(false); return; }
      passwordRef.current = userData.password;
      setVerificationEmail(userData.email);
      setUserData({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
      setTimeLeft(15 * 60); setVerificationCode(''); setCodeError(''); setIsSubmitting(false); setShowVerification(true);
    } catch { setFormError(t('register.cannotConnect')); setIsSubmitting(false); }
  };

  const handleVerifyEmail = async () => {
    const normalizedCode = verificationCode.replace(/\D/g, '');
    if (normalizedCode.length !== 6) { setCodeError(t('register.codeMustBe6')); return; }
    if (timeLeft <= 0) { setCodeError(t('register.codeExpired')); return; }
    setIsVerifying(true); setCodeError('');
    try {
      const response = await apiRequest('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email: verificationEmail.trim(), code: normalizedCode, type: 'user' }),
      });
      let data;
      try { data = await response.json(); } catch { setCodeError(t('login.serverError')); setIsVerifying(false); return; }
      if (!response.ok) { setCodeError(t('register.invalidOrExpired')); setIsVerifying(false); return; }
      if (data.ok !== true) { setCodeError(t('register.verifyError')); setIsVerifying(false); return; }

      const { assigned } = parseStarterPlanFromVerify(data);
      if (!assigned) {
        setVerificationCode('');
        setShowVerification(false);
        setShowStarterBlockedModal(true);
        setIsVerifying(false);
        return;
      }

      const loginRes = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: verificationEmail.trim(),
          password: passwordRef.current,
        }),
      });
      const loginData = await loginRes.json().catch(() => null);
      if (!loginRes.ok || !loginData?.token || !loginData?.user) {
        setVerificationCode('');
        setShowVerification(false);
        setIsVerifying(false);
        router.push('/login');
        return;
      }

      await login(loginData.token as string, {
        _id: loginData.user._id || loginData.user.id,
        email: loginData.user.email,
        firstName: loginData.user.firstName,
        lastName: loginData.user.lastName,
        type: loginData.type as string,
        role: loginData.role as string,
      });

      passwordRef.current = '';
      setVerificationCode('');
      setShowVerification(false);
      setIsVerifying(false);
      router.replace('/(tabs)');
    } catch { setCodeError(t('register.cannotConnect')); setIsVerifying(false); }
  };

  // ──── Verification Screen ────
  if (showVerification) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <LinearGradient colors={['#f8fafc', '#f1f5f9', '#ffffff']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <AnimatedBlob delay={0} startX={-60} startY={-40} size={220} colors={['rgba(16,185,129,0.08)', 'rgba(52,211,153,0.04)']} />
        <AnimatedBlob delay={600} startX={SCREEN_WIDTH - 100} startY={SCREEN_HEIGHT * 0.5} size={260} colors={['rgba(13,148,136,0.07)', 'rgba(20,184,166,0.03)']} />

        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.content}>
                {/* Header */}
                <Animated.View entering={ZoomIn.duration(600).springify()} style={styles.verifyIconWrap}>
                  <Animated.View style={logoAnimStyle}>
                    <AppLogo variant="auth" />
                  </Animated.View>
                </Animated.View>

                <Animated.View
                  entering={FadeInDown.duration(500).delay(100).springify()}
                  style={pageTitleBlockStyles.block}
                >
                  <ThemedText style={pageTitleBlockStyles.title}>{t('register.verifyCheckEmail')}</ThemedText>
                  <ThemedText style={pageTitleBlockStyles.subtitle}>{t('register.verifySentTo')}</ThemedText>
                  <ThemedText style={styles.verifyEmailText}>{verificationEmail}</ThemedText>
                </Animated.View>

                <Animated.View entering={FadeIn.duration(500).delay(150)}>
                  <View style={styles.spamNoteBox}>
                    <View style={styles.spamNoteIconWrap}>
                      <IconSymbol name="exclamationmark.triangle.fill" size={18} color="#d97706" />
                    </View>
                    <ThemedText style={styles.spamNoteText}>{t('register.verifySpamHint')}</ThemedText>
                  </View>
                </Animated.View>

                {/* Timer */}
                <Animated.View entering={FadeIn.duration(500).delay(200)}>
                  <View style={[styles.timerBadge, timeLeft > 0 ? styles.timerActive : styles.timerExpired]}>
                    <IconSymbol name="clock.fill" size={16} color={timeLeft > 0 ? '#38bdf8' : '#f87171'} />
                    <ThemedText style={[styles.timerText, timeLeft <= 0 && { color: '#dc2626' }]}>
                      {timeLeft > 0
                        ? t('register.codeValidFor', { time: `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}` })
                        : t('register.codeExpiredShort')}
                    </ThemedText>
                  </View>
                </Animated.View>

                {/* Code Input Card */}
                <Animated.View entering={FadeInUp.duration(600).delay(300).springify()} style={styles.formCard}>
                  <View style={styles.formCardInner}>
                    <ThemedText style={styles.label}>{t('register.verifyCodeLabel')}</ThemedText>
                    <TextInput
                      style={[styles.codeInput, codeError ? styles.codeInputError : null]}
                      value={verificationCode}
                      onChangeText={(text) => { setVerificationCode(text.replace(/\D/g, '')); setCodeError(''); }}
                      placeholder={t('register.verifyCodePlaceholder')}
                      placeholderTextColor="#475569"
                      maxLength={6}
                      keyboardType="number-pad"
                      editable={timeLeft > 0}
                    />

                    {codeError ? (
                      <Animated.View entering={FadeIn.duration(300)} style={styles.codeErrorBox}>
                        <ThemedText style={styles.codeErrorText}>{codeError}</ThemedText>
                      </Animated.View>
                    ) : null}

                    <AnimatedTouchableOpacity
                      onPress={handleVerifyEmail}
                      onPressIn={onBtnPressIn}
                      onPressOut={onBtnPressOut}
                      disabled={isVerifying || verificationCode.length !== 6 || timeLeft <= 0}
                      activeOpacity={0.9}
                      style={[styles.primaryBtn, buttonAnimStyle, (isVerifying || verificationCode.length !== 6 || timeLeft <= 0) && { opacity: 0.5 }]}
                    >
                      <LinearGradient colors={['#0d9488', '#14b8a6', '#2dd4bf']} style={styles.primaryBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        {isVerifying ? <ActivityIndicator color="#ffffff" /> : (
                          <ThemedText style={styles.primaryBtnText}>{timeLeft <= 0 ? t('register.codeExpiredShort') : t('register.verify')}</ThemedText>
                        )}
                      </LinearGradient>
                    </AnimatedTouchableOpacity>

                    {timeLeft <= 0 && (
                      <TouchableOpacity onPress={() => { setShowVerification(false); setVerificationCode(''); setTimeLeft(15 * 60); setCodeError(''); }} style={styles.expiredBackBtn}>
                        <ThemedText style={styles.expiredBackText}>{t('register.backToRegister')}</ThemedText>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity onPress={() => { setShowVerification(false); setVerificationCode(''); setCodeError(''); }} style={styles.ghostBtn}>
                      <ThemedText style={styles.ghostBtnText}>{t('register.backToForm')}</ThemedText>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
        {showStarterBlockedModal && (
          <StarterPlanBlockedModal
            onClose={() => {
              setShowStarterBlockedModal(false);
              router.push('/login');
            }}
          />
        )}
      </View>
    );
  }

  // ──── Main Registration ────
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#f8fafc', '#f1f5f9', '#ffffff']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <AnimatedBlob delay={0} startX={-70} startY={-50} size={240} colors={['rgba(13,148,136,0.1)', 'rgba(20,184,166,0.05)']} />
      <AnimatedBlob delay={700} startX={SCREEN_WIDTH - 110} startY={SCREEN_HEIGHT * 0.12} size={180} colors={['rgba(56,189,248,0.08)', 'rgba(14,165,233,0.04)']} />
      <AnimatedBlob delay={1300} startX={SCREEN_WIDTH * 0.25} startY={SCREEN_HEIGHT * 0.7} size={300} colors={['rgba(13,148,136,0.06)', 'rgba(45,212,191,0.03)']} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.content}>
              {/* Logo */}
              <Animated.View entering={ZoomIn.duration(700).springify()} style={styles.logoSection}>
                <Animated.View style={logoAnimStyle}>
                  <AppLogo variant="auth" />
                </Animated.View>
              </Animated.View>

              {/* Title */}
              <Animated.View
                entering={FadeInDown.duration(600).delay(150).springify()}
                style={pageTitleBlockStyles.block}
              >
                <ThemedText style={pageTitleBlockStyles.title}>{t('auth.register')}</ThemedText>
                <ThemedText style={pageTitleBlockStyles.subtitle}>{t('register.pageSubtitle')}</ThemedText>
              </Animated.View>

              {/* Form Card */}
              <Animated.View entering={FadeInUp.duration(700).delay(300).springify()} style={styles.formCard}>
                <View style={styles.formCardInner}>
                  {/* Error */}
                  {formError ? (
                    <Animated.View entering={FadeIn.duration(300)} style={styles.errorContainer}>
                      <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#ef4444" />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.errorText}>{formError}</ThemedText>
                        {formErrors.length > 0 && formErrors.map((e, i) => (
                          <ThemedText key={i} style={styles.errorListItem}>• {e}</ThemedText>
                        ))}
                      </View>
                    </Animated.View>
                  ) : null}

                  {/* Name Row */}
                  <Animated.View entering={FadeInDown.duration(500).delay(350)} style={styles.nameRow}>
                    <View style={styles.halfField}>
                      <ThemedText style={styles.label}>{t('register.firstName')}</ThemedText>
                      <FocusableInput icon="person.fill" placeholder={t('register.firstName')} value={userData.firstName} onChangeText={(t) => handleUserChange('firstName', t)} />
                    </View>
                    <View style={styles.halfField}>
                      <ThemedText style={styles.label}>{t('register.lastName')}</ThemedText>
                      <FocusableInput icon="person.fill" placeholder={t('register.lastName')} value={userData.lastName} onChangeText={(t) => handleUserChange('lastName', t)} />
                    </View>
                  </Animated.View>

                  {/* Email */}
                  <Animated.View entering={FadeInDown.duration(500).delay(420)} style={styles.fieldGroup}>
                    <ThemedText style={styles.label}>{t('register.emailRequired')}</ThemedText>
                    <FocusableInput icon="envelope.fill" placeholder={t('register.emailPlaceholder')} value={userData.email} onChangeText={(t) => handleUserChange('email', t)} keyboardType="email-address" autoCapitalize="none" />
                  </Animated.View>

                  {/* Phone */}
                  <Animated.View entering={FadeInDown.duration(500).delay(490)} style={styles.fieldGroup}>
                    <ThemedText style={styles.label}>{t('register.phone')}</ThemedText>
                    <FocusableInput icon="phone.fill" placeholder={t('register.phonePlaceholder')} value={userData.phone} onChangeText={(t) => handleUserChange('phone', sanitizeRegisterPhoneInput(t))} keyboardType="number-pad" maxLength={10} />
                  </Animated.View>

                  {/* Password */}
                  <Animated.View entering={FadeInDown.duration(500).delay(560)} style={styles.fieldGroup}>
                    <ThemedText style={styles.label}>{t('register.passwordLabel')}</ThemedText>
                    <FocusableInput icon="lock.fill" placeholder="••••••••" value={userData.password} onChangeText={(t) => handleUserChange('password', t)} secureTextEntry={!showPassword} autoCapitalize="none" showToggle onToggle={() => setShowPassword(!showPassword)} toggleActive={showPassword} />
                  </Animated.View>

                  {/* Confirm Password */}
                  <Animated.View entering={FadeInDown.duration(500).delay(630)} style={styles.fieldGroup}>
                    <ThemedText style={styles.label}>{t('register.confirmPasswordLabel')}</ThemedText>
                    <FocusableInput icon="lock.fill" placeholder="••••••••" value={userData.confirmPassword} onChangeText={(t) => handleUserChange('confirmPassword', t)} secureTextEntry={!showConfirmPassword} autoCapitalize="none" showToggle onToggle={() => setShowConfirmPassword(!showConfirmPassword)} toggleActive={showConfirmPassword} />
                  </Animated.View>

                  {/* Submit */}
                  <Animated.View entering={FadeInDown.duration(600).delay(700)}>
                    <AnimatedTouchableOpacity
                      onPress={handleSubmit}
                      onPressIn={onBtnPressIn}
                      onPressOut={onBtnPressOut}
                      disabled={isSubmitting}
                      activeOpacity={0.9}
                      style={[styles.primaryBtn, buttonAnimStyle, isSubmitting && { opacity: 0.5 }]}
                    >
                      <LinearGradient colors={['#0d9488', '#14b8a6', '#2dd4bf']} style={styles.primaryBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        {isSubmitting ? <ActivityIndicator color="#ffffff" /> : (
                          <>
                            <ThemedText style={styles.primaryBtnText}>{t('register.createAccount')}</ThemedText>
                            <IconSymbol name="arrow.right" size={18} color="#ffffff" />
                          </>
                        )}
                      </LinearGradient>
                    </AnimatedTouchableOpacity>
                  </Animated.View>

                  {/* Login Link */}
                  <Animated.View entering={FadeIn.duration(500).delay(800)} style={styles.linkRow}>
                    <ThemedText style={styles.linkText}>{t('register.alreadyHaveAccount')} </ThemedText>
                    <TouchableOpacity onPress={() => router.push('/login')}>
                      <ThemedText style={styles.linkHighlight}>{t('register.signIn')}</ThemedText>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </Animated.View>

              {/* Back */}
              <Animated.View entering={FadeIn.duration(500).delay(900)}>
                <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backButton}>
                  <IconSymbol name="chevron.left" size={14} color="#94a3b8" />
                  <ThemedText style={styles.backText}>{t('register.back')}</ThemedText>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {showStarterBlockedModal && (
        <StarterPlanBlockedModal
          onClose={() => {
            setShowStarterBlockedModal(false);
            router.push('/login');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: scale(40) },
  content: { flex: 1, paddingHorizontal: scale(24), paddingTop: scale(16) },

  logoSection: { alignItems: 'center', marginBottom: scale(20) },

  formCard: {
    borderRadius: scale(24), overflow: 'hidden', backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginBottom: scale(14),
    ...Platform.select({
      ios: { shadowColor: '#94a3b8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24 },
      android: { elevation: 10 },
    }),
  },
  formCardInner: { padding: scale(22) },

  nameRow: { flexDirection: 'row', gap: scale(12), marginBottom: scale(4) },
  halfField: { flex: 1 },
  fieldGroup: { marginBottom: scale(16) },
  label: { fontSize: fontSizes.sm, fontWeight: '700', color: '#374151', marginBottom: scale(8), letterSpacing: 0.3 },

  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: scale(14), borderWidth: 1.5, borderColor: '#e2e8f0',
    shadowColor: '#0d9488', shadowOffset: { width: 0, height: 0 },
  },
  inputIconBox: { width: scale(40), height: scale(40), alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdfa', borderRadius: scale(10), marginLeft: scale(4) },
  inputIconBoxFocused: { backgroundColor: '#ccfbf1' },
  input: { flex: 1, height: scale(46), fontSize: fontSizes.base, color: '#1e293b', paddingHorizontal: scale(10) },
  eyeButton: { padding: scale(10) },

  errorContainer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: scale(8), padding: scale(12),
    backgroundColor: '#fef2f2', borderRadius: scale(12), borderWidth: 1, borderColor: '#fecaca', marginBottom: scale(16),
  },
  errorText: { fontSize: fontSizes.sm, color: '#dc2626', fontWeight: '500' },
  errorListItem: { fontSize: fontSizes.xs, color: '#dc2626', marginTop: 2 },

  primaryBtn: {
    borderRadius: scale(16), overflow: 'hidden', marginTop: scale(4),
    ...Platform.select({
      ios: { shadowColor: '#14b8a6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  primaryBtnGradient: { paddingVertical: scale(15), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8) },
  primaryBtnText: { fontSize: fontSizes.md, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },

  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: scale(18) },
  linkText: { fontSize: fontSizes.sm, color: '#6b7280' },
  linkHighlight: { fontSize: fontSizes.sm, color: '#0d9488', fontWeight: '700' },

  backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), marginTop: scale(14) },
  backText: { fontSize: fontSizes.sm, color: '#94a3b8', fontWeight: '500' },

  // Verification
  verifyIconWrap: { alignItems: 'center', marginBottom: scale(20) },
  verifyEmailText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#0d9488',
    textAlign: 'center',
    marginTop: scale(4),
    marginBottom: scale(12),
    lineHeight: Math.round(fontSizes.md * 1.4),
  },
  spamNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(12),
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    borderRadius: scale(14),
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: scale(18),
  },
  spamNoteIconWrap: {
    marginTop: scale(1),
  },
  spamNoteText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: '#92400e',
    lineHeight: Math.round(fontSizes.sm * 1.45),
    fontWeight: '500',
  },

  timerBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), paddingHorizontal: scale(18), paddingVertical: scale(10), borderRadius: scale(20), alignSelf: 'center', marginBottom: scale(24) },
  timerActive: { backgroundColor: '#dbeafe', borderWidth: 1, borderColor: '#bfdbfe' },
  timerExpired: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' },
  timerText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#1e293b' },

  codeInput: {
    height: scale(64), backgroundColor: '#f8fafc', borderRadius: scale(14), borderWidth: 2, borderColor: '#e2e8f0',
    fontSize: scale(28), fontWeight: '800', textAlign: 'center', letterSpacing: 8, color: '#1e293b', marginBottom: scale(14),
  },
  codeInputError: { borderColor: '#ef4444' },
  codeErrorBox: { padding: scale(10), backgroundColor: '#fef2f2', borderRadius: scale(10), marginBottom: scale(12) },
  codeErrorText: { fontSize: fontSizes.sm, color: '#dc2626', textAlign: 'center' },

  expiredBackBtn: { marginTop: scale(8), paddingVertical: scale(12), backgroundColor: '#fef2f2', borderRadius: scale(12), alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  expiredBackText: { fontSize: fontSizes.base, fontWeight: '700', color: '#dc2626' },
  ghostBtn: { marginTop: scale(10), alignItems: 'center', paddingVertical: scale(8) },
  ghostBtnText: { fontSize: fontSizes.base, color: '#94a3b8', fontWeight: '500' },

  // Modal
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', padding: scale(24), zIndex: 9999, elevation: 9999 },
  modalContent: { width: '100%', maxWidth: 400, borderRadius: scale(24), overflow: 'hidden', zIndex: 10000, elevation: 10000 },
  modalInner: { padding: scale(32), alignItems: 'center', borderRadius: scale(24) },
  successIconCircle: { marginBottom: scale(18) },
  successIconGradient: { width: scale(72), height: scale(72), borderRadius: scale(36), alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: fontSizes.xl, fontWeight: '800', color: '#0f172a', marginBottom: scale(10), textAlign: 'center' },
  modalText: { fontSize: fontSizes.base, color: '#64748b', textAlign: 'center', marginBottom: scale(24), lineHeight: scale(22) },
  modalBtn: { borderRadius: scale(14), overflow: 'hidden', width: '100%' },
  modalBtnGradient: { paddingVertical: scale(14), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8) },
  modalBtnText: { fontSize: fontSizes.md, fontWeight: '700', color: '#ffffff' },
});

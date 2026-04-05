import React, { useState } from 'react';
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
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { apiRequest } from '@/utils/backend';
import { useAuth } from '@/contexts/AuthContext';
import { SCREEN_WIDTH, getPadding, getFontSizes, scale } from '@/utils/responsive';
import { useTranslation } from 'react-i18next';

const padding = getPadding();
const fontSizes = getFontSizes();

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

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('auth.requiredFields'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        // If response is not JSON, it's likely a network/server error
        console.error('Failed to parse JSON response:', jsonError);
        setError(t('login.serverError', { status: response.status }));
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        // Check if account needs activation
        if (data.needsActivation && data.status === false) {
          setShowActivationModal(true);
          setIsLoading(false);
          return;
        }
        setError(data?.message || t('login.loginError'));
        setIsLoading(false);
        return;
      }

      // Store token and user data
      if (data.token && data.user) {
        await login(data.token, {
          _id: data.user._id || data.user.id,
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          type: data.type,
          role: data.role,
        });

        // After login, verify subscription before navigating
        try {
          const res = await apiRequest('/abonnement/my-subscription');
          const subData = await res.json().catch(() => null);
          const now = Date.now();
          const isExpired =
            !res.ok ||
            !subData?.ok ||
            !subData?.hasSubscription ||
            !subData?.subscription?.date_end ||
            new Date(subData.subscription.date_end).getTime() < now;

          if (isExpired) {
            setShowExpiredModal(true);
            // Best-effort server-side deactivation (ignore failures)
            try {
              await apiRequest('/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({ status: false }),
              });
            } catch {}
            try {
              await apiRequest('/abonnement/deactivate', { method: 'POST' });
            } catch {}
            // Do NOT change page or logout until user clicks OK in the modal
            setIsLoading(false);
            return;
          }
        } catch {
          // If subscription check fails, allow navigation but you may choose to block instead
        }

        // Navigate to app tabs if subscription is valid
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      console.error('Login Error:', error);
      const errorMessage = error?.message || t('login.connectionError');
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to connect') || errorMessage.includes('Impossible de se connecter')) {
        setError(
          t('login.cannotConnect', {
            url: process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001',
          })
        );
      } else {
        setError(errorMessage);
      }
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Background decoration */}
          <View style={styles.backgroundDecoration}>
            <View style={styles.gradientCircle1} />
            <View style={styles.gradientCircle2} />
          </View>

          <View style={styles.content}>
            {/* Login Icon */}
            <Animated.View
              entering={FadeInDown.duration(600).springify()}
              style={styles.loginIconContainer}
            >
              <LinearGradient
                colors={['#0d9488', '#14b8a6', '#2dd4bf']}
                style={styles.loginIconGradient}
              >
                <IconSymbol name="person.fill" size={scale(32)} color="#ffffff" />
              </LinearGradient>
            </Animated.View>

            {/* Login Form */}
            <Animated.View
              entering={FadeIn.duration(800).delay(200).springify()}
              style={styles.formContainer}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                style={styles.formBlur}
              >
                <View style={styles.form}>
                  {/* Email Input */}
                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.label}>{t('auth.email')}</ThemedText>
                    <View style={styles.inputWrapper}>
                      <View style={styles.inputIconContainer}>
                        <IconSymbol name="message.fill" size={18} color="#0d9488" />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="email@example.com"
                        placeholderTextColor="#9ca3af"
                        value={email}
                        onChangeText={(text) => {
                          setEmail(text);
                          setError('');
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                      />
                    </View>
                  </View>

                  {/* Password Input */}
                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.label}>{t('auth.password')}</ThemedText>
                    <View style={styles.inputWrapper}>
                      <View style={styles.inputIconContainer}>
                        <IconSymbol name="shield.fill" size={18} color="#0d9488" />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor="#9ca3af"
                        value={password}
                        onChangeText={(text) => {
                          setPassword(text);
                          setError('');
                        }}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoComplete="password"
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeButton}
                      >
                        <IconSymbol
                          name={showPassword ? 'checkmark.circle.fill' : 'shield.fill'}
                          size={20}
                          color="#6b7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Error Message */}
                  {error ? (
                    <View style={styles.errorContainer}>
                      <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#ef4444" />
                      <ThemedText style={styles.errorText}>{error}</ThemedText>
                    </View>
                  ) : null}

                  {/* Remember Me */}
                  <View style={styles.optionsRow}>
                    <TouchableOpacity style={styles.rememberMe}>
                      <View style={styles.checkbox} />
                      <ThemedText style={styles.rememberMeText}>
                        {t('login.rememberMe')}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>

                  {/* Forgot Password */}
                  <View style={styles.forgotPasswordContainer}>
                    <TouchableOpacity>
                      <ThemedText style={styles.forgotPasswordText}>
                        {t('login.forgotPassword')}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={isLoading}
                    style={styles.submitButton}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.submitButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <ThemedText style={styles.submitButtonText}>
                          {t('auth.login')}
                        </ThemedText>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Register Link */}
                  <View style={styles.registerLink}>
                    <ThemedText style={styles.registerText}>
                      {t('login.noAccount')}{' '}
                    </ThemedText>
                    <TouchableOpacity onPress={() => router.push('/register')}>
                      <ThemedText style={styles.registerLinkText}>
                        {t('auth.register')}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* Back to Home */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <IconSymbol name="chevron.left" size={16} color="#6b7280" />
              <ThemedText style={styles.backButtonText}>{t('login.back')}</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Activation Required Modal */}
      {showActivationModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.modalBlur}
            >
              <View style={styles.modalIconContainer}>
                <IconSymbol name="checkmark.circle.fill" size={48} color="#f59e0b" />
              </View>
              <ThemedText style={styles.modalTitle}>
                {t('login.activationTitle')}
              </ThemedText>
              <ThemedText style={styles.modalText}>
                {t('login.activationBody')}
              </ThemedText>
              <TouchableOpacity
                onPress={() => setShowActivationModal(false)}
                style={styles.modalButton}
              >
                <LinearGradient
                  colors={['#0d9488', '#14b8a6']}
                  style={styles.modalButtonGradient}
                >
                  <ThemedText style={styles.modalButtonText}>{t('login.activationOk')}</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      )}

      {/* Subscription Expired Modal */}
      {showExpiredModal && (
        <View style={styles.modalOverlay}>
          <View key={i18n.language} style={styles.modalContent}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.modalBlur}
            >
              <View style={styles.modalIconContainer}>
                <IconSymbol name="exclamationmark.triangle.fill" size={48} color="#f59e0b" />
              </View>
              <ThemedText style={styles.modalTitle}>
                {t('subscription.expiredTitle')}
              </ThemedText>
              <ThemedText style={styles.modalText}>
                {t('subscription.expiredContactBody')}
              </ThemedText>
              <View style={{ width: '100%', gap: 10 }}>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await Linking.openURL(`tel:${SUPPORT_PHONE}`);
                    } catch {}
                  }}
                  style={styles.modalButton}
                >
                  <LinearGradient
                    colors={['#0d9488', '#14b8a6']}
                    style={styles.modalButtonGradient}
                  >
                    <ThemedText style={styles.modalButtonText}>
                      {t('subscription.callSupport')} • {SUPPORT_PHONE}
                    </ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await logout();
                  } finally {
                    setShowExpiredModal(false);
                    // Stay on login screen (no navigation) until user proceeds manually.
                  }
                }}
                style={styles.modalButton}
              >
                <LinearGradient
                  colors={['#64748b', '#475569']}
                  style={styles.modalButtonGradient}
                >
                  <ThemedText style={styles.modalButtonText}>{t('common.ok')}</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  backgroundDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradientCircle1: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -100,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(20, 184, 166, 0.1)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: padding.large,
    paddingTop: padding.large * 2,
  },
  header: {
    alignItems: 'center',
    marginBottom: padding.large * 2,
  },
  logoContainer: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: padding.small,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: '#6b7280',
    textAlign: 'center',
  },
  formContainer: {
    borderRadius: scale(24),
    overflow: 'hidden',
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  formBlur: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  form: {
    padding: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  inputIconContainer: {
    width: scale(44),
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdfa',
    borderRadius: scale(12),
    marginRight: padding.small,
  },
  input: {
    flex: 1,
    height: scale(44),
    fontSize: fontSizes.md,
    color: '#1f2937',
    paddingRight: 12,
  },
  eyeButton: {
    padding: 12,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
  },
  loginIconContainer: {
    alignItems: 'center',
    marginBottom: padding.large,
  },
  loginIconGradient: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(20),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: padding.medium,
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: padding.small,
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#0d9488',
  },
  rememberMeText: {
    fontSize: 14,
    color: '#6b7280',
  },
  forgotPasswordContainer: {
    alignItems: 'center',
    marginBottom: padding.medium,
  },
  forgotPasswordText: {
    fontSize: fontSizes.sm,
    color: '#0d9488',
    fontWeight: '600',
  },
  submitButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  submitButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  registerLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  registerText: {
    fontSize: 14,
    color: '#6b7280',
  },
  registerLinkText: {
    fontSize: 14,
    color: '#0d9488',
    fontWeight: '600',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  backButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
    elevation: 9999,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 10000,
    elevation: 10000,
  },
  modalBlur: {
    padding: 32,
    alignItems: 'center',
  },
  modalIconContainer: {
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  modalButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});

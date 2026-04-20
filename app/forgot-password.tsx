import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { apiRequest, readResponseJson } from '@/utils/backend';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';

const padding = getPadding();
const fontSizes = getFontSizes();

type Step = 'email' | 'code' | 'password' | 'done';

function messageFromApiError(
  response: Response,
  data: Record<string, unknown>,
  rawText: string,
  fallback: string,
  routeMissingHint: string,
): string {
  const msg = typeof data.message === 'string' ? data.message.trim() : '';
  const errors = data.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const parts = errors.filter((e) => typeof e === 'string') as string[];
    if (parts.length) {
      if (!msg || msg === 'Erreur de validation') {
        return parts[0];
      }
    }
  }
  if (msg) return msg;
  if (Array.isArray(errors) && errors.length > 0) {
    const parts = errors.filter((e) => typeof e === 'string') as string[];
    if (parts.length) return parts.join('\n');
  }
  const lower = rawText.toLowerCase();
  if (
    response.status === 404 &&
    (lower.includes('cannot post') ||
      lower.includes('cannot get') ||
      lower.includes('not found'))
  ) {
    return routeMissingHint;
  }
  if (response.status >= 500) {
    return fallback;
  }
  return fallback;
}

/** Map exact server / Joi French messages to i18n keys (same idea as web `t(errorKey)`). */
function localizeApiMessage(t: (k: string) => string, raw: string): string {
  const m = raw.trim();
  const keyMap: Record<string, string> = {
    "Aucun compte trouvé avec cet email.": 'forgotPasswordFlow.errAccountNotFound',
    "Impossible d'envoyer le code de réinitialisation.": 'forgotPasswordFlow.errSendFailed',
    'Code invalide.': 'forgotPasswordFlow.errInvalidCode',
    'Code expiré.': 'forgotPasswordFlow.errCodeExpired',
    'Token de réinitialisation invalide.': 'forgotPasswordFlow.errBadToken',
    'Compte introuvable.': 'forgotPasswordFlow.errAccountMissing',
    'Session expirée. Recommencez la réinitialisation.': 'forgotPasswordFlow.errSessionExpired',
    "Format d'email invalide": 'forgotPasswordFlow.errInvalidEmail',
    "L'email est requis": 'forgotPasswordFlow.errEmailRequired',
    'Le code doit contenir exactement 6 chiffres': 'forgotPasswordFlow.errCodeFormat',
    'Le code est requis': 'forgotPasswordFlow.errCodeRequired',
    "Le type doit être 'user' ou 'workshop'": 'forgotPasswordFlow.errTypeInvalid',
    'Le type est requis': 'forgotPasswordFlow.errTypeRequired',
    'Le token de réinitialisation est requis': 'forgotPasswordFlow.errTokenRequired',
    'Le nouveau mot de passe doit contenir au moins 8 caractères': 'forgotPasswordFlow.errPwdMin',
    'Le nouveau mot de passe ne peut pas dépasser 128 caractères': 'forgotPasswordFlow.errPwdMax',
    'Le nouveau mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial':
      'forgotPasswordFlow.errPwdPattern',
    'Le nouveau mot de passe est requis': 'forgotPasswordFlow.errPwdRequired',
    'Server error': 'forgotPasswordFlow.genericError',
  };
  const key = keyMap[m];
  if (key) return t(key);
  return m;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState<'user' | 'workshop'>('user');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const errorDisplay = useMemo(() => {
    if (!errorKey) return null;
    return localizeApiMessage(t, errorKey);
  }, [errorKey, t]);

  const setTranslatedError = (raw: string) => {
    setErrorKey(raw.trim() || t('forgotPasswordFlow.genericError'));
  };

  const handleRequestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setTranslatedError(t('forgotPasswordFlow.errEmailRequired'));
      return;
    }

    setErrorKey(null);
    setLoading(true);
    try {
      const response = await apiRequest('/auth/forgot-password/request', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const { data, rawText } = await readResponseJson(response);

      if (!response.ok) {
        const errRaw = messageFromApiError(
          response,
          data,
          rawText,
          t('forgotPasswordFlow.requestFailed'),
          t('forgotPasswordFlow.backendRouteMissing'),
        );
        setTranslatedError(errRaw);
        return;
      }

      if (data.accountType === 'workshop' || data.accountType === 'user') {
        setAccountType(data.accountType);
      }
      setCode('');
      setStep('code');
    } catch {
      setTranslatedError(t('forgotPasswordFlow.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const normalized = code.replace(/\D/g, '');
    if (normalized.length !== 6) {
      setTranslatedError(t('forgotPasswordFlow.codeMustBe6'));
      return;
    }

    setErrorKey(null);
    setLoading(true);
    try {
      const response = await apiRequest('/auth/forgot-password/verify-code', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: normalized,
          type: accountType,
        }),
      });
      const { data, rawText } = await readResponseJson(response);

      if (!response.ok || !data.resetToken) {
        const errRaw = messageFromApiError(
          response,
          data,
          rawText,
          t('forgotPasswordFlow.verifyFailed'),
          t('forgotPasswordFlow.backendRouteMissing'),
        );
        setTranslatedError(errRaw);
        return;
      }

      setResetToken(typeof data.resetToken === 'string' ? data.resetToken : null);
      setNewPassword('');
      setConfirmPassword('');
      setStep('password');
    } catch {
      setTranslatedError(t('forgotPasswordFlow.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) {
      setTranslatedError(t('forgotPasswordFlow.passwordMismatch'));
      return;
    }
    if (!resetToken) {
      setTranslatedError(t('forgotPasswordFlow.sessionExpiredShort'));
      return;
    }

    setErrorKey(null);
    setLoading(true);
    try {
      const response = await apiRequest('/auth/forgot-password/reset', {
        method: 'POST',
        body: JSON.stringify({ resetToken, newPassword }),
      });
      const { data, rawText } = await readResponseJson(response);

      if (!response.ok) {
        const errRaw = messageFromApiError(
          response,
          data,
          rawText,
          t('forgotPasswordFlow.resetFailed'),
          t('forgotPasswordFlow.backendRouteMissing'),
        );
        setTranslatedError(errRaw);
        return;
      }

      setStep('done');
    } catch {
      setTranslatedError(t('forgotPasswordFlow.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <LinearGradient
          colors={['#eff6ff', '#ecfeff']}
          style={styles.bgGradient}
        >
          <View style={styles.doneOuter}>
            <View style={styles.doneCard}>
              <View style={styles.doneIconWrap}>
                <IconSymbol name="checkmark.circle.fill" size={scale(40)} color="#22c55e" />
              </View>
              <ThemedText style={styles.doneTitle}>{t('forgotPasswordFlow.doneTitle')}</ThemedText>
              <ThemedText style={styles.doneBody}>{t('forgotPasswordFlow.doneBody')}</ThemedText>
              <TouchableOpacity
                onPress={() => router.replace('/login')}
                activeOpacity={0.9}
                style={styles.donePrimaryBtn}
              >
                <LinearGradient
                  colors={['#14b8a6', '#0d9488']}
                  style={styles.donePrimaryGradient}
                >
                  <ThemedText style={styles.donePrimaryText}>
                    {t('forgotPasswordFlow.backToLogin')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)')}
              style={styles.doneSecondaryLink}
            >
              <ThemedText style={styles.doneSecondaryText}>
                ← {t('forgotPasswordFlow.backToHome')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  const subtitle =
    step === 'email'
      ? t('forgotPasswordFlow.subtitleEmailLong')
      : step === 'code'
        ? t('forgotPasswordFlow.subtitleCode')
        : t('forgotPasswordFlow.subtitlePassword');

  const codeDigits = code.replace(/\D/g, '');
  const continueDisabled = loading || codeDigits.length !== 6;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#eff6ff', '#ecfeff']} style={styles.bgGradient}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.topBlock}>
              <ThemedText style={styles.pageTitle}>{t('forgotPasswordFlow.title')}</ThemedText>
              <ThemedText style={styles.pageSubtitle}>{subtitle}</ThemedText>
            </View>

            <View style={styles.card}>
              {errorDisplay ? (
                <View style={styles.messageError}>
                  <ThemedText style={styles.messageErrorText}>{errorDisplay}</ThemedText>
                </View>
              ) : null}

              {step === 'email' ? (
                <View style={styles.fieldGroup}>
                  <ThemedText style={styles.label}>{t('forgotPasswordFlow.emailAddressLabel')}</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      setErrorKey(null);
                    }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    placeholder={t('register.emailPlaceholder')}
                    placeholderTextColor="#9ca3af"
                  />
                  <TouchableOpacity
                    disabled={loading}
                    onPress={handleRequestCode}
                    activeOpacity={0.9}
                    style={styles.submitButton}
                  >
                    <LinearGradient colors={['#14b8a6', '#0d9488']} style={styles.submitButtonGradient}>
                      <ThemedText style={styles.submitButtonText}>
                        {loading ? t('forgotPasswordFlow.sending') : t('forgotPasswordFlow.sendCode')}
                      </ThemedText>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : null}

              {step === 'code' ? (
                <View style={styles.fieldGroup}>
                  <ThemedText style={styles.emailHint}>
                    {t('auth.email')}:{' '}
                    <ThemedText style={styles.emailHintBold}>{email}</ThemedText>
                  </ThemedText>
                  <ThemedText style={styles.label}>{t('forgotPasswordFlow.codeSixLabel')}</ThemedText>
                  <TextInput
                    style={styles.codeInput}
                    value={code}
                    onChangeText={(v) => {
                      setCode(v.replace(/\D/g, '').slice(0, 6));
                      setErrorKey(null);
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder={t('forgotPasswordFlow.codePlaceholder')}
                    placeholderTextColor="#9ca3af"
                  />
                  <TouchableOpacity
                    disabled={continueDisabled}
                    onPress={handleVerifyCode}
                    activeOpacity={0.9}
                    style={[styles.submitButton, continueDisabled && styles.submitButtonDisabled]}
                  >
                    <LinearGradient colors={['#14b8a6', '#0d9488']} style={styles.submitButtonGradient}>
                      <ThemedText style={styles.submitButtonText}>
                        {loading ? t('forgotPasswordFlow.verifying') : t('forgotPasswordFlow.continue')}
                      </ThemedText>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setStep('email');
                      setErrorKey(null);
                    }}
                    style={styles.textLinkBtn}
                  >
                    <ThemedText style={styles.textLink}>← {t('forgotPasswordFlow.changeEmail')}</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : null}

              {step === 'password' ? (
                <View style={styles.fieldGroup}>
                  <ThemedText style={styles.hintSmall}>{t('forgotPasswordFlow.passwordHint')}</ThemedText>

                  <ThemedText style={styles.label}>{t('forgotPasswordFlow.newPasswordLabel')}</ThemedText>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={styles.passwordInput}
                      value={newPassword}
                      onChangeText={(v) => {
                        setNewPassword(v);
                        setErrorKey(null);
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      placeholderTextColor="#9ca3af"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.togglePwd}
                    >
                      <ThemedText style={styles.togglePwdText}>
                        {showPassword ? t('forgotPasswordFlow.hidePassword') : t('forgotPasswordFlow.showPassword')}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>

                  <ThemedText style={styles.label}>{t('forgotPasswordFlow.confirmPasswordLabel')}</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={(v) => {
                      setConfirmPassword(v);
                      setErrorKey(null);
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    placeholderTextColor="#9ca3af"
                  />

                  <TouchableOpacity
                    disabled={loading}
                    onPress={handleResetPassword}
                    activeOpacity={0.9}
                    style={styles.submitButton}
                  >
                    <LinearGradient colors={['#14b8a6', '#0d9488']} style={styles.submitButtonGradient}>
                      <ThemedText style={styles.submitButtonText}>
                        {loading
                          ? t('forgotPasswordFlow.savingPassword')
                          : t('forgotPasswordFlow.resetPasswordBtn')}
                      </ThemedText>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <TouchableOpacity onPress={() => router.replace('/login')} style={styles.footerLink}>
              <ThemedText style={styles.footerLinkText}>← {t('forgotPasswordFlow.backToLogin')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.footerLink}>
              <ThemedText style={styles.footerLinkMuted}>← {t('forgotPasswordFlow.backToHome')}</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ecfeff',
  },
  bgGradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: padding.large,
    paddingTop: padding.large * 1.5,
    paddingBottom: scale(40),
    alignItems: 'center',
  },
  topBlock: {
    marginBottom: padding.large,
    width: '100%',
    maxWidth: scale(420),
  },
  pageTitle: {
    fontSize: fontSizes['2xl'],
    fontWeight: '900',
    color: '#1e3a5f',
    textAlign: 'center',
    marginBottom: scale(8),
  },
  pageSubtitle: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: scale(20),
  },
  card: {
    width: '100%',
    maxWidth: scale(420),
    backgroundColor: '#ffffff',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: padding.large,
    marginBottom: padding.large,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  fieldGroup: {
    gap: scale(4),
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: '#374151',
    marginBottom: scale(6),
    marginTop: scale(8),
  },
  hintSmall: {
    fontSize: fontSizes.xs,
    color: '#64748b',
    marginBottom: scale(8),
    lineHeight: scale(18),
  },
  emailHint: {
    fontSize: fontSizes.xs,
    color: '#64748b',
    marginBottom: scale(8),
  },
  emailHintBold: {
    fontWeight: '700',
    color: '#334155',
  },
  input: {
    height: scale(48),
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingHorizontal: scale(16),
    fontSize: fontSizes.md,
    color: '#1f2937',
  },
  codeInput: {
    height: scale(52),
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingHorizontal: scale(16),
    fontSize: scale(22),
    fontWeight: '800',
    color: '#1f2937',
    textAlign: 'center',
    letterSpacing: scale(4),
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    height: scale(48),
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingHorizontal: scale(16),
    paddingRight: scale(88),
    fontSize: fontSizes.md,
    color: '#1f2937',
  },
  togglePwd: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: scale(12),
  },
  togglePwdText: {
    fontSize: fontSizes.sm,
    color: '#0d9488',
    fontWeight: '700',
  },
  messageError: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: scale(10),
    padding: scale(12),
    marginBottom: scale(12),
  },
  messageErrorText: {
    color: '#b91c1c',
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  submitButton: {
    borderRadius: scale(12),
    overflow: 'hidden',
    marginTop: scale(16),
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonGradient: {
    paddingVertical: scale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.md,
  },
  textLinkBtn: {
    marginTop: scale(12),
    alignItems: 'center',
    paddingVertical: scale(8),
  },
  textLink: {
    fontSize: fontSizes.sm,
    color: '#0d9488',
    fontWeight: '700',
  },
  footerLink: {
    alignItems: 'center',
    marginBottom: scale(8),
  },
  footerLinkText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#0d9488',
  },
  footerLinkMuted: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    textAlign: 'center',
  },
  doneOuter: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: scale(32),
  },
  doneCard: {
    width: '100%',
    maxWidth: scale(420),
    backgroundColor: '#ffffff',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: scale(28),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  doneIconWrap: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(16),
  },
  doneTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '900',
    color: '#1e3a5f',
    textAlign: 'center',
    marginBottom: scale(8),
  },
  doneBody: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: scale(24),
    lineHeight: scale(20),
  },
  donePrimaryBtn: {
    alignSelf: 'stretch',
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  donePrimaryGradient: {
    paddingVertical: scale(14),
    alignItems: 'center',
  },
  donePrimaryText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.md,
  },
  doneSecondaryLink: {
    marginTop: scale(24),
    alignItems: 'center',
  },
  doneSecondaryText: {
    fontSize: fontSizes.sm,
    color: '#64748b',
  },
});

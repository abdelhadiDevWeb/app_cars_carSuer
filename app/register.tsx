import React, { useState, useEffect, useRef } from 'react';
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
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { apiRequest } from '@/utils/backend';
import { SCREEN_WIDTH, getPadding, getFontSizes, scale } from '@/utils/responsive';
import { useTranslation } from 'react-i18next';

const padding = getPadding();
const fontSizes = getFontSizes();

type RegisterType = 'client' | 'workshop' | null;

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [registerAs, setRegisterAs] = useState<RegisterType>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 minutes
  const [codeError, setCodeError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const [userData, setUserData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const [workshopData, setWorkshopData] = useState({
    name: '',
    email: '',
    adr: '',
    phone: '',
    type: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Use refs to prevent animation re-triggering on re-renders
  const hasAnimatedTypeSelector = useRef(false);
  const hasAnimatedForm = useRef(false);
  const hasAnimatedVerification = useRef(false);

  // Reset animation flags when registerAs changes
  useEffect(() => {
    if (registerAs) {
      hasAnimatedForm.current = false;
    } else {
      hasAnimatedTypeSelector.current = false;
      hasAnimatedForm.current = false;
    }
  }, [registerAs]);

  // Reset verification animation flag when showVerification changes
  useEffect(() => {
    if (showVerification) {
      hasAnimatedVerification.current = false;
    }
  }, [showVerification]);

  // Timer countdown effect - Fixed: removed timeLeft from dependencies to prevent infinite loop
  useEffect(() => {
    if (!showVerification) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showVerification]); // Only depend on showVerification, not timeLeft

  const handleUserChange = (field: string, value: string) => {
    setUserData({ ...userData, [field]: value });
    if (formError) setFormError('');
    if (formErrors.length > 0) setFormErrors([]);
  };

  const handleWorkshopChange = (field: string, value: string) => {
    setWorkshopData({ ...workshopData, [field]: value });
    if (formError) setFormError('');
    if (formErrors.length > 0) setFormErrors([]);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setFormError('');
    setFormErrors([]);

    if (registerAs === 'client') {
      if (userData.password !== userData.confirmPassword) {
        setFormError(t('register.passwordsNoMatch'));
        setIsSubmitting(false);
        return;
      }
      try {
        const response = await apiRequest('/auth/register/user', {
          method: 'POST',
          body: JSON.stringify({
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email.trim(),
            phone: userData.phone.trim(),
            password: userData.password,
          }),
        });

        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          // If response is not JSON, it's likely a network/server error
          console.error('Failed to parse JSON response:', jsonError);
          setFormError(t('login.serverError', { status: response.status }));
          setIsSubmitting(false);
          return;
        }

        if (!response.ok) {
          if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            setFormErrors(data.errors);
            setFormError(data?.message || t('register.validationError'));
          } else {
            setFormError(data?.message || t('register.registerError'));
            setFormErrors([]);
          }
          setIsSubmitting(false);
          return;
        }

        setVerificationEmail(userData.email);
        setUserData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          password: '',
          confirmPassword: '',
        });
        setTimeLeft(15 * 60);
        setVerificationCode('');
        setCodeError('');
        setShowVerification(true);
      } catch (error: any) {
        console.error('Register User Error:', error);
        const errorMessage = error?.message || t('login.connectionError');
        if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to connect') || errorMessage.includes('Impossible de se connecter')) {
          setFormError(
            t('register.cannotConnect', {
              url: process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001',
            })
          );
        } else {
          setFormError(errorMessage);
        }
        setIsSubmitting(false);
      }
    }

    if (registerAs === 'workshop') {
      if (workshopData.password !== workshopData.confirmPassword) {
        setFormError(t('register.passwordsNoMatch'));
        setIsSubmitting(false);
        return;
      }
      try {
        const response = await apiRequest('/auth/register/workshop', {
          method: 'POST',
          body: JSON.stringify({
            name: workshopData.name,
            email: workshopData.email.trim(),
            adr: workshopData.adr,
            phone: workshopData.phone.trim(),
            type: workshopData.type,
            password: workshopData.password,
          }),
        });

        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          // If response is not JSON, it's likely a network/server error
          console.error('Failed to parse JSON response:', jsonError);
          setFormError(t('login.serverError', { status: response.status }));
          setIsSubmitting(false);
          return;
        }

        if (!response.ok) {
          if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            setFormErrors(data.errors);
            setFormError(data?.message || t('register.validationError'));
          } else {
            setFormError(data?.message || t('register.registerError'));
            setFormErrors([]);
          }
          setIsSubmitting(false);
          return;
        }

        setVerificationEmail(workshopData.email);
        setWorkshopData({
          name: '',
          email: '',
          adr: '',
          phone: '',
          type: '',
          password: '',
          confirmPassword: '',
        });
        setTimeLeft(15 * 60);
        setVerificationCode('');
        setCodeError('');
        setShowVerification(true);
      } catch (error: any) {
        console.error('Register Workshop Error:', error);
        const errorMessage = error?.message || t('login.connectionError');
        if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to connect') || errorMessage.includes('Impossible de se connecter')) {
          setFormError(
            t('register.cannotConnect', {
              url: process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001',
            })
          );
        } else {
          setFormError(errorMessage);
        }
        setIsSubmitting(false);
      }
    }
  };

  const handleVerifyEmail = async () => {
    const normalizedCode = verificationCode.replace(/\D/g, '');

    if (normalizedCode.length !== 6) {
      setCodeError(t('register.codeMustBe6'));
      return;
    }

    if (timeLeft <= 0) {
      setCodeError(t('register.codeExpired'));
      return;
    }

    setIsVerifying(true);
    setCodeError('');

    try {
      const backendType = registerAs === 'client' ? 'user' : registerAs;
      const response = await apiRequest('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({
          email: verificationEmail.trim(),
          code: normalizedCode,
          type: backendType,
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError);
        setCodeError(t('login.serverError', { status: response.status }));
        setIsVerifying(false);
        return;
      }

      if (!response.ok) {
        setCodeError(data?.message || t('register.invalidOrExpired'));
        setIsVerifying(false);
        return;
      }

      if (data.ok === true) {
        setVerificationCode('');
        setShowVerification(false);
        setShowSuccessModal(true);
        setIsVerifying(false);
      } else {
        setCodeError(data?.message || t('register.verifyError'));
        setIsVerifying(false);
      }
    } catch (error: any) {
      console.error('Verify Email Error:', error);
      const errorMessage = error?.message || t('login.connectionError');
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to connect') || errorMessage.includes('Impossible de se connecter')) {
        setCodeError(
          t('register.cannotConnect', {
            url: process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001',
          })
        );
      } else {
        setCodeError(errorMessage);
      }
      setIsVerifying(false);
    }
  };

  // Verification Screen
  if (showVerification) {
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
          >
            <View style={styles.verificationContent}>
              <Animated.View
                key="verification-header"
                entering={!hasAnimatedVerification.current ? FadeInDown.duration(600).springify() : undefined}
                style={styles.verificationHeader}
                onLayout={() => {
                  hasAnimatedVerification.current = true;
                }}
              >
                <View style={styles.verificationIconContainer}>
                  <IconSymbol name="message.fill" size={32} color="#10b981" />
                </View>
                <ThemedText style={styles.verificationTitle}>
                  {t('register.verifyCheckEmail')}
                </ThemedText>
                <ThemedText style={styles.verificationSubtitle}>
                  {t('register.verifySentTo')}
                </ThemedText>
                <ThemedText style={styles.verificationEmail}>
                  {verificationEmail}
                </ThemedText>
                <View
                  style={[
                    styles.timerBadge,
                    timeLeft > 0 ? styles.timerBadgeActive : styles.timerBadgeExpired,
                  ]}
                >
                  <IconSymbol name="checkmark.circle.fill" size={16} color={timeLeft > 0 ? '#3b82f6' : '#ef4444'} />
                  <ThemedText style={styles.timerText}>
                    {timeLeft > 0
                      ? t('register.codeValidFor', {
                          time: `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`,
                        })
                      : t('register.codeExpiredShort')}
                  </ThemedText>
                </View>
              </Animated.View>

              <Animated.View
                key="verification-form"
                entering={!hasAnimatedVerification.current ? FadeIn.duration(800).delay(200).springify() : undefined}
                style={styles.verificationForm}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                  style={styles.formBlur}
                >
                  <View style={styles.codeInputContainer}>
                    <ThemedText style={styles.codeLabel}>
                      {t('register.verifyCodeLabel')}
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.codeInput,
                        codeError ? styles.codeInputError : null,
                      ]}
                      value={verificationCode}
                      onChangeText={(text) => {
                        const value = text.replace(/\D/g, '');
                        setVerificationCode(value);
                        setCodeError('');
                      }}
                      placeholder={t('register.verifyCodePlaceholder')}
                      placeholderTextColor="#9ca3af"
                      maxLength={6}
                      keyboardType="number-pad"
                      editable={timeLeft > 0}
                    />
                    {codeError ? (
                      <View style={styles.codeErrorContainer}>
                        <ThemedText style={styles.codeErrorText}>
                          {codeError}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    onPress={handleVerifyEmail}
                    disabled={isVerifying || verificationCode.length !== 6 || timeLeft <= 0}
                    style={styles.verifyButton}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.verifyButtonGradient}
                    >
                      {isVerifying ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <ThemedText style={styles.verifyButtonText}>
                          {timeLeft <= 0 ? t('register.codeExpiredShort') : t('register.verify')}
                        </ThemedText>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {timeLeft <= 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setShowVerification(false);
                        setVerificationCode('');
                        setTimeLeft(15 * 60);
                        setCodeError('');
                        setRegisterAs(null);
                      }}
                      style={styles.backToRegisterButton}
                    >
                      <ThemedText style={styles.backToRegisterText}>
                        {t('register.backToRegister')}
                      </ThemedText>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      setShowVerification(false);
                      setVerificationCode('');
                      setCodeError('');
                    }}
                    style={styles.backButton}
                  >
                    <ThemedText style={styles.backButtonText}>
                      {t('register.backToForm')}
                    </ThemedText>
                  </TouchableOpacity>
                </LinearGradient>
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Main Registration Screen
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
            {/* Choose type */}
            <Animated.View
              key="type-selector"
              entering={!hasAnimatedTypeSelector.current ? FadeIn.duration(800).delay(200).springify() : undefined}
              style={styles.typeSelector}
              onLayout={() => {
                hasAnimatedTypeSelector.current = true;
              }}
            >
              <TouchableOpacity
                onPress={() => setRegisterAs('workshop')}
                style={[
                  styles.typeCard,
                  registerAs === 'workshop' && styles.typeCardActive,
                ]}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    registerAs === 'workshop'
                      ? ['#3b82f6', '#2563eb']
                      : ['#e5e7eb', '#d1d5db']
                  }
                  style={styles.typeIconContainer}
                >
                  <IconSymbol
                    name="shield.fill"
                    size={24}
                    color={registerAs === 'workshop' ? '#ffffff' : '#6b7280'}
                  />
                </LinearGradient>
                <ThemedText style={styles.typeTitle}>{t('register.workshop')}</ThemedText>
                <ThemedText style={styles.typeSubtitle}>{t('register.workshopSubtitle')}</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRegisterAs('client')}
                style={[
                  styles.typeCard,
                  registerAs === 'client' && styles.typeCardActive,
                ]}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    registerAs === 'client'
                      ? ['#0d9488', '#14b8a6']
                      : ['#e5e7eb', '#d1d5db']
                  }
                  style={styles.typeIconContainer}
                >
                  <IconSymbol
                    name="person.fill"
                    size={24}
                    color={registerAs === 'client' ? '#ffffff' : '#6b7280'}
                  />
                </LinearGradient>
                <ThemedText style={styles.typeTitle}>{t('register.client')}</ThemedText>
                <ThemedText style={styles.typeSubtitle}>{t('register.clientSubtitle')}</ThemedText>
              </TouchableOpacity>
            </Animated.View>

            {/* Form */}
            {registerAs && (
              <Animated.View
                key={`form-${registerAs}`}
                entering={!hasAnimatedForm.current ? FadeIn.duration(800).delay(400).springify() : undefined}
                style={styles.formContainer}
                onLayout={() => {
                  hasAnimatedForm.current = true;
                }}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                  style={styles.formBlur}
                >
                  {formError ? (
                    <View style={styles.errorContainer}>
                      <IconSymbol name="checkmark.circle.fill" size={16} color="#ef4444" />
                      <View style={styles.errorContent}>
                        <ThemedText style={styles.errorText}>{formError}</ThemedText>
                        {formErrors.length > 0 && (
                          <View style={styles.errorList}>
                            {formErrors.map((error, index) => (
                              <ThemedText key={index} style={styles.errorListItem}>
                                • {error}
                              </ThemedText>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  ) : null}

                  {registerAs === 'client' ? (
                    <View style={styles.form}>
                      <View style={styles.row}>
                        <View style={[styles.inputContainer, styles.halfInput]}>
                          <ThemedText style={styles.label}>{t('register.firstName')}</ThemedText>
                          <TextInput
                            style={styles.input}
                            placeholder={t('register.firstName')}
                            placeholderTextColor="#9ca3af"
                            value={userData.firstName}
                            onChangeText={(text) => handleUserChange('firstName', text)}
                          />
                        </View>
                        <View style={[styles.inputContainer, styles.halfInput]}>
                          <ThemedText style={styles.label}>{t('register.lastName')}</ThemedText>
                          <TextInput
                            style={styles.input}
                            placeholder={t('register.lastName')}
                            placeholderTextColor="#9ca3af"
                            value={userData.lastName}
                            onChangeText={(text) => handleUserChange('lastName', text)}
                          />
                        </View>
                      </View>

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.emailRequired')}</ThemedText>
                        <TextInput
                          style={styles.input}
                          placeholder={t('register.emailPlaceholder')}
                          placeholderTextColor="#9ca3af"
                          value={userData.email}
                          onChangeText={(text) => handleUserChange('email', text)}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.phone')}</ThemedText>
                        <TextInput
                          style={styles.input}
                          placeholder={t('register.phonePlaceholder')}
                          placeholderTextColor="#9ca3af"
                          value={userData.phone}
                          onChangeText={(text) => handleUserChange('phone', text)}
                          keyboardType="phone-pad"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.passwordLabel')}</ThemedText>
                        <View style={styles.passwordWrapper}>
                          <TextInput
                            style={styles.passwordInput}
                            placeholder="••••••••"
                            placeholderTextColor="#9ca3af"
                            value={userData.password}
                            onChangeText={(text) => handleUserChange('password', text)}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
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

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.confirmPasswordLabel')}</ThemedText>
                        <View style={styles.passwordWrapper}>
                          <TextInput
                            style={styles.passwordInput}
                            placeholder="••••••••"
                            placeholderTextColor="#9ca3af"
                            value={userData.confirmPassword}
                            onChangeText={(text) => handleUserChange('confirmPassword', text)}
                            secureTextEntry={!showConfirmPassword}
                            autoCapitalize="none"
                          />
                          <TouchableOpacity
                            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                            style={styles.eyeButton}
                          >
                            <IconSymbol
                              name={showConfirmPassword ? 'checkmark.circle.fill' : 'shield.fill'}
                              size={20}
                              color="#6b7280"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.form, styles.formWithPadding]}>
                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.workshopName')}</ThemedText>
                        <TextInput
                          style={styles.input}
                          placeholder={t('register.workshopNamePlaceholder')}
                          placeholderTextColor="#9ca3af"
                          value={workshopData.name}
                          onChangeText={(text) => handleWorkshopChange('name', text)}
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.workshopType')}</ThemedText>
                        <View style={styles.selectContainer}>
                          <ThemedText style={styles.selectText}>
                            {workshopData.type || t('register.selectType')}
                          </ThemedText>
                        </View>
                        {/* TODO: Add Picker component for type selection */}
                      </View>

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.emailRequired')}</ThemedText>
                        <TextInput
                          style={styles.input}
                          placeholder={t('register.workshopEmailPlaceholder')}
                          placeholderTextColor="#9ca3af"
                          value={workshopData.email}
                          onChangeText={(text) => handleWorkshopChange('email', text)}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.address')}</ThemedText>
                        <TextInput
                          style={styles.input}
                          placeholder={t('register.addressPlaceholder')}
                          placeholderTextColor="#9ca3af"
                          value={workshopData.adr}
                          onChangeText={(text) => handleWorkshopChange('adr', text)}
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.phone')}</ThemedText>
                        <TextInput
                          style={styles.input}
                          placeholder={t('register.phonePlaceholder')}
                          placeholderTextColor="#9ca3af"
                          value={workshopData.phone}
                          onChangeText={(text) => handleWorkshopChange('phone', text)}
                          keyboardType="phone-pad"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.passwordLabel')}</ThemedText>
                        <View style={styles.passwordWrapper}>
                          <TextInput
                            style={styles.passwordInput}
                            placeholder="••••••••"
                            placeholderTextColor="#9ca3af"
                            value={workshopData.password}
                            onChangeText={(text) => handleWorkshopChange('password', text)}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
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

                      <View style={styles.inputContainer}>
                        <ThemedText style={styles.label}>{t('register.confirmPasswordLabel')}</ThemedText>
                        <View style={styles.passwordWrapper}>
                          <TextInput
                            style={styles.passwordInput}
                            placeholder="••••••••"
                            placeholderTextColor="#9ca3af"
                            value={workshopData.confirmPassword}
                            onChangeText={(text) => handleWorkshopChange('confirmPassword', text)}
                            secureTextEntry={!showConfirmPassword}
                            autoCapitalize="none"
                          />
                          <TouchableOpacity
                            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                            style={styles.eyeButton}
                          >
                            <IconSymbol
                              name={showConfirmPassword ? 'checkmark.circle.fill' : 'shield.fill'}
                              size={20}
                              color="#6b7280"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={!registerAs || isSubmitting}
                    style={[styles.submitButton, (!registerAs || isSubmitting) && styles.submitButtonDisabled]}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.submitButtonGradient}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <ThemedText style={styles.submitButtonText}>
                          {t('register.createAccount')}
                        </ThemedText>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.loginLink}>
                    <ThemedText style={styles.loginText}>
                      {t('register.alreadyHaveAccount')}{' '}
                    </ThemedText>
                    <TouchableOpacity onPress={() => router.push('/login')}>
                      <ThemedText style={styles.loginLinkText}>{t('register.signIn')}</ThemedText>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </Animated.View>
            )}

            {/* Back Button */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <IconSymbol name="chevron.left" size={16} color="#6b7280" />
              <ThemedText style={styles.backButtonText}>{t('register.back')}</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      {showSuccessModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.modalBlur}
            >
              <View style={styles.modalIconContainer}>
                <IconSymbol name="checkmark.circle.fill" size={48} color="#10b981" />
              </View>
              <ThemedText style={styles.modalTitle}>
                {t('register.successTitle')}
              </ThemedText>
              <ThemedText style={styles.modalText}>
                {t('register.successVerifiedBody')}
              </ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setShowSuccessModal(false);
                  router.push('/login');
                }}
                style={styles.modalButton}
              >
                <LinearGradient
                  colors={['#0d9488', '#14b8a6']}
                  style={styles.modalButtonGradient}
                >
                  <ThemedText style={styles.modalButtonText}>
                    {t('register.goToLogin')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
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
    paddingHorizontal: padding.large,
    paddingTop: padding.large * 2,
  },
  header: {
    alignItems: 'center',
    marginBottom: padding.large * 1.5,
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
    paddingHorizontal: padding.horizontal,
  },
  typeSelector: {
    flexDirection: 'column',
    gap: padding.medium,
    marginBottom: padding.large,
  },
  typeCard: {
    width: '100%',
    padding: padding.large,
    borderRadius: scale(16),
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  typeCardActive: {
    borderColor: '#0d9488',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  typeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  typeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  typeSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  formContainer: {
    borderRadius: 24,
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
    padding: padding.large,
  },
  formWithPadding: {
    padding: padding.large * 1.5,
  },
  errorContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 20,
    gap: 12,
  },
  errorContent: {
    flex: 1,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
    marginBottom: 4,
  },
  errorList: {
    marginTop: 4,
  },
  errorListItem: {
    fontSize: 13,
    color: '#dc2626',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputContainer: {
    marginBottom: 20,
  },
  halfInput: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    height: 48,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1f2937',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1f2937',
  },
  eyeButton: {
    padding: 12,
  },
  selectContainer: {
    height: 48,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  selectText: {
    fontSize: 16,
    color: '#1f2937',
  },
  submitButton: {
    borderRadius: scale(12),
    overflow: 'hidden',
    marginBottom: padding.medium,
    alignSelf: 'center',
    minWidth: scale(150),
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonGradient: {
    paddingVertical: padding.small,
    paddingHorizontal: padding.large,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#ffffff',
  },
  loginLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: padding.large,
  },
  loginText: {
    fontSize: 14,
    color: '#6b7280',
  },
  loginLinkText: {
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
  // Verification styles
  verificationContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  verificationHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  verificationIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  verificationTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  verificationSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  verificationEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0d9488',
    marginBottom: 16,
    textAlign: 'center',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timerBadgeActive: {
    backgroundColor: '#dbeafe',
  },
  timerBadgeExpired: {
    backgroundColor: '#fee2e2',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  verificationForm: {
    borderRadius: 24,
    overflow: 'hidden',
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
  codeInputContainer: {
    padding: 24,
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  codeInput: {
    height: 64,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
    color: '#1f2937',
  },
  codeInputError: {
    borderColor: '#ef4444',
  },
  codeErrorContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  codeErrorText: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
  },
  verifyButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 24,
    marginBottom: 16,
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
  verifyButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  backToRegisterButton: {
    marginHorizontal: 24,
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    alignItems: 'center',
  },
  backToRegisterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
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

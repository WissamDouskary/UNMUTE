import React, { useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { apiClient } from '@unmute/api-client';
import type { User } from '@unmute/api-client';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

function MainAppContent() {
  const { user, isAuthenticated, isLoading, error, login, register, logout, clearError, refreshUser } =
    useAuth();

  // Mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Live API test state
  const [testResult, setTestResult] = useState<User | null>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const baseUrl = apiClient.getBaseUrl();

  const handleDemoFill = () => {
    setEmail('alice@example.com');
    setPassword('password123');
    clearError();
    setLocalError(null);
  };

  const handleLoginSubmit = async () => {
    clearError();
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
    } catch {
      // error handled by context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async () => {
    clearError();
    setLocalError(null);

    if (!displayName.trim() || !email.trim() || !password) {
      setLocalError('Please fill in all required fields.');
      return;
    }

    if (displayName.trim().length < 2) {
      setLocalError('Display name must be at least 2 characters.');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
      });
    } catch {
      // error handled by context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestMe = async () => {
    setIsTesting(true);
    setTestError(null);
    const start = Date.now();
    try {
      const data = await apiClient.getMe();
      setTestResult(data);
      setTestLatency(Date.now() - start);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setTestError(e?.message || 'Failed to call /api/v1/users/me');
    } finally {
      setIsTesting(false);
    }
  };

  const handleManualSync = async () => {
    setIsTesting(true);
    try {
      await refreshUser();
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

  // 1. Loading Splash
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>U</Text>
          </View>
          <ActivityIndicator size="large" color="#7c5cfc" style={{ marginTop: 24 }} />
          <Text style={styles.loadingText}>Restoring session from Keychain…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 2. Unauthenticated: Login & Register Screens
  if (!isAuthenticated) {
    const displayError = localError || error;

    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Brand Header */}
            <View style={styles.authHeader}>
              <View style={styles.logo}>
                <Text style={styles.logoText}>U</Text>
              </View>
              <Text style={styles.title}>UNMUTE</Text>
              <Text style={styles.subtitle}>Your mind, finally in motion.</Text>
            </View>

            {/* Mode Switcher Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, authMode === 'login' && styles.tabButtonActive]}
                onPress={() => {
                  setAuthMode('login');
                  clearError();
                  setLocalError(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.tabButtonText, authMode === 'login' && styles.tabButtonTextActive]}
                >
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, authMode === 'register' && styles.tabButtonActive]}
                onPress={() => {
                  setAuthMode('register');
                  clearError();
                  setLocalError(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    authMode === 'register' && styles.tabButtonTextActive,
                  ]}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error Banner */}
            {displayError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{displayError}</Text>
              </View>
            )}

            {/* Form Card */}
            <View style={styles.card}>
              {authMode === 'register' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Display Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Alice Walker"
                    placeholderTextColor="#636780"
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#636780"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Password</Text>
                  {authMode === 'login' && (
                    <TouchableOpacity onPress={handleDemoFill}>
                      <Text style={styles.demoLink}>Use Demo Account</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={authMode === 'register' ? 'At least 8 characters' : '••••••••••••'}
                    placeholderTextColor="#636780"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Text style={styles.eyeButtonText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {authMode === 'register' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Repeat your password"
                    placeholderTextColor="#636780"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                </View>
              )}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
                onPress={authMode === 'login' ? handleLoginSubmit : handleRegisterSubmit}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {authMode === 'login' ? 'Sign In to UNMUTE' : 'Create Account'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Security Note Footer */}
            <View style={styles.securityFootnote}>
              <View style={styles.securityDot} />
              <Text style={styles.securityFootnoteText}>
                Encrypted via iOS Keychain & Hardware KeyStore
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  // 3. Authenticated: Protected Mobile Dashboard & API Tester
  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top App Header */}
        <View style={styles.dashboardHeader}>
          <View style={styles.headerBrand}>
            <View style={styles.smallLogo}>
              <Text style={styles.smallLogoText}>U</Text>
            </View>
            <View>
              <Text style={styles.brandTitle}>UNMUTE</Text>
              <Text style={styles.brandSubtitle}>Mobile App Shell</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={logout}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.userName}>{user?.displayName || 'User'}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>
          </View>

          <View style={styles.securityBadgeRow}>
            <View style={styles.statusDotActive} />
            <Text style={styles.securityBadgeText}>
              Authenticated • Hardware Keychain Protected
            </Text>
          </View>
        </View>

        {/* Live Backend Connection Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backend API Inspector</Text>
          <Text style={styles.cardDescription}>
            Connected to Spring Boot API via Bearer token authentication.
          </Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Base URL</Text>
            <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
              {baseUrl}
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleManualSync}
              disabled={isTesting}
            >
              <Text style={styles.secondaryButtonText}>Sync Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, { flex: 1, marginTop: 0 }]}
              onPress={handleTestMe}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Test GET /users/me</Text>
              )}
            </TouchableOpacity>
          </View>

          {testError && (
            <View style={[styles.errorBanner, { marginTop: 12 }]}>
              <Text style={styles.errorBannerText}>{testError}</Text>
            </View>
          )}

          {testResult && (
            <View style={styles.resultBox}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultStatusText}>HTTP 200 OK — Verified</Text>
                {testLatency !== null && (
                  <Text style={styles.resultLatencyText}>{testLatency}ms</Text>
                )}
              </View>
              <Text style={styles.resultJson}>
                {JSON.stringify(testResult, null, 2)}
              </Text>
            </View>
          )}
        </View>

        {/* Mobile Roadmap Card */}
        <View style={styles.roadmapCard}>
          <View style={styles.roadmapHeader}>
            <Text style={styles.roadmapTag}>PHASE 2 PREVIEW</Text>
            <Text style={styles.roadmapStatus}>Next Up</Text>
          </View>
          <Text style={styles.roadmapTitle}>Voice Capture & Audio Memos</Text>
          <Text style={styles.roadmapDescription}>
            Native high-fidelity microphone capture, background transcription sync, and AI action parsing.
          </Text>
        </View>
      </ScrollView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

export default function HomeScreen() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#9498a8',
    fontSize: 14,
    marginTop: 14,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  authHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#7c5cfc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#7c5cfc',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
  },
  title: {
    color: '#e8e9ed',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#9498a8',
    fontSize: 14,
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#242838',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#7c5cfc',
  },
  tabButtonText: {
    color: '#9498a8',
    fontSize: 13,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#161922',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#242838',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    color: '#9498a8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  demoLink: {
    color: '#9278ff',
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1e2230',
    borderWidth: 1,
    borderColor: '#2a2d3e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#e8e9ed',
    fontSize: 14,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e2230',
    borderWidth: 1,
    borderColor: '#2a2d3e',
    borderRadius: 10,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eyeButtonText: {
    color: '#9498a8',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#7c5cfc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 18,
  },
  securityFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  securityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
    marginRight: 8,
  },
  securityFootnoteText: {
    color: '#636780',
    fontSize: 11,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#242838',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallLogo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#7c5cfc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  smallLogoText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  brandTitle: {
    color: '#e8e9ed',
    fontSize: 16,
    fontWeight: '700',
  },
  brandSubtitle: {
    color: '#636780',
    fontSize: 11,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  logoutButtonText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
  },
  userCard: {
    backgroundColor: '#161922',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#242838',
    marginBottom: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#252840',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#7c5cfc',
  },
  avatarText: {
    color: '#9278ff',
    fontSize: 16,
    fontWeight: '700',
  },
  userName: {
    color: '#e8e9ed',
    fontSize: 16,
    fontWeight: '700',
  },
  userEmail: {
    color: '#9498a8',
    fontSize: 12,
    marginTop: 2,
  },
  securityBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e2230',
  },
  statusDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34d399',
    marginRight: 8,
  },
  securityBadgeText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '600',
  },
  cardTitle: {
    color: '#e8e9ed',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDescription: {
    color: '#9498a8',
    fontSize: 12,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e2230',
    marginBottom: 14,
  },
  infoLabel: {
    color: '#636780',
    fontSize: 12,
  },
  infoValue: {
    color: '#9498a8',
    fontSize: 12,
    fontFamily: 'Courier',
    maxWidth: '65%',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    backgroundColor: '#1e2230',
    borderWidth: 1,
    borderColor: '#2a2d3e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#9498a8',
    fontSize: 13,
    fontWeight: '600',
  },
  resultBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0f1117',
    borderWidth: 1,
    borderColor: '#2a2d3e',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultStatusText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '600',
  },
  resultLatencyText: {
    color: '#636780',
    fontSize: 11,
    fontFamily: 'Courier',
  },
  resultJson: {
    color: '#e8e9ed',
    fontSize: 11,
    fontFamily: 'Courier',
  },
  roadmapCard: {
    backgroundColor: '#161922',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#7c5cfc44',
  },
  roadmapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roadmapTag: {
    color: '#9278ff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  roadmapStatus: {
    color: '#9498a8',
    fontSize: 10,
    fontWeight: '600',
  },
  roadmapTitle: {
    color: '#e8e9ed',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  roadmapDescription: {
    color: '#9498a8',
    fontSize: 12,
    lineHeight: 16,
  },
});

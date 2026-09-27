import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, GraduationCap, LogIn } from 'lucide-react-native';
import { useAuth } from '../src/auth/context';
import { requestPasswordReset } from '../src/auth/session';
import { Button, Eyebrow, T } from '../src/components/ui';
import { alpha, colors, fonts, fontSize, radius, spacing, tracking } from '../src/theme/tokens';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    setNotice(null);
    setLoading(true);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
    // On success the root AuthGate redirects into the app.
  }

  async function onForgotPassword() {
    setError(null);
    setNotice(null);
    const target = email.trim();
    if (!target || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) {
      setError('Enter your email in the field above, then tap “Forgot password”.');
      return;
    }
    setResetting(true);
    try {
      setNotice(await requestPasswordReset(target));
    } catch {
      setError('Could not send the reset email. Please try again shortly.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing['4xl'], paddingBottom: insets.bottom + spacing['3xl'] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <GraduationCap size={22} color={colors.cyan} />
          </View>
          <Eyebrow>Student Portal</Eyebrow>
          <T weight="display" size="2xl" style={{ marginTop: spacing.sm, letterSpacing: tracking.tightest }}>
            Sign in
          </T>
          <T tone="fog" size="sm" style={{ marginTop: spacing.xs }}>
            Syed Jabran Ali Kamran
          </T>
        </View>

        <View style={styles.card}>
          <T tone="fog" size="xs" weight="medium" style={styles.label}>
            Email
          </T>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.dust}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            style={styles.input}
          />

          <T tone="fog" size="xs" weight="medium" style={[styles.label, { marginTop: spacing.lg }]}>
            Password
          </T>
          <View>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.dust}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              onSubmitEditing={onSubmit}
              style={[styles.input, { paddingRight: 44 }]}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={10}
              style={styles.eye}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff size={16} color={colors.dust} />
              ) : (
                <Eye size={16} color={colors.dust} />
              )}
            </Pressable>
          </View>

          {error ? (
            <T tone="signal" size="xs" style={{ marginTop: spacing.lg, lineHeight: 17 }}>
              {error}
            </T>
          ) : null}
          {notice ? (
            <T tone="cyan" size="xs" style={{ marginTop: spacing.lg, lineHeight: 17 }}>
              {notice}
            </T>
          ) : null}

          <Button
            label="Sign in"
            onPress={onSubmit}
            loading={loading}
            disabled={!email || !password}
            icon={<LogIn size={15} color={colors.space} />}
            style={{ marginTop: spacing.xl }}
          />

          <Pressable onPress={onForgotPassword} disabled={resetting} style={{ marginTop: spacing.lg }}>
            <T tone="dust" size="xs" style={{ textAlign: 'center' }}>
              {resetting ? 'Sending reset link…' : 'Forgot password?'}
            </T>
          </Pressable>
        </View>

        <T tone="dust" size="2xs" style={styles.footer}>
          You&apos;ll stay signed in on this device.
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  content: { paddingHorizontal: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logo: {
    height: 52,
    width: 52,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: alpha.cyanBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: alpha.cardBorder,
    backgroundColor: alpha.cardBg,
    padding: spacing['2xl'],
  },
  label: { marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: alpha.border,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(10,16,36,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ice,
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
  },
  eye: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 12 },
  footer: { textAlign: 'center', marginTop: spacing.xl },
});

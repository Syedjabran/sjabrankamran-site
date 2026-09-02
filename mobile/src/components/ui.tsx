import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { alpha, colors, fonts, fontSize, radius, spacing, tracking } from '../theme/tokens';

/** Body text. Mirrors the portal's text-fog / text-ice / text-dust roles. */
export function T({
  children,
  tone = 'ice',
  size = 'base',
  weight = 'regular',
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  tone?: 'ice' | 'fog' | 'dust' | 'cyan' | 'emerald' | 'signal' | 'amber';
  size?: keyof typeof fontSize;
  weight?: 'regular' | 'medium' | 'semibold' | 'display';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const toneColor = {
    ice: colors.ice,
    fog: colors.fog,
    dust: colors.dust,
    cyan: colors.cyan,
    emerald: colors.emerald2,
    signal: colors.signal,
    amber: colors.amber300,
  }[tone];
  const family = {
    regular: fonts.sans,
    medium: fonts.sansMedium,
    semibold: fonts.sansSemibold,
    display: fonts.display,
  }[weight];
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: toneColor, fontFamily: family, fontSize: fontSize[size] }, style]}
    >
      {children}
    </Text>
  );
}

/** .eyebrow — mono, uppercase, wide tracking, cyan. */
export function Eyebrow({ children, tone = 'cyan' }: { children: React.ReactNode; tone?: 'cyan' | 'dust' }) {
  return (
    <Text
      style={{
        color: tone === 'cyan' ? colors.cyan : colors.dust,
        fontFamily: fonts.mono,
        fontSize: fontSize['2xs'],
        textTransform: 'uppercase',
        letterSpacing: tracking.widelabel,
      }}
    >
      {children}
    </Text>
  );
}

/** .card — rounded-2xl, hairline border, barely-there fill. */
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}>
      {content}
    </Pressable>
  );
}

/** .btn-primary / .btn-ghost — pill buttons. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnGhost,
        (disabled || loading) && { opacity: 0.6 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isPrimary ? colors.space : colors.ice} />
      ) : (
        icon
      )}
      <Text
        style={{
          color: isPrimary ? colors.space : colors.ice,
          fontFamily: fonts.sansSemibold,
          fontSize: fontSize.base,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Rounded pill used for role/status badges. */
export function Badge({
  children,
  tone = 'emerald',
}: {
  children: React.ReactNode;
  tone?: 'emerald' | 'cyan' | 'signal' | 'dust';
}) {
  const map = {
    emerald: { border: alpha.emeraldBorder, color: colors.emerald2 },
    cyan: { border: alpha.cyanBorder, color: colors.cyan },
    signal: { border: alpha.signalBorder, color: colors.signal },
    dust: { border: alpha.border, color: colors.dust },
  }[tone];
  return (
    <View style={[styles.badge, { borderColor: map.border }]}>
      <Text
        style={{
          color: map.color,
          fontFamily: fonts.mono,
          fontSize: fontSize['2xs'],
          textTransform: 'uppercase',
          letterSpacing: tracking.wider,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/** Screen scaffold: the portal's fixed dark ground + consistent padding. */
export function Screen({
  children,
  scroll = true,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.cyan} />
      <T tone="dust" size="sm" style={{ marginTop: spacing.md }}>
        {label}
      </T>
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: alpha.signalBorder, backgroundColor: alpha.signalFaint }}>
      <T tone="signal" size="sm">
        {message}
      </T>
      {onRetry ? (
        <Button label="Try again" variant="ghost" onPress={onRetry} style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }} />
      ) : null}
    </Card>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <Card>
      <T tone="dust" size="sm">
        {message}
      </T>
    </Card>
  );
}

/** Section heading in the portal's display face. */
export function H1({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.h1} numberOfLines={2}>
      {children}
    </Text>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  screenContent: { padding: spacing.xl, paddingBottom: spacing['4xl'], gap: spacing.lg },
  card: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: alpha.cardBorder,
    backgroundColor: alpha.cardBg,
    padding: spacing.xl,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  btnPrimary: { backgroundColor: colors.cyan },
  btnGhost: { borderWidth: 1, borderColor: alpha.borderStrong },
  badge: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  h1: {
    color: colors.ice,
    fontFamily: fonts.displayBold,
    fontSize: fontSize['2xl'],
    letterSpacing: tracking.tightest,
  },
  h2: {
    color: colors.ice,
    fontFamily: fonts.display,
    fontSize: fontSize.lg,
    letterSpacing: tracking.tightest,
  },
});

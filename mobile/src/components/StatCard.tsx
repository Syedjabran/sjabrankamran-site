import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { alpha, colors, fonts, fontSize, radius, spacing, tracking } from '../theme/tokens';
import { T } from './ui';

type Accent = 'cyan' | 'emerald' | 'magenta' | 'amber';

const ACCENT: Record<Accent, string> = {
  cyan: colors.cyan,
  emerald: colors.emerald2,
  magenta: colors.magenta,
  amber: colors.amber300,
};

/**
 * The dashboard stat tile, ported from the website's StatCard: muted uppercase
 * label, accent icon in a bordered square, big display-face value.
 */
export function StatCard({
  label,
  value,
  icon,
  accent = 'cyan',
  onPress,
}: {
  label: string;
  value: number | string | null | undefined;
  icon: React.ReactNode;
  accent?: Accent;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.card}>
      <View style={styles.top}>
        <T tone="dust" size="xs" style={styles.label} numberOfLines={2}>
          {label}
        </T>
        <View style={[styles.iconBox, { borderColor: alpha.border }]}>{icon}</View>
      </View>
      <T weight="display" style={styles.value}>
        {value === null || value === undefined ? '—' : value}
      </T>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}>
      {body}
    </Pressable>
  );
}

export { ACCENT as STAT_ACCENT };

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: alpha.border,
    backgroundColor: alpha.spaceTranslucent,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  label: { textTransform: 'uppercase', letterSpacing: tracking.wider, lineHeight: 14, flex: 1 },
  iconBox: {
    height: 32,
    width: 32,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: colors.ice,
    fontFamily: fonts.displayBold,
    fontSize: fontSize['3xl'],
    marginTop: spacing.md,
    letterSpacing: tracking.tightest,
  },
});

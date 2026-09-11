import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { T } from './ui';
import { alpha, colors, motion, radius, spacing } from '../theme/tokens';

/**
 * One clock drives every skeleton on screen.
 *
 * Each placeholder animating on its own phase reads as noise; a single shared
 * value makes the whole screen breathe together, which is what separates a
 * considered loading state from a busy one. Driven natively, so it costs
 * nothing on the JS thread while data is in flight.
 */
const pulse = new Animated.Value(0);
let pulseStarted = false;

function startPulse() {
  if (pulseStarted) return;
  pulseStarted = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: motion.pulseDuration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: motion.pulseDuration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ])
  ).start();
}

const pulseOpacity = pulse.interpolate({
  inputRange: [0, 1],
  outputRange: [motion.pulseMinOpacity, motion.pulseMaxOpacity],
});

/** A single placeholder block. */
export function Skeleton({
  width = '100%',
  height = 12,
  rounded = 'lg',
  style,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: keyof typeof radius;
  style?: StyleProp<ViewStyle>;
}) {
  useEffect(startPulse, []);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius[rounded], backgroundColor: alpha.skeleton },
        { opacity: pulseOpacity },
        style,
      ]}
    />
  );
}

/**
 * A run of text lines. The last line is shortened so the block reads as a
 * paragraph rather than a solid rectangle.
 */
export function SkeletonText({
  lines = 3,
  width = '100%',
  lastLineWidth = '60%',
  height = 11,
  gap = spacing.sm,
}: {
  lines?: number;
  width?: DimensionValue;
  lastLineWidth?: DimensionValue;
  height?: number;
  gap?: number;
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={height}
          width={i === lines - 1 && lines > 1 ? lastLineWidth : width}
        />
      ))}
    </View>
  );
}

/** Card-shaped placeholder matching the real Card's border, radius and padding. */
export function SkeletonCard({
  lines = 2,
  showEyebrow = true,
  style,
}: {
  lines?: number;
  showEyebrow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      {showEyebrow ? <Skeleton width="32%" height={9} /> : null}
      <Skeleton width="70%" height={15} />
      {lines > 0 ? <SkeletonText lines={lines} /> : null}
    </View>
  );
}

/** A list of card placeholders — the default shape for a loading feed. */
export function SkeletonList({
  count = 4,
  lines = 2,
  showEyebrow = true,
}: {
  count?: number;
  lines?: number;
  showEyebrow?: boolean;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={lines} showEyebrow={showEyebrow} />
      ))}
    </View>
  );
}

/** A row of compact stat tiles, mirroring the dashboard's StatCard grid. */
export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.statRow}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.statTile}>
          <Skeleton width="55%" height={9} />
          <Skeleton width="40%" height={22} />
        </View>
      ))}
    </View>
  );
}

/** Leaderboard / ranking rows: rank chip, name, trailing score. */
export function SkeletonRankRows({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.card}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.rankRow}>
          <Skeleton width={28} height={28} rounded="full" />
          <View style={styles.rankName}>
            <Skeleton width={`${55 + ((i * 7) % 25)}%`} height={12} />
          </View>
          <Skeleton width={38} height={12} />
        </View>
      ))}
    </View>
  );
}

/** Nav/menu placeholder used while roles resolve. */
export function SkeletonNav({ count = 8 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.lg }}>
      <Skeleton width="30%" height={9} />
      <View style={{ gap: spacing.sm }}>
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} height={44} rounded="xl" />
        ))}
      </View>
    </View>
  );
}

/**
 * Placeholder for an in-app browser page, which has no shape we can know in
 * advance — a title block over paragraph lines reads as "a document is coming"
 * without pretending to predict the layout.
 */
export function SkeletonDocument() {
  return (
    <View style={styles.doc}>
      <Skeleton width="55%" height={20} />
      <Skeleton width="35%" height={10} />
      <View style={styles.docBody}>
        <SkeletonText lines={4} />
        <SkeletonText lines={3} lastLineWidth="45%" />
        <Skeleton height={96} rounded="2xl" />
        <SkeletonText lines={2} lastLineWidth="70%" />
      </View>
    </View>
  );
}

/**
 * Determinate load bar for the in-app browser, the way a browser shows one:
 * it tracks real progress, then fades out rather than snapping away.
 */
export function TopProgressBar({ progress, visible }: { progress: number; visible: boolean }) {
  const grow = React.useRef(new Animated.Value(0)).current;
  const fade = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, grow]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: visible ? 120 : 260,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, fade]);

  // The bar is a full-width view scaled along X rather than a view whose width
  // animates: `width` is not a native-animatable property, and mixing a JS
  // driver with the native-driven opacity on one node is an error. `scaleX`
  // and `opacity` are both native, so the whole bar stays off the JS thread.
  return (
    <View style={styles.progressTrack} pointerEvents="none">
      <Animated.View
        style={[styles.progressFill, { opacity: fade, transform: [{ scaleX: grow }] }]}
      />
    </View>
  );
}

/**
 * Inline spinner for a single field or control that is refreshing while the
 * rest of the screen stays interactive — the counterpart to a skeleton, which
 * is for content that has never been shown yet.
 */
export function Spinner({
  size = 'small',
  tone = 'cyan',
}: {
  size?: 'small' | 'large';
  tone?: 'cyan' | 'dust';
}) {
  return <ActivityIndicator size={size} color={tone === 'cyan' ? colors.cyan : colors.dust} />;
}

/** Spinner plus a short label, laid out on one line. */
export function InlineLoading({ label }: { label?: string }) {
  return (
    <View style={styles.inline}>
      <Spinner tone="dust" />
      {label ? (
        <T tone="dust" size="xs">
          {label}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: alpha.cardBorder,
    backgroundColor: alpha.cardBg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statTile: {
    flexGrow: 1,
    flexBasis: '40%',
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: alpha.cardBorder,
    backgroundColor: alpha.cardBg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankName: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  doc: { padding: spacing.xl, gap: spacing.md },
  docBody: { gap: spacing.xl, marginTop: spacing.lg },
  progressTrack: {
    height: 2,
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  progressFill: {
    height: 2,
    width: '100%',
    backgroundColor: colors.cyan,
    // Without this the bar would scale outward from its centre.
    transformOrigin: 'left',
  },
});

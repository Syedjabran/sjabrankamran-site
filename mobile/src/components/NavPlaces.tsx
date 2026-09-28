import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight, Globe } from 'lucide-react-native';
import { ApiError } from '../api/client';
import { NavigationFormatError, openTargetFor, type AppPlace, type AppSubject } from '../nav/nav';
import { accentFor, alpha, colors, radius, spacing, tracking } from '../theme/tokens';
import { PortalIcon } from './PortalIcon';
import { SkeletonList } from './Skeleton';
import { Button, Card, ErrorNote, T } from './ui';

/** A group's title: the portal's small uppercase labels ("GENERAL"). */
export function GroupTitle({ children }: { children: string }) {
  return (
    <T tone="dust" size="2xs" style={styles.groupTitle}>
      {children.toUpperCase()}
    </T>
  );
}

/** One destination as a row: icon, plain name, one-line purpose; a globe
 *  when it opens the portal page inside the app. */
function PlaceRow({ place, onOpen, last }: { place: AppPlace; onOpen: (p: AppPlace) => void; last: boolean }) {
  const web = openTargetFor(place).kind === 'web';
  return (
    <Card onPress={() => onOpen(place)} style={[styles.row, last && styles.rowLast]}>
      <View style={styles.icon}>
        <PortalIcon name={place.icon} size={16} color={colors.cyan} />
      </View>
      <View style={styles.rowText}>
        <T size="base" weight="medium">
          {place.name}
        </T>
        {place.purpose ? (
          <T tone="dust" size="xs" numberOfLines={2} style={styles.purpose}>
            {place.purpose}
          </T>
        ) : null}
      </View>
      {web ? <Globe size={13} color={colors.dust} /> : null}
      <ChevronRight size={16} color={colors.dust} />
    </Card>
  );
}

/** A titled list of destinations (a subject's modules, General, Administration). */
export function PlaceGroup({
  title,
  places,
  onOpen,
}: {
  title?: string;
  places: AppPlace[];
  onOpen: (place: AppPlace) => void;
}) {
  if (!places.length) return null;
  return (
    <View style={styles.group}>
      {title ? <GroupTitle>{title}</GroupTitle> : null}
      <Card style={styles.list}>
        {places.map((place, i) => (
          <PlaceRow key={place.id} place={place} onOpen={onOpen} last={i === places.length - 1} />
        ))}
      </Card>
    </View>
  );
}

/** A subject on the home screen: its icon and accent, name, what is inside. */
export function SubjectCard({ subject, onOpen }: { subject: AppSubject; onOpen: (s: AppSubject) => void }) {
  const accent = accentFor(subject.accent);
  return (
    <Card
      onPress={() => onOpen(subject)}
      style={[styles.subject, { borderColor: accent.border, backgroundColor: accent.soft }]}
    >
      <View style={[styles.subjectIcon, { borderColor: accent.border }]}>
        <PortalIcon name={subject.icon} size={20} color={accent.color} />
      </View>
      <View style={styles.rowText}>
        <T weight="display" size="md">
          {subject.name}
        </T>
        <T tone="fog" size="xs" numberOfLines={2} style={styles.purpose}>
          {subject.purpose}
        </T>
      </View>
      <ChevronRight size={18} color={accent.color} />
    </Card>
  );
}

/**
 * What a screen shows while the portal's navigation is loading or failed:
 * placeholders, a plain-sentence error with a retry, or -- when the portal
 * doesn't offer the navigation yet (an older deploy) or the app is too old
 * to read it -- a way into the portal itself.
 */
export function NavigationStatus({
  loading,
  error,
  onRetry,
  onOpenPortal,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpenPortal: () => void;
}) {
  if (loading) return <SkeletonList count={3} lines={1} showEyebrow={false} />;
  if (!error) return null;
  const unavailable = error instanceof ApiError && error.status === 404;
  const outdated = error instanceof NavigationFormatError && error.outdatedApp;
  if (unavailable || outdated) {
    return (
      <Card>
        <T tone="fog" size="sm">
          {outdated
            ? (error as NavigationFormatError).message
            : 'The portal can’t list your subjects in the app yet. You can still use all of it here.'}
        </T>
        <Button label="Open the portal" onPress={onOpenPortal} style={styles.fallbackButton} />
      </Card>
    );
  }
  return <ErrorNote message={error instanceof Error ? error.message : 'Could not load your subjects.'} onRetry={onRetry} />;
}

const styles = StyleSheet.create({
  groupTitle: { letterSpacing: tracking.widelabel, marginTop: spacing.sm },
  group: { gap: spacing.sm },
  list: { padding: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: alpha.divider,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1, minWidth: 0 },
  purpose: { marginTop: 2, lineHeight: 16 },
  icon: {
    height: 34,
    width: 34,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: alpha.cyanBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subject: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  subjectIcon: {
    height: 44,
    width: 44,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackButton: { marginTop: spacing.lg, alignSelf: 'flex-start' },
});

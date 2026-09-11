import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ban, Clock3, LogOut, ShieldAlert } from 'lucide-react-native';
import { Button, Eyebrow, H1, T } from './ui';
import { alpha, colors, radius, spacing } from '../theme/tokens';
import type { Restriction } from '../api/types';

const SUPPORT_EMAIL = 'physics@sjabrankamran.com';
const ICON_BOX = 48;

/** The portal reports restriction windows in Pakistan Standard Time. */
function formatEnd(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  }).format(parsed);
}

function Pill({ children, tone = 'dust' }: { children: React.ReactNode; tone?: 'dust' | 'amber' }) {
  return (
    <View
      style={[
        styles.pill,
        { borderColor: tone === 'amber' ? alpha.amberBorder : alpha.border },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Shown instead of the whole app when an access lock is active, mirroring the
 * website's PortalAccessBlocked. The session stays signed in on purpose — the
 * restriction is application-level, not an auth revocation — so signing out is
 * offered rather than forced.
 */
export function AccessBlocked({
  restriction,
  onSignOut,
}: {
  restriction: Restriction;
  onSignOut: () => void;
}) {
  const suspended = restriction.mode === 'suspended';
  const end = formatEnd(restriction.endsAt);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconBox}>
            {suspended ? (
              <Clock3 size={22} color={colors.signal} />
            ) : (
              <Ban size={22} color={colors.signal} />
            )}
          </View>
          <View style={styles.headerText}>
            <Eyebrow>Portal access control</Eyebrow>
            <H1>{suspended ? 'Access temporarily suspended' : 'Access locked'}</H1>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.messageBox}>
            <T tone="fog" size="sm" style={styles.message}>
              {restriction.message}
            </T>
          </View>

          <View style={styles.pillRow}>
            <Pill>
              <T tone="dust" size="xs">
                Applies to: <T tone="fog" size="xs" weight="medium">{restriction.scopeLabel}</T>
              </T>
            </Pill>
            {end ? (
              <Pill tone="amber">
                <T tone="amber" size="xs">
                  Scheduled until {end} PKT
                </T>
              </Pill>
            ) : null}
          </View>

          <View style={styles.noteRow}>
            <ShieldAlert size={14} color={colors.cyan} style={styles.noteIcon} />
            <T tone="dust" size="xs" style={styles.note}>
              Your account is still signed in, but portal pages and activities are unavailable
              while this restriction is active.
            </T>
          </View>

          <View style={styles.footer}>
            <T tone="dust" size="xs">
              For help, contact {SUPPORT_EMAIL}.
            </T>
            <Button
              label="Sign out"
              variant="ghost"
              onPress={onSignOut}
              icon={<LogOut size={13} color={colors.ice} />}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: alpha.signalBorder,
    backgroundColor: alpha.spaceTranslucent,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: alpha.signalBorder,
    backgroundColor: alpha.signalFaint,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: alpha.signalBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: spacing.xs },
  body: { padding: spacing.xl, gap: spacing.xl },
  messageBox: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: alpha.border,
    padding: spacing.lg,
  },
  message: { lineHeight: 22 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  noteRow: { flexDirection: 'row', gap: spacing.sm },
  noteIcon: { marginTop: 2 },
  note: { flex: 1, lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: alpha.cardBorder,
    paddingTop: spacing.xl,
  },
});

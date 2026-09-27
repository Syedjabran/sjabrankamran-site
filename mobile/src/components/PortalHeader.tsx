import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, GraduationCap, LogOut, Settings } from 'lucide-react-native';
import { useMe, useNotifications } from '../api/hooks';
import { useAuth } from '../auth/context';
import { isStaff, roleBadges } from '../nav/roles';
import { alpha, colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { Badge, T } from './ui';

/**
 * The portal's signed-in header, ported from the website's (app)/layout.tsx:
 * identity block on the left, then the Staff badge, notification bell,
 * profile link and sign-out on the right.
 */
export function PortalHeader() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: me } = useMe();
  const { data: notifications } = useNotifications();
  const insets = useSafeAreaInsets();
  const unread = notifications?.unread ?? 0;
  const staff = me ? isStaff(me.roles) : false;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.row}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <GraduationCap size={18} color={colors.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <T weight="display" size="base" numberOfLines={1}>
              {me?.full_name || me?.email || 'Portal'}
            </T>
            <T tone="dust" size="xs" numberOfLines={1}>
              {me ? roleBadges(me.roles) : '—'}
            </T>
          </View>
        </View>

        <View style={styles.actions}>
          {staff ? <Badge tone="emerald">Staff</Badge> : null}

          <Pressable
            onPress={() => router.push('/notifications')}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`}
          >
            <Bell size={15} color={unread ? colors.cyan : colors.fog} />
            {unread > 0 ? (
              <View style={styles.dot}>
                <T size="2xs" style={styles.dotText}>
                  {unread > 9 ? '9+' : String(unread)}
                </T>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel="Profile and settings"
          >
            <Settings size={15} color={colors.fog} />
          </Pressable>

          <Pressable
            onPress={() => void signOut()}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel="Sign out"
          >
            <LogOut size={15} color={colors.fog} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: alpha.divider,
    backgroundColor: colors.abyss,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  avatar: {
    height: 40,
    width: 40,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: alpha.cyanBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    height: 32,
    width: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: alpha.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.full,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: colors.space, fontFamily: fonts.sansSemibold, fontSize: 9 },
});

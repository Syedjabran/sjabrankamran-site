import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, UserCircle2 } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { Badge, Card, Empty, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useAdminUsers, useMe } from '../../src/api/hooks';
import { ROLE_LABELS, isStaff } from '../../src/nav/roles';
import { alpha, colors, fonts, fontSize, radius, spacing } from '../../src/theme/tokens';

/** Debounce the search box so typing does not fire a request per keystroke. */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function UsersScreen() {
  const router = useRouter();
  const { data: me } = useMe();
  const staff = me ? isStaff(me.roles) : false;
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 300);
  const { data, isLoading, error, refetch } = useAdminUsers(debounced, staff);

  if (me && !staff) {
    return (
      <View style={styles.root}>
        <PortalHeader />
        <Screen>
          <Empty message="This console is available to staff accounts only." />
        </Screen>
      </View>
    );
  }

  const counts = data?.counts;

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>Users &amp; activity</H2>

        {counts ? (
          <View style={styles.countRow}>
            <Count label="Total" value={counts.total} />
            <Count label="Students" value={counts.students} />
            <Count label="Staff" value={counts.staff} />
            <Count label="Suspended" value={counts.suspended} tone="signal" />
            <Count label="No role" value={counts.noRole} tone="dust" />
          </View>
        ) : null}

        <View style={styles.searchWrap}>
          <Search size={15} color={colors.dust} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email"
            placeholderTextColor={colors.dust}
            style={styles.search}
            autoCapitalize="none"
          />
        </View>

        {isLoading ? <Loading label="Loading users…" /> : null}
        {error ? (
          <ErrorNote message={(error as Error).message} onRetry={() => void refetch()} />
        ) : null}
        {data && data.users.length === 0 ? <Empty message="No users match that search." /> : null}

        {(data?.users ?? []).map((u) => (
          <Card
            key={u.id}
            style={styles.item}
            onPress={() =>
              router.push({
                pathname: '/web',
                params: { path: `/portal/admin/users/${u.id}`, title: u.full_name || u.email },
              })
            }
          >
            <View style={styles.avatar}>
              <UserCircle2 size={18} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="semibold" size="base" numberOfLines={1}>
                {u.full_name || '—'}
              </T>
              <T tone="dust" size="xs" numberOfLines={1} style={{ marginTop: 1 }}>
                {u.email}
              </T>
              <View style={styles.badges}>
                {u.roles.length ? (
                  u.roles.map((r) => (
                    <Badge key={r} tone="cyan">
                      {ROLE_LABELS[r] ?? r}
                    </Badge>
                  ))
                ) : (
                  <Badge tone="dust">No role</Badge>
                )}
                {u.status !== 'active' ? <Badge tone="signal">{u.status}</Badge> : null}
              </View>
            </View>
          </Card>
        ))}
      </Screen>
    </View>
  );
}

function Count({
  label,
  value,
  tone = 'ice',
}: {
  label: string;
  value: number;
  tone?: 'ice' | 'signal' | 'dust';
}) {
  return (
    <View style={styles.count}>
      <T weight="display" size="lg" tone={tone === 'ice' ? 'ice' : tone}>
        {value}
      </T>
      <T tone="dust" size="2xs" style={{ marginTop: 1 }}>
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  countRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.border,
    borderRadius: radius['2xl'],
    backgroundColor: alpha.spaceTranslucent,
    padding: spacing.lg,
  },
  count: { minWidth: 56 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: alpha.border,
    borderRadius: radius.xl,
    backgroundColor: alpha.spaceTranslucent,
    paddingHorizontal: spacing.md,
  },
  search: {
    flex: 1,
    color: colors.ice,
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    paddingVertical: 10,
  },
  item: { flexDirection: 'row', gap: spacing.lg },
  avatar: {
    height: 38,
    width: 38,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: alpha.cyanBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});

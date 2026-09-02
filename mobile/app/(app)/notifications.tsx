import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, CheckCheck } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { Button, Card, Empty, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useMarkNotificationsRead, useNotifications } from '../../src/api/hooks';
import { alpha, colors, radius, spacing } from '../../src/theme/tokens';

function relTime(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useNotifications();
  const markRead = useMarkNotificationsRead();

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>Notifications</H2>

        {isLoading ? <Loading /> : null}
        {error ? (
          <ErrorNote message={(error as Error).message} onRetry={() => void refetch()} />
        ) : null}

        {data && data.unread > 0 ? (
          <Button
            label={`Mark all read (${data.unread})`}
            variant="ghost"
            onPress={() => markRead.mutate()}
            loading={markRead.isPending}
            icon={<CheckCheck size={14} color={colors.ice} />}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}

        {data && data.items.length === 0 ? (
          <Empty message="Nothing here yet. Assignments, results and announcements will show up on this screen." />
        ) : null}

        {(data?.items ?? []).map((n) => {
          const unread = !n.read_at;
          return (
            <Card
              key={n.id}
              style={[styles.item, unread && styles.itemUnread]}
              onPress={
                n.link
                  ? () =>
                      router.push({
                        pathname: '/web',
                        params: { path: n.link as string, title: n.title },
                      })
                  : undefined
              }
            >
              <View style={[styles.icon, unread && { borderColor: alpha.cyanBorder }]}>
                <Bell size={15} color={unread ? colors.cyan : colors.dust} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight={unread ? 'semibold' : 'medium'} size="base">
                  {n.title}
                </T>
                {n.body ? (
                  <T tone="fog" size="xs" style={{ marginTop: 3, lineHeight: 17 }}>
                    {n.body}
                  </T>
                ) : null}
                <T tone="dust" size="2xs" style={{ marginTop: spacing.sm }}>
                  {relTime(n.created_at)}
                </T>
              </View>
            </Card>
          );
        })}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  item: { flexDirection: 'row', gap: spacing.lg },
  itemUnread: { borderColor: alpha.cyanBorder, backgroundColor: alpha.cyanFaint },
  icon: {
    height: 36,
    width: 36,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: alpha.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

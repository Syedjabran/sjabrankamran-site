import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MessagesSquare, Paperclip } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { Badge, Card, Empty, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useLibrary } from '../../src/api/hooks';
import { alpha, colors, radius, spacing } from '../../src/theme/tokens';

function relTime(ms: number): string {
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

export default function LibraryScreen() {
  const router = useRouter();
  const { data: threads, isLoading, error, refetch } = useLibrary();

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>Resource Library</H2>

        {isLoading ? <Loading label="Loading discussions…" /> : null}
        {error ? (
          <ErrorNote message={(error as Error).message} onRetry={() => void refetch()} />
        ) : null}
        {threads && threads.length === 0 ? (
          <Empty message="No discussions yet. Threads started in the library will appear here." />
        ) : null}

        {(threads ?? []).map((t) => (
          <Card
            key={t.id}
            style={styles.item}
            onPress={() =>
              router.push({
                pathname: '/web',
                params: { path: `/portal/library?thread=${t.id}`, title: t.title },
              })
            }
          >
            <View style={styles.icon}>
              <MessagesSquare size={16} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="semibold" size="base" numberOfLines={2}>
                {t.title}
              </T>
              <View style={styles.meta}>
                {t.tag ? <Badge tone="cyan">{t.tag}</Badge> : null}
                {t.resources > 0 ? (
                  <View style={styles.attach}>
                    <Paperclip size={11} color={colors.dust} />
                    <T tone="dust" size="2xs">
                      {String(t.resources)}
                    </T>
                  </View>
                ) : null}
              </View>
              <T tone="dust" size="2xs" style={{ marginTop: spacing.sm }}>
                {`${t.authorName} · ${t.replies} ${t.replies === 1 ? 'reply' : 'replies'} · ${relTime(t.lastTs)}`}
              </T>
            </View>
          </Card>
        ))}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  item: { flexDirection: 'row', gap: spacing.lg },
  icon: {
    height: 38,
    width: 38,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: alpha.cyanBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});

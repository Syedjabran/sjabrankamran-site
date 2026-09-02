import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FileText, Search } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { Card, Empty, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useResources } from '../../src/api/hooks';
import type { Resource } from '../../src/api/types';
import { alpha, colors, fonts, fontSize, radius, spacing } from '../../src/theme/tokens';

const ALL = 'All';

function sizeLabel(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourcesScreen() {
  const router = useRouter();
  const { data: resources, isLoading, error, refetch } = useResources();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of resources ?? []) if (r.category) set.add(r.category);
    return [ALL, ...Array.from(set).sort()];
  }, [resources]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (resources ?? []).filter((r) => {
      if (category !== ALL && r.category !== category) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    });
  }, [resources, query, category]);

  function open(resource: Resource) {
    // href is an absolute URL — a signed storage link, or a Google Drive view
    // URL. The web screen handles both, and only attaches the portal session
    // when the target is the portal's own origin.
    const target = resource.href || resource.embedUrl || resource.url;
    if (!target) return;
    router.push({
      pathname: '/web',
      params: { path: target, title: resource.title },
    });
  }

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>Physics Resources</H2>

        <View style={styles.searchWrap}>
          <Search size={15} color={colors.dust} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search resources"
            placeholderTextColor={colors.dust}
            style={styles.search}
            autoCapitalize="none"
          />
        </View>

        {categories.length > 2 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.xl }}
          >
            {categories.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.chip, category === c && styles.chipActive]}
              >
                <T size="xs" tone={category === c ? 'cyan' : 'dust'} weight="medium">
                  {c}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {isLoading ? <Loading label="Loading resources…" /> : null}
        {error ? (
          <ErrorNote message={(error as Error).message} onRetry={() => void refetch()} />
        ) : null}

        {resources && filtered.length === 0 ? (
          <Empty
            message={
              query || category !== ALL
                ? 'No resources match your search.'
                : 'No resources have been published yet.'
            }
          />
        ) : null}

        {filtered.map((r) => (
          <Card key={r.id} onPress={() => open(r)} style={styles.item}>
            <View style={styles.itemIcon}>
              <FileText size={16} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="semibold" size="base" numberOfLines={2}>
                {r.title}
              </T>
              {r.description ? (
                <T tone="fog" size="xs" numberOfLines={2} style={{ marginTop: 3, lineHeight: 16 }}>
                  {r.description}
                </T>
              ) : null}
              <T tone="dust" size="2xs" style={{ marginTop: spacing.sm }}>
                {[r.category, r.kind, sizeLabel(r.size), r.createdByName]
                  .filter(Boolean)
                  .join(' · ')}
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
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: alpha.border,
  },
  chipActive: { borderColor: alpha.cyanBorder, backgroundColor: alpha.cyanFaint },
  item: { flexDirection: 'row', gap: spacing.lg },
  itemIcon: {
    height: 38,
    width: 38,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: alpha.cyanBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

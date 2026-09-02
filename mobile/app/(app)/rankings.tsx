import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarChart3, ExternalLink } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { StatCard } from '../../src/components/StatCard';
import { Card, Empty, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useMe, useRankings } from '../../src/api/hooks';
import { isStaff } from '../../src/nav/roles';
import { alpha, colors, radius, spacing } from '../../src/theme/tokens';

type Tab = 'students' | 'classes' | 'schools';

const TABS: Record<Tab, string> = {
  students: 'Students',
  classes: 'Classes',
  schools: 'Schools',
};

/** A slim bar showing a 0-100 metric, used in place of the web's charts. */
function Meter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.meterTrack}>
      <View style={[styles.meterFill, { width: `${pct}%` }]} />
    </View>
  );
}

export default function RankingsScreen() {
  const router = useRouter();
  const { data: me } = useMe();
  const staff = me ? isStaff(me.roles) : false;
  const { data, isLoading, error, refetch } = useRankings(staff);
  const [tab, setTab] = useState<Tab>('students');

  if (me && !staff) {
    return (
      <View style={styles.root}>
        <PortalHeader />
        <Screen>
          <Empty message="Rankings and analytics are available to staff accounts only." />
        </Screen>
      </View>
    );
  }

  const totals = data?.totals;

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>Rankings &amp; analytics</H2>

        {isLoading ? <Loading label="Computing rankings…" /> : null}
        {error ? (
          <ErrorNote message={(error as Error).message} onRetry={() => void refetch()} />
        ) : null}

        {totals ? (
          <View style={styles.grid}>
            <View style={styles.col}>
              <StatCard
                label="Avg accuracy"
                value={`${Math.round(totals.avgAccuracy)}%`}
                icon={<BarChart3 size={15} color={colors.cyan} />}
              />
            </View>
            <View style={styles.col}>
              <StatCard
                label="Avg level"
                value={totals.avgLevel.toFixed(1)}
                accent="emerald"
                icon={<BarChart3 size={15} color={colors.emerald2} />}
              />
            </View>
            <View style={styles.col}>
              <StatCard
                label="Avg attendance"
                value={`${Math.round(totals.avgAttendance)}%`}
                accent="amber"
                icon={<BarChart3 size={15} color={colors.amber300} />}
              />
            </View>
            <View style={styles.col}>
              <StatCard
                label="Active students"
                value={`${totals.activeStudents}/${totals.students}`}
                accent="magenta"
                icon={<BarChart3 size={15} color={colors.magenta} />}
              />
            </View>
          </View>
        ) : null}

        {data ? (
          <>
            <View style={styles.tabs}>
              {(Object.keys(TABS) as Tab[]).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={[styles.tab, tab === key && styles.tabActive]}
                >
                  <T size="xs" tone={tab === key ? 'cyan' : 'dust'} weight="medium">
                    {TABS[key]}
                  </T>
                </Pressable>
              ))}
            </View>

            <Card style={{ padding: 0 }}>
              {tab === 'students'
                ? data.students.slice(0, 25).map((s, i) => (
                    <View key={s.uid || s.studentId} style={styles.row}>
                      <T weight="display" size="sm" tone={i < 3 ? 'cyan' : 'dust'} style={styles.rank}>
                        {s.rankOverall}
                      </T>
                      <View style={{ flex: 1 }}>
                        <T weight="medium" size="base" numberOfLines={1}>
                          {s.name}
                        </T>
                        <T tone="dust" size="2xs" numberOfLines={1} style={{ marginTop: 1 }}>
                          {`${s.className || '—'} · ${s.school || '—'}`}
                        </T>
                        <Meter value={s.accuracy} />
                      </View>
                      <View style={styles.rightCol}>
                        <T weight="display" size="base">
                          {Math.round(s.score)}
                        </T>
                        <T tone="dust" size="2xs">
                          {`${Math.round(s.accuracy)}%`}
                        </T>
                      </View>
                    </View>
                  ))
                : null}

              {tab === 'classes'
                ? data.classes.slice(0, 25).map((c, i) => (
                    <View key={c.id} style={styles.row}>
                      <T weight="display" size="sm" tone={i < 3 ? 'cyan' : 'dust'} style={styles.rank}>
                        {c.rankOverall}
                      </T>
                      <View style={{ flex: 1 }}>
                        <T weight="medium" size="base" numberOfLines={1}>
                          {c.name}
                        </T>
                        <T tone="dust" size="2xs" numberOfLines={1} style={{ marginTop: 1 }}>
                          {`${c.school} · ${c.students} students · ${c.activeStudents} active`}
                        </T>
                        <Meter value={c.avgAccuracy} />
                      </View>
                      <View style={styles.rightCol}>
                        <T weight="display" size="base">
                          {Math.round(c.score)}
                        </T>
                        <T tone="dust" size="2xs">
                          {`${Math.round(c.avgAccuracy)}%`}
                        </T>
                      </View>
                    </View>
                  ))
                : null}

              {tab === 'schools'
                ? data.schools.map((s, i) => (
                    <View key={s.school} style={styles.row}>
                      <T weight="display" size="sm" tone={i < 3 ? 'cyan' : 'dust'} style={styles.rank}>
                        {s.rankOverall}
                      </T>
                      <View style={{ flex: 1 }}>
                        <T weight="medium" size="base" numberOfLines={1}>
                          {s.school}
                        </T>
                        <T tone="dust" size="2xs" numberOfLines={1} style={{ marginTop: 1 }}>
                          {`${s.classes} classes · ${s.students} students · ${s.activeStudents} active`}
                        </T>
                        <Meter value={s.avgAccuracy} />
                      </View>
                      <View style={styles.rightCol}>
                        <T weight="display" size="base">
                          {Math.round(s.score)}
                        </T>
                        <T tone="dust" size="2xs">
                          {`${Math.round(s.avgAccuracy)}%`}
                        </T>
                      </View>
                    </View>
                  ))
                : null}
            </Card>

            <Card
              style={styles.openFull}
              onPress={() =>
                router.push({
                  pathname: '/web',
                  params: { path: '/portal/admin/analytics', title: 'Rankings & analytics' },
                })
              }
            >
              <ExternalLink size={16} color={colors.cyan} />
              <View style={{ flex: 1 }}>
                <T weight="semibold" size="base">
                  Open the full analytics console
                </T>
                <T tone="dust" size="xs" style={{ marginTop: 2 }}>
                  Charts, filters and per-student breakdowns
                </T>
              </View>
            </Card>

            <T tone="dust" size="2xs">
              {`Generated ${new Date(data.generatedAt).toLocaleString()}${data.cached ? ' · cached' : ''}`}
            </T>
          </>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  col: { width: '50%', paddingHorizontal: spacing.xs, paddingBottom: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: alpha.border,
  },
  tabActive: { borderColor: alpha.cyanBorder, backgroundColor: alpha.cyanFaint },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: alpha.divider,
  },
  rank: { width: 26, textAlign: 'center' },
  rightCol: { alignItems: 'flex-end', minWidth: 44 },
  meterTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: alpha.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  meterFill: { height: 3, backgroundColor: colors.cyan, borderRadius: 2 },
  openFull: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, borderColor: alpha.cyanBorder },
});

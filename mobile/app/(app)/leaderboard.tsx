import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Award, Sparkles } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { Card, Empty, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useCommunity, useLeaderboard, useMe } from '../../src/api/hooks';
import type { BoardRow } from '../../src/api/types';
import { alpha, colors, fonts, fontSize, radius, spacing, tracking } from '../../src/theme/tokens';

type BoardKey = 'class' | 'school' | 'overall';

const BOARD_LABEL: Record<BoardKey, string> = {
  class: 'My class',
  school: 'My school',
  overall: 'Everyone',
};

function Row({ row, rank }: { row: BoardRow; rank: number }) {
  return (
    <View style={[styles.row, row.isMe && styles.rowMe]}>
      <T
        weight="display"
        size="sm"
        tone={rank <= 3 ? 'cyan' : 'dust'}
        style={styles.rank}
      >
        {rank}
      </T>
      <View style={{ flex: 1 }}>
        <T weight={row.isMe ? 'semibold' : 'medium'} size="base" numberOfLines={1}>
          {row.name}
        </T>
        <T tone="dust" size="2xs" style={{ marginTop: 1 }}>
          {`Level ${row.level} · ${Math.round(row.accuracy)}% accuracy · ${row.attempts} attempts`}
        </T>
      </View>
      <T weight="display" size="base" tone={row.isMe ? 'cyan' : 'ice'}>
        {Math.round(row.score)}
      </T>
    </View>
  );
}

export default function LeaderboardScreen() {
  const { data: me } = useMe();
  const isStudent = me?.roles.includes('student') ?? false;
  const board = useLeaderboard(isStudent);
  const community = useCommunity();
  const [tab, setTab] = useState<BoardKey>('class');

  const data = board.data;
  const rows: BoardRow[] =
    data && data.hasData
      ? tab === 'class'
        ? data.classBoard
        : tab === 'school'
          ? data.schoolBoard
          : data.overallBoard
      : [];

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>Leaderboard</H2>

        {!isStudent ? (
          <Empty message="The student leaderboard is only shown for student accounts. Staff can see full rankings under Rankings & analytics." />
        ) : null}

        {isStudent && board.isLoading ? <Loading label="Loading the boards…" /> : null}
        {isStudent && board.error ? (
          <ErrorNote message={(board.error as Error).message} onRetry={() => void board.refetch()} />
        ) : null}

        {data && !data.hasData ? <Empty message={data.message} /> : null}

        {data && data.hasData ? (
          <>
            <Card>
              <T tone="cyan" size="2xs" style={styles.eyebrow}>
                YOUR STANDING
              </T>
              <T weight="display" size="xl" style={{ marginTop: spacing.sm }}>
                {`#${data.me.rankInClass} of ${data.me.outOfClass}`}
              </T>
              <T tone="fog" size="sm" style={{ marginTop: 2 }}>
                {`${data.me.className}${data.me.section ? ` · ${data.me.section}` : ''} · ${data.me.school}`}
              </T>
              <View style={styles.statRow}>
                <Stat label="School" value={`#${data.me.rankInSchool}/${data.me.outOfSchool}`} />
                <Stat label="Overall" value={`#${data.me.rankOverall}/${data.me.outOfOverall}`} />
                <Stat label="Level" value={String(data.me.level)} />
                <Stat label="Accuracy" value={`${Math.round(data.me.accuracy)}%`} />
              </View>
            </Card>

            <View style={styles.tabs}>
              {(Object.keys(BOARD_LABEL) as BoardKey[]).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={[styles.tab, tab === key && styles.tabActive]}
                >
                  <T size="xs" tone={tab === key ? 'cyan' : 'dust'} weight="medium">
                    {BOARD_LABEL[key]}
                  </T>
                </Pressable>
              ))}
            </View>

            <Card style={{ padding: 0 }}>
              {rows.length === 0 ? (
                <View style={{ padding: spacing.xl }}>
                  <T tone="dust" size="sm">
                    Nothing on this board yet.
                  </T>
                </View>
              ) : (
                rows.map((r, i) => <Row key={`${r.name}-${i}`} row={r} rank={i + 1} />)
              )}
            </Card>

            <T tone="dust" size="2xs" style={{ lineHeight: 15 }}>
              Everyone competes under a private call-sign by default. Turn on “Show my real name”
              in Profile if you want to be identified.
            </T>
          </>
        ) : null}

        <H2>Contribution board</H2>
        {community.isLoading ? <Loading label="Loading contributions…" /> : null}
        {community.error ? (
          <ErrorNote
            message={(community.error as Error).message}
            onRetry={() => void community.refetch()}
          />
        ) : null}
        {community.data ? (
          <>
            <Card style={styles.contribMe}>
              <Sparkles size={16} color={colors.cyan} />
              <View style={{ flex: 1 }}>
                <T weight="semibold" size="base">
                  {`${community.data.me.total} points all-time`}
                </T>
                <T tone="dust" size="xs" style={{ marginTop: 2 }}>
                  {`${community.data.me.monthPoints} this month (${community.data.month})`}
                </T>
              </View>
            </Card>

            <Card style={{ padding: 0 }}>
              {community.data.monthlyTop5.length === 0 ? (
                <View style={{ padding: spacing.xl }}>
                  <T tone="dust" size="sm">
                    No contributions logged this month yet.
                  </T>
                </View>
              ) : (
                community.data.monthlyTop5.map((c) => (
                  <View key={c.uid} style={[styles.row, c.isMe && styles.rowMe]}>
                    <T weight="display" size="sm" tone={c.rank <= 3 ? 'cyan' : 'dust'} style={styles.rank}>
                      {c.rank}
                    </T>
                    <T weight={c.isMe ? 'semibold' : 'medium'} size="base" style={{ flex: 1 }} numberOfLines={1}>
                      {c.name}
                    </T>
                    <T weight="display" size="base" tone={c.isMe ? 'cyan' : 'ice'}>
                      {c.monthPoints}
                    </T>
                  </View>
                ))
              )}
            </Card>

            <Card>
              <View style={styles.guideHead}>
                <Award size={15} color={colors.cyan} />
                <T weight="semibold" size="base">
                  How to earn points
                </T>
              </View>
              {community.data.guide.map((g) => (
                <View key={g.kind} style={styles.guideRow}>
                  <T tone="fog" size="sm" style={{ flex: 1 }}>
                    {g.label}
                  </T>
                  <T tone="cyan" size="sm" weight="semibold">
                    {`+${g.pts}`}
                  </T>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <T tone="dust" size="2xs" style={styles.eyebrow}>
        {label.toUpperCase()}
      </T>
      <T weight="display" size="base" style={{ marginTop: 3 }}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  eyebrow: { fontFamily: fonts.mono, letterSpacing: tracking.widelabel, fontSize: fontSize['2xs'] },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: alpha.divider,
  },
  stat: { minWidth: 68 },
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: alpha.divider,
  },
  rowMe: { backgroundColor: alpha.cyanFaint },
  rank: { width: 24, textAlign: 'center' },
  contribMe: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 6,
  },
});

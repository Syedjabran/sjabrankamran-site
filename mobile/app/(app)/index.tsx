import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  Building2,
  ClipboardList,
  FlaskConical,
  GraduationCap,
  School,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { StatCard } from '../../src/components/StatCard';
import { Card, Empty, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useAdminUsers, useMe, useRankings, useTasks } from '../../src/api/hooks';
import { isStaff } from '../../src/nav/roles';
import { alpha, colors, radius, spacing } from '../../src/theme/tokens';

export default function DashboardScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading, error: meError, refetch: refetchMe } = useMe();
  const staff = me ? isStaff(me.roles) : false;
  const student = me?.roles.includes('student') ?? false;

  const rankings = useRankings(staff);
  const users = useAdminUsers('', staff);
  const tasks = useTasks();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  }, [qc]);

  if (meLoading) {
    return (
      <View style={styles.root}>
        <PortalHeader />
        <Loading label="Loading your portal…" />
      </View>
    );
  }

  if (meError) {
    return (
      <View style={styles.root}>
        <PortalHeader />
        <Screen>
          <ErrorNote message={(meError as Error).message} onRetry={() => void refetchMe()} />
        </Screen>
      </View>
    );
  }

  const totals = rankings.data?.totals;
  const counts = users.data?.counts;
  const openTasks = tasks.data?.filter((t) => t.status !== 'done').length ?? 0;

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.cyan}
            colors={[colors.cyan]}
          />
        }
      >
        <H2>Dashboard</H2>

        {staff ? (
          <>
            {rankings.isLoading || users.isLoading ? (
              <Card>
                <T tone="dust" size="sm">
                  Loading network figures…
                </T>
              </Card>
            ) : null}

            <View style={styles.grid}>
              <View style={styles.col}>
                <StatCard
                  label="Students"
                  value={counts?.students ?? totals?.students}
                  icon={<GraduationCap size={15} color={colors.cyan} />}
                  onPress={() => router.push('/users')}
                />
              </View>
              <View style={styles.col}>
                <StatCard
                  label="Schools"
                  value={totals?.schools}
                  accent="emerald"
                  icon={<Building2 size={15} color={colors.emerald2} />}
                />
              </View>
              <View style={styles.col}>
                <StatCard
                  label="Classes"
                  value={totals?.classes}
                  accent="magenta"
                  icon={<School size={15} color={colors.magenta} />}
                />
              </View>
              <View style={styles.col}>
                <StatCard
                  label="Active students"
                  value={totals?.activeStudents}
                  accent="amber"
                  icon={<Activity size={15} color={colors.amber300} />}
                />
              </View>
              <View style={styles.col}>
                <StatCard
                  label="Total attempts"
                  value={totals?.totalAttempts}
                  icon={<ClipboardList size={15} color={colors.cyan} />}
                />
              </View>
              <View style={styles.col}>
                <StatCard
                  label="Avg accuracy"
                  value={totals ? `${Math.round(totals.avgAccuracy)}%` : null}
                  accent="emerald"
                  icon={<Target size={15} color={colors.emerald2} />}
                  onPress={() => router.push('/rankings')}
                />
              </View>
              <View style={styles.col}>
                <StatCard
                  label="Avg attendance"
                  value={totals ? `${Math.round(totals.avgAttendance)}%` : null}
                  accent="amber"
                  icon={<TrendingUp size={15} color={colors.amber300} />}
                />
              </View>
              <View style={styles.col}>
                <StatCard
                  label="All users"
                  value={counts?.total}
                  accent="magenta"
                  icon={<Users size={15} color={colors.magenta} />}
                  onPress={() => router.push('/users')}
                />
              </View>
            </View>

            {rankings.error ? (
              <ErrorNote
                message={(rankings.error as Error).message}
                onRetry={() => void rankings.refetch()}
              />
            ) : null}
          </>
        ) : null}

        {student ? (
          <>
            <H2>My learning</H2>
            <View style={styles.grid}>
              <View style={styles.col}>
                <StatCard
                  label="Open tasks"
                  value={tasks.isLoading ? null : openTasks}
                  icon={<ClipboardList size={15} color={colors.cyan} />}
                  onPress={() => router.push('/learn')}
                />
              </View>
              <View style={styles.col}>
                <StatCard
                  label="Leaderboard"
                  value="View"
                  accent="amber"
                  icon={<Trophy size={15} color={colors.amber300} />}
                  onPress={() => router.push('/leaderboard')}
                />
              </View>
            </View>
          </>
        ) : null}

        <H2>Quick links</H2>
        <QuickLink
          label="Exam Lab"
          hint="Practice drills, assignments and proctored tests"
          icon={<FlaskConical size={16} color={colors.cyan} />}
          onPress={() =>
            router.push({
              pathname: '/web',
              params: { path: '/portal/exam-lab', title: 'Exam Lab' },
            })
          }
        />
        <QuickLink
          label="Physics Resources"
          hint="Notes, papers and imported material"
          icon={<BookOpen size={16} color={colors.cyan} />}
          onPress={() => router.push('/resources')}
        />
        {student ? (
          <QuickLink
            label="My Progress"
            hint="Accuracy, levels and attendance over time"
            icon={<TrendingUp size={16} color={colors.cyan} />}
            onPress={() =>
              router.push({
                pathname: '/web',
                params: { path: '/portal/progress', title: 'My Progress' },
              })
            }
          />
        ) : null}
        {!staff && !student ? (
          <Empty message="Your account has no role assigned yet. Please contact your teacher." />
        ) : null}
      </Screen>
    </View>
  );
}

function QuickLink({
  label,
  hint,
  icon,
  onPress,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={styles.quick}>
      <View style={styles.quickIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <T weight="semibold" size="base">
          {label}
        </T>
        <T tone="dust" size="xs" style={{ marginTop: 2 }}>
          {hint}
        </T>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  col: { width: '50%', paddingHorizontal: spacing.xs, paddingBottom: spacing.md },
  quick: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  quickIcon: {
    height: 38,
    width: 38,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: alpha.cyanBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

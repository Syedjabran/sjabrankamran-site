import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  ClipboardList,
  GraduationCap,
  School,
  Target,
  TrendingUp,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { StatCard } from '../../src/components/StatCard';
import { NavigationStatus, PlaceGroup, SubjectCard } from '../../src/components/NavPlaces';
import { Button, Card, Empty, ErrorNote, H2, Screen, T } from '../../src/components/ui';
import { Skeleton, SkeletonList, SkeletonStatRow } from '../../src/components/Skeleton';
import { qk, useAdminUsers, useMe, usePortalNavigation, useRankings, useTasks } from '../../src/api/hooks';
import { allPlaces, type AppNavigation } from '../../src/nav/nav';
import { useOpenPlace } from '../../src/nav/open';
import { PORTAL_NAME } from '../../src/config';
import { colors, spacing } from '../../src/theme/tokens';

const has = (nav: AppNavigation | undefined, id: string) => !!nav && allPlaces(nav).some((p) => p.id === id);

/**
 * Home: the portal's subject picker. The subjects the user has (each opens
 * its own space of modules), then Administration and General -- all from
 * the portal's navigation -- with the app's glance tiles for staff and
 * students.
 */
export default function HomeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const openPlace = useOpenPlace();
  const { data: me, isLoading: meLoading, error: meError, refetch: refetchMe } = useMe();
  const navQuery = usePortalNavigation();
  const nav = navQuery.data;
  const onboardingRoute = nav?.onboardingRoute ?? null;

  // While the profile is still to be completed, re-ask the portal each time
  // Home comes back into view (from the onboarding page, or another tab):
  // the card goes as soon as the portal says the profile is done.
  useFocusEffect(
    useCallback(() => {
      if (onboardingRoute) void qc.invalidateQueries({ queryKey: qk.navigation });
    }, [onboardingRoute, qc])
  );
  // The card shows only on an answer given since Home was last opened: while
  // that re-check runs, placeholders stand in for it.
  const checkingOnboarding = !!onboardingRoute && navQuery.isFetching;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  }, [qc]);

  const openPortal = () => router.push({ pathname: '/web', params: { path: '/portal', title: PORTAL_NAME } });

  if (meLoading) {
    return (
      <View style={styles.root}>
        <PortalHeader />
        <Screen>
          <Skeleton width="45%" height={20} />
          <SkeletonStatRow count={2} />
          <Skeleton width="35%" height={17} style={{ marginTop: spacing.sm }} />
          <SkeletonStatRow count={2} />
        </Screen>
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

  const student = me?.roles.includes('student') ?? false;
  // The desk roles' Home is their desk (the portal sends them there).
  const desk = nav?.deskHome ? allPlaces(nav).find((p) => p.route === nav.homeRoute) : undefined;

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
        <H2>{nav?.portalName || PORTAL_NAME}</H2>

        <NavigationStatus
          loading={navQuery.isLoading}
          error={navQuery.error}
          onRetry={() => void navQuery.refetch()}
          onOpenPortal={openPortal}
        />

        {checkingOnboarding ? (
          <SkeletonList count={1} lines={1} showEyebrow={false} />
        ) : onboardingRoute ? (
          <Card>
            <View style={styles.titleRow}>
              <UserCog size={16} color={colors.cyan} />
              <T weight="semibold" size="base">
                Complete your profile
              </T>
            </View>
            <T tone="fog" size="sm" style={{ marginTop: spacing.sm }}>
              Add your details and a parent or guardian contact to start using the portal.
            </T>
            <Button
              label="Complete your profile"
              onPress={() =>
                router.push({
                  pathname: '/web',
                  params: { path: onboardingRoute, title: 'Complete your profile' },
                })
              }
              style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}
            />
          </Card>
        ) : nav ? (
          <>
            {desk ? <PlaceGroup title="Your desk" places={[desk]} onOpen={openPlace} /> : null}

            {nav.subjects.length ? (
              <View style={styles.stack}>
                {nav.subjects.map((subject) => (
                  <SubjectCard key={subject.id} subject={subject} onOpen={openPlace} />
                ))}
              </View>
            ) : student ? (
              <Empty
                message={
                  nav.subjectsUnavailable
                    ? 'Your subjects couldn’t be loaded just now. Pull down to try again.'
                    : 'No subject has been added to your account yet. Ask your teacher or the admin.'
                }
              />
            ) : null}

            {student && (has(nav, 'learning') || has(nav, 'leaderboard')) ? <LearningTiles nav={nav} /> : null}
            {has(nav, 'analytics') ? <StaffOverview /> : null}

            <PlaceGroup
              title="Administration"
              places={nav.admin.filter((p) => p.id !== desk?.id)}
              onOpen={openPlace}
            />
            <PlaceGroup title="General" places={nav.general} onOpen={openPlace} />
          </>
        ) : null}

        {me && me.roles.length === 0 ? (
          <Empty message="Your account has no role assigned yet. Please contact your teacher." />
        ) : null}
      </Screen>
    </View>
  );
}

/** A student's glance: open tasks and the leaderboard, when theirs. */
function LearningTiles({ nav }: { nav: AppNavigation }) {
  const router = useRouter();
  const tasks = useTasks();
  const openTasks = tasks.data?.filter((t) => t.status !== 'done').length ?? 0;
  return (
    <>
      <H2>My learning</H2>
      <View style={styles.grid}>
        {has(nav, 'learning') ? (
          <View style={styles.col}>
            <StatCard
              label="Open tasks"
              value={openTasks}
              loading={tasks.isLoading}
              icon={<ClipboardList size={15} color={colors.cyan} />}
              onPress={() => router.push('/learn')}
            />
          </View>
        ) : null}
        {has(nav, 'leaderboard') ? (
          <View style={styles.col}>
            <StatCard
              label="Leaderboard"
              value="View"
              accent="amber"
              icon={<Trophy size={15} color={colors.amber300} />}
              onPress={() => router.push('/leaderboard')}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

/** Staff with the analytics console: the network at a glance. */
function StaffOverview() {
  const router = useRouter();
  const rankings = useRankings(true);
  const users = useAdminUsers('', true);
  const rankingsLoading = rankings.isLoading;
  const usersLoading = users.isLoading;
  const totals = rankings.data?.totals;
  const counts = users.data?.counts;
  return (
    <>
      <H2>Overview</H2>
      <View style={styles.grid}>
        <View style={styles.col}>
          <StatCard
            label="Students"
            value={counts?.students ?? totals?.students}
            loading={usersLoading || rankingsLoading}
            icon={<GraduationCap size={15} color={colors.cyan} />}
            onPress={() => router.push('/users')}
          />
        </View>
        <View style={styles.col}>
          <StatCard
            label="Schools"
            value={totals?.schools}
            loading={rankingsLoading}
            accent="emerald"
            icon={<Building2 size={15} color={colors.emerald2} />}
          />
        </View>
        <View style={styles.col}>
          <StatCard
            label="Classes"
            value={totals?.classes}
            loading={rankingsLoading}
            accent="magenta"
            icon={<School size={15} color={colors.magenta} />}
          />
        </View>
        <View style={styles.col}>
          <StatCard
            label="Active students"
            value={totals?.activeStudents}
            loading={rankingsLoading}
            accent="amber"
            icon={<Activity size={15} color={colors.amber300} />}
          />
        </View>
        <View style={styles.col}>
          <StatCard
            label="Total attempts"
            value={totals?.totalAttempts}
            loading={rankingsLoading}
            icon={<ClipboardList size={15} color={colors.cyan} />}
          />
        </View>
        <View style={styles.col}>
          <StatCard
            label="Avg accuracy"
            value={totals ? `${Math.round(totals.avgAccuracy)}%` : null}
            loading={rankingsLoading}
            accent="emerald"
            icon={<Target size={15} color={colors.emerald2} />}
            onPress={() => router.push('/rankings')}
          />
        </View>
        <View style={styles.col}>
          <StatCard
            label="Avg attendance"
            value={totals ? `${Math.round(totals.avgAttendance)}%` : null}
            loading={rankingsLoading}
            accent="amber"
            icon={<TrendingUp size={15} color={colors.amber300} />}
          />
        </View>
        <View style={styles.col}>
          <StatCard
            label="All users"
            value={counts?.total}
            loading={usersLoading}
            accent="magenta"
            icon={<Users size={15} color={colors.magenta} />}
            onPress={() => router.push('/users')}
          />
        </View>
      </View>
      {rankings.error ? (
        <ErrorNote message={(rankings.error as Error).message} onRetry={() => void rankings.refetch()} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  stack: { gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  col: { width: '50%', paddingHorizontal: spacing.xs, paddingBottom: spacing.md },
});

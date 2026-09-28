import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { NavigationStatus, PlaceGroup } from '../../../src/components/NavPlaces';
import { PortalIcon } from '../../../src/components/PortalIcon';
import { Button, Empty, Screen, T } from '../../../src/components/ui';
import { usePortalNavigation } from '../../../src/api/hooks';
import { subjectById } from '../../../src/nav/nav';
import { useOpenPlace } from '../../../src/nav/open';
import { PORTAL_NAME } from '../../../src/config';
import { accentFor, alpha, colors, radius, spacing } from '../../../src/theme/tokens';

/**
 * A subject's own space: every module of that subject the user may see, as
 * the portal's subject space lists them (Practical Lab inside Physics). The
 * same screen serves every subject, today's and any the portal adds later;
 * a module without a native screen opens its portal page in the app.
 */
export default function SubjectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openPlace = useOpenPlace();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navQuery = usePortalNavigation();
  const subject = navQuery.data ? subjectById(navQuery.data, id) : null;
  const accent = accentFor(subject?.accent);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={10}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={16} color={colors.fog} />
        </Pressable>
        {subject ? (
          <View style={[styles.subjectIcon, { borderColor: accent.border }]}>
            <PortalIcon name={subject.icon} size={15} color={accent.color} />
          </View>
        ) : null}
        <T weight="display" size="base" numberOfLines={1} style={{ flex: 1 }}>
          {subject?.name ?? 'Subject'}
        </T>
      </View>

      <Screen>
        <NavigationStatus
          loading={navQuery.isLoading}
          error={navQuery.error}
          onRetry={() => void navQuery.refetch()}
          onOpenPortal={() => router.push({ pathname: '/web', params: { path: '/portal', title: PORTAL_NAME } })}
        />
        {subject ? (
          <PlaceGroup places={subject.modules} onOpen={openPlace} />
        ) : navQuery.data ? (
          <>
            <Empty message="This subject isn’t on your account. Your home page lists the subjects you have." />
            <Button label="Back to your subjects" variant="ghost" onPress={() => router.replace('/')} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: alpha.divider,
  },
  iconBtn: {
    height: 32,
    width: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: alpha.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectIcon: {
    height: 32,
    width: 32,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

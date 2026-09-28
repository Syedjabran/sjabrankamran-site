import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PortalHeader } from '../../src/components/PortalHeader';
import { NavigationStatus, PlaceGroup } from '../../src/components/NavPlaces';
import { Button, H2, Screen, T } from '../../src/components/ui';
import { usePortalNavigation } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/context';
import { useOpenPlace } from '../../src/nav/open';
import { PORTAL_NAME } from '../../src/config';
import { colors } from '../../src/theme/tokens';

/**
 * Every page the user has, as the portal groups them: each subject's
 * modules, then General and Administration, then the account. All from the
 * portal's navigation, so it lists exactly what the portal shows this user.
 */
export default function MoreScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const openPlace = useOpenPlace();
  const navQuery = usePortalNavigation();
  const nav = navQuery.data;
  const openPortal = () => router.push({ pathname: '/web', params: { path: '/portal', title: PORTAL_NAME } });

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>All pages</H2>

        <NavigationStatus
          loading={navQuery.isLoading}
          error={navQuery.error}
          onRetry={() => void navQuery.refetch()}
          onOpenPortal={openPortal}
        />

        {nav?.subjects.map((subject) => (
          <PlaceGroup key={subject.id} title={subject.name} places={subject.modules} onOpen={openPlace} />
        ))}
        {nav ? <PlaceGroup title="General" places={nav.general} onOpen={openPlace} /> : null}
        {nav ? <PlaceGroup title="Administration" places={nav.admin} onOpen={openPlace} /> : null}
        {nav?.profile ? <PlaceGroup title="Account" places={[nav.profile]} onOpen={openPlace} /> : null}

        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />

        <T tone="dust" size="2xs" style={{ textAlign: 'center' }}>
          Pages marked with a globe open the portal page inside the app.
        </T>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
});

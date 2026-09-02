import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Globe } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { Button, Card, H2, Loading, Screen, T } from '../../src/components/ui';
import { useMe } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/context';
import { navFor, type NavItem } from '../../src/nav/nav';
import { alpha, colors, radius, spacing, tracking } from '../../src/theme/tokens';

export default function MoreScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: me, isLoading } = useMe();

  const sections = me ? navFor(me.roles) : [];

  function go(item: NavItem) {
    if (item.target.kind === 'native') {
      router.push(item.target.route as never);
    } else {
      router.push({
        pathname: '/web',
        params: { path: item.target.path, title: item.label },
      });
    }
  }

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>All sections</H2>

        {isLoading ? <Loading /> : null}

        {sections.map((section, i) => (
          <View key={i} style={{ gap: spacing.sm }}>
            {section.title ? (
              <T tone="dust" size="2xs" style={styles.sectionTitle}>
                {section.title.toUpperCase()}
              </T>
            ) : null}
            <Card style={{ padding: 0 }}>
              {section.items.map((item, j) => (
                <Card
                  key={`${item.label}-${j}`}
                  onPress={() => go(item)}
                  style={[
                    styles.row,
                    j === section.items.length - 1 && styles.rowLast,
                  ]}
                >
                  <T size="base" weight="medium" style={{ flex: 1 }}>
                    {item.label}
                  </T>
                  {item.target.kind === 'web' ? (
                    <Globe size={13} color={colors.dust} />
                  ) : null}
                  <ChevronRight size={16} color={colors.dust} />
                </Card>
              ))}
            </Card>
          </View>
        ))}

        <View style={{ gap: spacing.sm }}>
          <T tone="dust" size="2xs" style={styles.sectionTitle}>
            ACCOUNT
          </T>
          <Card style={{ padding: 0 }}>
            <Card onPress={() => router.push('/settings')} style={styles.row}>
              <T size="base" weight="medium" style={{ flex: 1 }}>
                Profile &amp; settings
              </T>
              <ChevronRight size={16} color={colors.dust} />
            </Card>
            <Card onPress={() => router.push('/notifications')} style={[styles.row, styles.rowLast]}>
              <T size="base" weight="medium" style={{ flex: 1 }}>
                Notifications
              </T>
              <ChevronRight size={16} color={colors.dust} />
            </Card>
          </Card>
        </View>

        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />

        <T tone="dust" size="2xs" style={{ textAlign: 'center' }}>
          Sections marked with a globe open the live portal page inside the app.
        </T>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  sectionTitle: { letterSpacing: tracking.widelabel, marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: alpha.divider,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  rowLast: { borderBottomWidth: 0 },
});

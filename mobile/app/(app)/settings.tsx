import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { Badge, Button, Card, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useMe, useUpdateMe } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/context';
import { requestPasswordReset } from '../../src/auth/session';
import { ROLE_LABELS } from '../../src/nav/roles';
import { alpha, colors, fonts, fontSize, radius, spacing } from '../../src/theme/tokens';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { data: me, isLoading, error, refetch } = useMe();
  const update = useUpdateMe();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetNote, setResetNote] = useState<string | null>(null);

  // Seed the form once the profile arrives.
  useEffect(() => {
    if (!me) return;
    setFullName(me.full_name);
    setPhone(me.phone);
    setReveal(me.reveal_name);
  }, [me]);

  const dirty =
    !!me && (fullName !== me.full_name || phone !== me.phone || reveal !== me.reveal_name);

  async function save() {
    setSaved(false);
    await update.mutateAsync({ full_name: fullName, phone, reveal_name: reveal });
    setSaved(true);
  }

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>Profile &amp; settings</H2>

        {isLoading ? <Loading /> : null}
        {error ? (
          <ErrorNote message={(error as Error).message} onRetry={() => void refetch()} />
        ) : null}

        {me ? (
          <>
            <Card>
              <T tone="fog" size="xs" weight="medium" style={styles.label}>
                Full name
              </T>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor={colors.dust}
                style={styles.input}
              />

              <T tone="fog" size="xs" weight="medium" style={[styles.label, { marginTop: spacing.lg }]}>
                Phone
              </T>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Optional"
                placeholderTextColor={colors.dust}
                keyboardType="phone-pad"
                style={styles.input}
              />

              <T tone="fog" size="xs" weight="medium" style={[styles.label, { marginTop: spacing.lg }]}>
                Email
              </T>
              <T tone="dust" size="sm">
                {me.email}
              </T>

              {update.error ? (
                <T tone="signal" size="xs" style={{ marginTop: spacing.md }}>
                  {(update.error as Error).message}
                </T>
              ) : null}
              {saved && !dirty ? (
                <T tone="emerald" size="xs" style={{ marginTop: spacing.md }}>
                  Saved.
                </T>
              ) : null}

              <Button
                label="Save changes"
                onPress={() => void save()}
                disabled={!dirty}
                loading={update.isPending}
                style={{ marginTop: spacing.xl }}
              />
            </Card>

            <Card>
              <T weight="semibold" size="base">
                Leaderboard identity
              </T>
              <T tone="fog" size="xs" style={{ marginTop: 4, lineHeight: 17 }}>
                You compete under a private call-sign by default. Turn this on to show your real
                name on the boards instead.
              </T>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <T size="sm" weight="medium">
                    Show my real name
                  </T>
                  <T tone="dust" size="2xs" style={{ marginTop: 2 }}>
                    Your code: {me.alias}
                  </T>
                </View>
                <Switch
                  value={reveal}
                  onValueChange={setReveal}
                  trackColor={{ false: alpha.border, true: colors.cyanDeep }}
                  thumbColor={reveal ? colors.cyan : colors.dust}
                />
              </View>
            </Card>

            <Card>
              <T weight="semibold" size="base">
                Roles
              </T>
              <View style={styles.badges}>
                {me.roles.length ? (
                  me.roles.map((r) => (
                    <Badge key={r} tone="cyan">
                      {ROLE_LABELS[r] ?? r}
                    </Badge>
                  ))
                ) : (
                  <Badge tone="dust">Awaiting role assignment</Badge>
                )}
              </View>
            </Card>

            <Card>
              <View style={styles.pwHead}>
                <KeyRound size={15} color={colors.cyan} />
                <T weight="semibold" size="base">
                  Password
                </T>
              </View>
              <T tone="fog" size="xs" style={{ marginTop: 4, lineHeight: 17 }}>
                We&apos;ll email you a secure link to set a new password.
              </T>
              {resetNote ? (
                <T tone="cyan" size="xs" style={{ marginTop: spacing.md, lineHeight: 17 }}>
                  {resetNote}
                </T>
              ) : null}
              <Button
                label="Email me a reset link"
                variant="ghost"
                onPress={async () => setResetNote(await requestPasswordReset(me.email))}
                style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}
              />
            </Card>

            <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
          </>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  label: { marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: alpha.border,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(10,16,36,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ice,
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: alpha.divider,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  pwHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

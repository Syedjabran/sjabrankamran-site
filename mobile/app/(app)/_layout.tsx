import React from 'react';
import { Tabs } from 'expo-router';
import {
  BarChart3,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Trophy,
  Users,
} from 'lucide-react-native';
import { useMe } from '../../src/api/hooks';
import { primaryTabsFor } from '../../src/nav/nav';
import { alpha, colors, fonts, fontSize } from '../../src/theme/tokens';

/** Only the routes named here can ever appear on the tab bar. */
const TAB_ROUTE_BY_LABEL: Record<string, string> = {
  Dashboard: 'index',
  Learning: 'learn',
  Leaderboard: 'leaderboard',
  Resources: 'resources',
  Users: 'users',
  Rankings: 'rankings',
  Library: 'library',
};

export default function AppLayout() {
  const { data: me } = useMe();
  const roles = me?.roles ?? [];
  // Until /me resolves, show only the Dashboard and More tabs so the bar does
  // not visibly reshuffle once roles arrive.
  const visible = new Set(
    me ? primaryTabsFor(roles).map((t) => TAB_ROUTE_BY_LABEL[t.label]) : ['index']
  );

  const tab = (route: string) => ({ href: visible.has(route) ? undefined : (null as null) });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.dust,
        tabBarStyle: {
          backgroundColor: colors.space,
          borderTopColor: alpha.divider,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: fontSize['2xs'] },
        sceneStyle: { backgroundColor: colors.abyss },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size - 3} color={color} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learning',
          tabBarIcon: ({ color, size }) => <GraduationCap size={size - 3} color={color} />,
          ...tab('learn'),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color, size }) => <Trophy size={size - 3} color={color} />,
          ...tab('leaderboard'),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Users',
          tabBarIcon: ({ color, size }) => <Users size={size - 3} color={color} />,
          ...tab('users'),
        }}
      />
      <Tabs.Screen
        name="rankings"
        options={{
          title: 'Rankings',
          tabBarIcon: ({ color, size }) => <BarChart3 size={size - 3} color={color} />,
          ...tab('rankings'),
        }}
      />
      <Tabs.Screen
        name="resources"
        options={{
          title: 'Resources',
          tabBarIcon: ({ color, size }) => <FolderOpen size={size - 3} color={color} />,
          ...tab('resources'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Menu size={size - 3} color={color} />,
        }}
      />

      {/* Reachable from More / the header, never shown as a tab. */}
      <Tabs.Screen name="library" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="web" options={{ href: null }} />
    </Tabs>
  );
}

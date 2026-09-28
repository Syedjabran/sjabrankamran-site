import React from 'react';
import { Tabs } from 'expo-router';
import {
  BarChart3,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  Menu,
  Trophy,
  Users,
} from 'lucide-react-native';
import { useAccessStatus, usePortalNavigation } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/context';
import { AccessBlocked } from '../../src/components/AccessBlocked';
import { primaryTabs, type TabScreen } from '../../src/nav/nav';
import { alpha, colors, fonts, fontSize } from '../../src/theme/tokens';

export default function AppLayout() {
  const { data: nav } = usePortalNavigation();
  const { data: access } = useAccessStatus();
  const { signOut } = useAuth();

  // An active access lock replaces the entire app, exactly as the website
  // replaces the whole portal layout (the portal's APIs refuse a locked
  // account too; this shows the lock's own message instead of errors).
  if (access?.restricted && access.restriction) {
    return (
      <AccessBlocked
        restriction={access.restriction}
        onSignOut={() => {
          void signOut();
        }}
      />
    );
  }

  // Home and More always; up to three native screens between them, only
  // when the portal's navigation holds them for this user. Until it has
  // loaded, only Home and More, so the bar doesn't reshuffle visibly.
  const shown = new Set<TabScreen>(primaryTabs(nav));
  const tab = (screen: TabScreen) => ({ href: shown.has(screen) ? undefined : (null as null) });

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
          title: 'Home',
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
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => <Library size={size - 3} color={color} />,
          ...tab('library'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Menu size={size - 3} color={color} />,
        }}
      />

      {/* Reachable from Home, More and the header, never shown as a tab. */}
      <Tabs.Screen name="subject/[id]" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="web" options={{ href: null }} />
    </Tabs>
  );
}

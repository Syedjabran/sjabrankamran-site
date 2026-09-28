import React from 'react';
import * as Icons from 'lucide-react-native/icons';
import type { LucideIcon } from 'lucide-react-native';

/**
 * Every lucide icon, by its export name ("FlaskConical"): the portal names a
 * subject's or module's icon (subjects.ts IconName) and the app draws it, so
 * an icon the portal starts using later needs no app release. The `icons`
 * entry point holds icon components only.
 */
const LIBRARY = Icons as unknown as Readonly<Record<string, LucideIcon | undefined>>;
const FALLBACK: LucideIcon = Icons.LayoutGrid;

export function PortalIcon({ name, size = 16, color }: { name: string; size?: number; color: string }) {
  const Icon = (Object.prototype.hasOwnProperty.call(LIBRARY, name) ? LIBRARY[name] : undefined) ?? FALLBACK;
  return <Icon size={size} color={color} />;
}

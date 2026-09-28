import {
  Atom, Bell, BookOpen, BrainCircuit, Building2, CalendarCheck, CalendarClock, CalendarDays, ChartColumn, ClipboardCheck,
  ClipboardList, Download, FlaskConical, FlaskRound, Gauge, GraduationCap, LayoutDashboard, Library, ListChecks, LockKeyhole,
  Mail, Megaphone, MessagesSquare, NotebookPen, Presentation, Receipt, School, Search, Settings, ShieldCheck,
  SlidersHorizontal, Sparkles, Timer, TrendingUp, Trophy, UserCog, Users, type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/portal/subjects";

/** The registry's icon names (subjects.ts keeps names, not components, so it
 *  stays free of React) mapped to their lucide-react components. A Record, so
 *  a name added to IconName without an icon here fails the type check. */
const ICONS: Record<IconName, LucideIcon> = {
  Atom, Bell, BookOpen, BrainCircuit, Building2, CalendarCheck, CalendarClock, CalendarDays, ChartColumn, ClipboardCheck,
  ClipboardList, Download, FlaskConical, FlaskRound, Gauge, GraduationCap, LayoutDashboard, Library, ListChecks, LockKeyhole,
  Mail, Megaphone, MessagesSquare, NotebookPen, Presentation, Receipt, School, Search, Settings, ShieldCheck,
  SlidersHorizontal, Sparkles, Timer, TrendingUp, Trophy, UserCog, Users,
};

/** A registry icon (a subject's or a portal page's). Decorative: the label
 *  next to it names the place. */
export function PortalIcon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const Icon = ICONS[name];
  return <Icon size={size} className={className} aria-hidden="true" />;
}

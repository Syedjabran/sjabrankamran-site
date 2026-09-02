/**
 * Response types for the portal's JSON API. These mirror the shapes the live
 * endpoints actually return (verified against production), not assumptions.
 */
import type { EduRole } from '../nav/roles';

export type Me = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  roles: EduRole[];
  /** Anonymous leaderboard call-sign, e.g. "Copper Falcon 714F". */
  alias: string;
  /** True when the user opted to show their real name on the leaderboard. */
  reveal_name: boolean;
};

export type TaskStatus = 'assigned' | 'in_progress' | 'done';

export type PersonalTask = {
  id: string;
  title: string;
  details: string;
  kind: 'task' | 'challenge';
  dueAt: string | null;
  points: number | null;
  resourceUrl: string | null;
  status: TaskStatus;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type LibraryThread = {
  id: string;
  title: string;
  tag: string;
  authorId: string;
  authorName: string;
  ts: number;
  lastTs: number;
  replies: number;
  resources: number;
};

export type Resource = {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: string;
  source: string;
  path: string;
  url: string | null;
  mime: string;
  size: number;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  /** Absolute URL: a signed storage link, or an external/Drive URL. */
  href: string | null;
  embedUrl: string | null;
};

export type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
  roles: EduRole[];
};

export type UserCounts = {
  total: number;
  students: number;
  staff: number;
  suspended: number;
  noRole: number;
};

export type RankingTotals = {
  schools: number;
  classes: number;
  students: number;
  activeStudents: number;
  totalAttempts: number;
  avgAccuracy: number;
  avgAttendance: number;
  avgLevel: number;
};

export type RankedStudent = {
  studentId: string;
  uid: string;
  name: string;
  email: string;
  school: string;
  className: string;
  section: string;
  accuracy: number;
  attempts: number;
  papersSat: number;
  level: number;
  attendance: number;
  lastActive: number;
  hasData: boolean;
  score: number;
  rankOverall: number;
  rankInClass: number;
  rankInSchool: number;
  outOfOverall: number;
  outOfClass: number;
  outOfSchool: number;
};

export type RankedSchool = {
  school: string;
  classes: number;
  students: number;
  activeStudents: number;
  avgAccuracy: number;
  avgLevel: number;
  avgAttendance: number;
  totalAttempts: number;
  score: number;
  rankOverall: number;
  outOf: number;
};

export type RankedClass = {
  id: string;
  name: string;
  school: string;
  section: string;
  year: string;
  students: number;
  activeStudents: number;
  avgAccuracy: number;
  avgLevel: number;
  avgAttendance: number;
  totalAttempts: number;
  score: number;
  rankOverall: number;
  rankInSchool: number;
};

export type Rankings = {
  generatedAt: string;
  totals: RankingTotals;
  schools: RankedSchool[];
  classes: RankedClass[];
  students: RankedStudent[];
  topStudents: RankedStudent[];
  topClasses: RankedClass[];
  topSchools: RankedSchool[];
  cached: boolean;
};

export type ClassRow = {
  id: string;
  name: string;
  school: string;
  section: string;
  year: string;
  students: number;
  active: boolean;
};

/** One row on a student leaderboard; anonymised unless the peer opted in. */
export type BoardRow = {
  name: string;
  isMe: boolean;
  anon: boolean;
  score: number;
  accuracy: number;
  level: number;
  attempts: number;
  rankInClass: number;
  rankInSchool: number;
  rankOverall: number;
  hasData: boolean;
};

export type Leaderboard =
  | { hasData: false; message: string }
  | {
      hasData: true;
      me: {
        name: string;
        school: string;
        className: string;
        section: string;
        score: number;
        accuracy: number;
        level: number;
        attempts: number;
        rankInClass: number;
        outOfClass: number;
        rankInSchool: number;
        outOfSchool: number;
        rankOverall: number;
        outOfOverall: number;
      };
      classBoard: BoardRow[];
      schoolBoard: BoardRow[];
      overallBoard: BoardRow[];
    };

export type ContributionRow = {
  uid: string;
  name: string;
  total: number;
  monthPoints: number;
  rank: number;
  isMe: boolean;
};

export type Community = {
  month: string;
  allTime: ContributionRow[];
  monthly: ContributionRow[];
  monthlyTop5: ContributionRow[];
  me: { total: number; monthPoints: number; breakdown: Record<string, number> };
  guide: { kind: string; label: string; pts: number }[];
};

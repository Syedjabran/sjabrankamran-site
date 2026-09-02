import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type {
  AdminUser,
  ClassRow,
  Community,
  Leaderboard,
  LibraryThread,
  Me,
  Notification,
  PersonalTask,
  Rankings,
  Resource,
  TaskStatus,
  UserCounts,
} from './types';

export const qk = {
  me: ['me'] as const,
  tasks: ['tasks'] as const,
  notifications: ['notifications'] as const,
  library: ['library'] as const,
  resources: ['resources'] as const,
  leaderboard: ['leaderboard'] as const,
  community: ['community'] as const,
  users: (q: string) => ['users', q] as const,
  rankings: ['rankings'] as const,
  classes: ['classes'] as const,
};

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => apiFetch<Me>('/api/portal/me') });
}

export function useTasks() {
  return useQuery({
    queryKey: qk.tasks,
    queryFn: async () => (await apiFetch<{ tasks: PersonalTask[] }>('/api/portal/tasks')).tasks,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () =>
      apiFetch<{ items: Notification[]; unread: number }>('/api/portal/notifications'),
  });
}

export function useLibrary() {
  return useQuery({
    queryKey: qk.library,
    queryFn: async () =>
      (await apiFetch<{ threads: LibraryThread[] }>('/api/portal/library')).threads,
  });
}

export function useResources() {
  return useQuery({
    queryKey: qk.resources,
    queryFn: async () =>
      (await apiFetch<{ resources: Resource[] }>('/api/portal/resources')).resources,
  });
}

export function useLeaderboard(enabled: boolean) {
  return useQuery({
    queryKey: qk.leaderboard,
    queryFn: () => apiFetch<Leaderboard>('/api/portal/leaderboard'),
    enabled,
  });
}

export function useCommunity() {
  return useQuery({
    queryKey: qk.community,
    queryFn: () => apiFetch<Community>('/api/portal/community'),
  });
}

export function useAdminUsers(search: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.users(search),
    queryFn: () =>
      apiFetch<{ users: AdminUser[]; counts: UserCounts }>(
        `/api/portal/admin/users?limit=50${search ? `&q=${encodeURIComponent(search)}` : ''}`
      ),
    enabled,
  });
}

export function useRankings(enabled: boolean) {
  return useQuery({
    queryKey: qk.rankings,
    queryFn: () => apiFetch<Rankings>('/api/portal/admin/rankings'),
    enabled,
    // The server caches this; it is expensive to recompute.
    staleTime: 5 * 60 * 1000,
  });
}

export function useClasses(enabled: boolean) {
  return useQuery({
    queryKey: qk.classes,
    queryFn: () =>
      apiFetch<{ classes: ClassRow[]; schools: string[] }>('/api/portal/admin/classes'),
    enabled,
  });
}

/** Advance a personal task's status (assigned -> in_progress -> done). */
export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { task_id: string; status: TaskStatus }) =>
      apiFetch<{ ok: true }>('/api/portal/tasks', {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tasks });
    },
  });
}

/** Update own profile name / phone / leaderboard identity preference. */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { full_name?: string; phone?: string; reveal_name?: boolean }) =>
      apiFetch<{ ok: true }>('/api/portal/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

/** Mark notifications read. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>('/api/portal/notifications', {
        method: 'POST',
        body: JSON.stringify({ op: 'read_all' }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.notifications });
    },
  });
}

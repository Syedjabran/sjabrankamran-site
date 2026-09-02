import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, Circle, CircleDot, ExternalLink, Trophy } from 'lucide-react-native';
import { PortalHeader } from '../../src/components/PortalHeader';
import { Badge, Card, Empty, ErrorNote, H2, Loading, Screen, T } from '../../src/components/ui';
import { useSetTaskStatus, useTasks } from '../../src/api/hooks';
import type { PersonalTask, TaskStatus } from '../../src/api/types';
import { alpha, colors, radius, spacing } from '../../src/theme/tokens';

/** Next status in the assigned -> in_progress -> done cycle. */
function nextStatus(current: TaskStatus): TaskStatus {
  if (current === 'assigned') return 'in_progress';
  if (current === 'in_progress') return 'done';
  return 'assigned';
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'done') return <CheckCircle2 size={18} color={colors.emerald2} />;
  if (status === 'in_progress') return <CircleDot size={18} color={colors.amber300} />;
  return <Circle size={18} color={colors.dust} />;
}

function dueLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Overdue by ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

function TaskRow({ task }: { task: PersonalTask }) {
  const setStatus = useSetTaskStatus();
  const due = dueLabel(task.dueAt);
  const overdue = due?.startsWith('Overdue') ?? false;

  return (
    <Card>
      <View style={styles.taskTop}>
        <Pressable
          onPress={() => setStatus.mutate({ task_id: task.id, status: nextStatus(task.status) })}
          disabled={setStatus.isPending}
          hitSlop={8}
          style={{ paddingTop: 1 }}
          accessibilityLabel={`Mark task ${task.title} as ${nextStatus(task.status)}`}
        >
          <StatusIcon status={task.status} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <T
            weight="semibold"
            size="base"
            style={task.status === 'done' ? styles.done : undefined}
          >
            {task.title}
          </T>
          {task.details ? (
            <T tone="fog" size="sm" style={{ marginTop: 4, lineHeight: 19 }}>
              {task.details}
            </T>
          ) : null}

          <View style={styles.meta}>
            {task.kind === 'challenge' ? <Badge tone="cyan">Challenge</Badge> : null}
            {task.points ? <Badge tone="emerald">{`${task.points} pts`}</Badge> : null}
            {due ? <Badge tone={overdue ? 'signal' : 'dust'}>{due}</Badge> : null}
          </View>

          {task.resourceUrl ? (
            <Pressable
              onPress={() => void Linking.openURL(task.resourceUrl as string)}
              style={styles.resourceLink}
            >
              <ExternalLink size={13} color={colors.cyan} />
              <T tone="cyan" size="xs">
                Open resource
              </T>
            </Pressable>
          ) : null}

          <T tone="dust" size="2xs" style={{ marginTop: spacing.md }}>
            Set by {task.createdByName}
          </T>
        </View>
      </View>
    </Card>
  );
}

export default function LearnScreen() {
  const router = useRouter();
  const { data: tasks, isLoading, error, refetch } = useTasks();

  const open = tasks?.filter((t) => t.status !== 'done') ?? [];
  const done = tasks?.filter((t) => t.status === 'done') ?? [];

  return (
    <View style={styles.root}>
      <PortalHeader />
      <Screen>
        <H2>My Learning</H2>

        {isLoading ? <Loading label="Loading your tasks…" /> : null}
        {error ? (
          <ErrorNote message={(error as Error).message} onRetry={() => void refetch()} />
        ) : null}

        {tasks && tasks.length === 0 ? (
          <Empty message="No tasks assigned to you right now. New work from your teacher will appear here." />
        ) : null}

        {open.length ? (
          <>
            <T tone="dust" size="xs" style={styles.groupLabel}>
              {`OPEN · ${open.length}`}
            </T>
            {open.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </>
        ) : null}

        {done.length ? (
          <>
            <T tone="dust" size="xs" style={styles.groupLabel}>
              {`COMPLETED · ${done.length}`}
            </T>
            {done.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </>
        ) : null}

        <Card
          onPress={() =>
            router.push({
              pathname: '/web',
              params: { path: '/portal/learn', title: 'My Learning' },
            })
          }
          style={styles.more}
        >
          <Trophy size={16} color={colors.cyan} />
          <View style={{ flex: 1 }}>
            <T weight="semibold" size="base">
              Assignments &amp; tests
            </T>
            <T tone="dust" size="xs" style={{ marginTop: 2 }}>
              Open the full learning page
            </T>
          </View>
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  taskTop: { flexDirection: 'row', gap: spacing.md },
  done: { textDecorationLine: 'line-through', color: colors.dust },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  resourceLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  groupLabel: { textTransform: 'uppercase', letterSpacing: 1.5, marginTop: spacing.sm },
  more: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, borderColor: alpha.cyanBorder },
});

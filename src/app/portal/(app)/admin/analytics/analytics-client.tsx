"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Trophy,
  Medal,
  School,
  Users,
  GraduationCap,
  Activity,
  BarChart3,
  TrendingUp,
  RefreshCw,
  Filter,
  Crown,
  Target,
  Percent,
  Layers,
  Award,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Data shapes (mirror of GET /api/portal/admin/rankings response)
 * ------------------------------------------------------------------ */

type RankedStudent = {
  studentId: string;
  uid: string;
  name: string;
  email: string;
  school: string;
  className: string;
  section: string | null;
  accuracy: number | null;
  attempts: number;
  papersSat: number;
  level: number;
  attendance: number | null;
  lastActive: number | null;
  hasData: boolean;
  score: number;
  rankOverall: number;
  rankInClass: number;
  rankInSchool: number;
  outOfOverall: number;
  outOfClass: number;
  outOfSchool: number;
};

type RankedClass = {
  id: string;
  name: string;
  school: string;
  section: string | null;
  year: string;
  students: number;
  activeStudents: number;
  avgAccuracy: number | null;
  avgLevel: number;
  avgAttendance: number | null;
  totalAttempts: number;
  score: number;
  rankOverall: number;
  rankInSchool: number;
  outOfOverall: number;
  outOfSchool: number;
};

type RankedSchool = {
  school: string;
  classes: number;
  students: number;
  activeStudents: number;
  avgAccuracy: number | null;
  avgLevel: number;
  avgAttendance: number | null;
  totalAttempts: number;
  score: number;
  rankOverall: number;
  outOf: number;
};

type RankingsData = {
  generatedAt: string;
  totals: {
    schools: number;
    classes: number;
    students: number;
    activeStudents: number;
    totalAttempts: number;
    avgAccuracy: number | null;
    avgAttendance: number | null;
    avgLevel: number;
  };
  schools: RankedSchool[];
  classes: RankedClass[];
  students: RankedStudent[];
  levelDistribution: { level: number; count: number }[];
  topStudents: RankedStudent[];
  topClasses: RankedClass[];
  topSchools: RankedSchool[];
};

type ApiResponse = RankingsData & { cached?: boolean };

/* ------------------------------------------------------------------ *
 * Filter model
 * ------------------------------------------------------------------ */

type Scope = "schools" | "classes" | "students";
type Metric = "score" | "accuracy" | "level" | "attendance" | "attempts";

const SCOPE_LABEL: Record<Scope, string> = {
  schools: "Schools",
  classes: "Classes",
  students: "Students",
};
const METRIC_LABEL: Record<Metric, string> = {
  score: "Score",
  accuracy: "Accuracy",
  level: "Level",
  attendance: "Attendance",
  attempts: "Attempts",
};

/** A normalized leaderboard row so table + chart share one code path. */
type Row = {
  key: string;
  name: string;
  school: string;
  sub: string;
  standing: string;
  noActivity: boolean;
  score: number;
  accuracy: number | null;
  level: number;
  attendance: number | null;
  attempts: number;
};

const CHART_TOP = 12;
const VISIBLE_ROWS = 40;
const MEDALS = ["🥇", "🥈", "🥉"];

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

function metricValue(row: Row, metric: Metric): number | null {
  switch (metric) {
    case "score":
      return row.score;
    case "accuracy":
      return row.accuracy;
    case "level":
      return row.level;
    case "attendance":
      return row.attendance;
    case "attempts":
      return row.attempts;
  }
}

function fmtLevel(v: number | null): string {
  if (v == null) return "—";
  return `${Number.isInteger(v) ? v : v.toFixed(1)}/10`;
}

function fmtMetric(v: number | null, metric: Metric): string {
  if (v == null) return "—";
  switch (metric) {
    case "score":
      return String(Math.round(v));
    case "accuracy":
    case "attendance":
      return `${Math.round(v)}%`;
    case "level":
      return fmtLevel(v);
    case "attempts":
      return v.toLocaleString();
  }
}

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

function fmtInt(v: number): string {
  return v.toLocaleString();
}

/** Tailwind text-colour for a metric's numbers. */
function metricAccent(metric: Metric): string {
  switch (metric) {
    case "score":
      return "text-cyan";
    case "accuracy":
      return "text-emerald2";
    case "level":
      return "text-amber-300";
    case "attendance":
      return "text-magenta";
    case "attempts":
      return "text-ice";
  }
}

/** Base fill (hex) for chart bars per metric. */
function metricHex(metric: Metric): string {
  switch (metric) {
    case "score":
      return "#3DE1F0";
    case "accuracy":
      return "#12D48C";
    case "level":
      return "#FCD34D";
    case "attendance":
      return "#F03Dce";
    case "attempts":
      return "#7CEDF7";
  }
}

/** Medal fill for top-3 chart bars, else the metric's base colour. */
function barFill(idx: number, metric: Metric): string {
  if (idx === 0) return "#FCD34D"; // gold
  if (idx === 1) return "#C7D0E8"; // silver
  if (idx === 2) return "#C6A55A"; // bronze
  return metricHex(metric);
}

/** Colour ramp for the level histogram (low → high). */
function levelColor(level: number): string {
  const t = (Math.max(1, Math.min(10, level)) - 1) / 9; // 0..1
  const lerp = (a: number, b: number, u: number) => Math.round(a + (b - a) * u);
  const low: [number, number, number] = [255, 122, 47]; // signal orange
  const mid: [number, number, number] = [61, 225, 240]; // cyan
  const high: [number, number, number] = [18, 212, 140]; // emerald
  let r: number;
  let g: number;
  let b: number;
  if (t < 0.5) {
    const u = t / 0.5;
    r = lerp(low[0], mid[0], u);
    g = lerp(low[1], mid[1], u);
    b = lerp(low[2], mid[2], u);
  } else {
    const u = (t - 0.5) / 0.5;
    r = lerp(mid[0], high[0], u);
    g = lerp(mid[1], high[1], u);
    b = lerp(mid[2], high[2], u);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

function relTime(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/* ------------------------------------------------------------------ *
 * Row builders
 * ------------------------------------------------------------------ */

function schoolRows(data: RankingsData): Row[] {
  return data.schools.map((s) => ({
    key: s.school,
    name: s.school,
    school: s.school,
    sub: `${fmtInt(s.classes)} classes · ${fmtInt(s.students)} students`,
    standing: `${fmtInt(s.activeStudents)} active`,
    noActivity: false,
    score: s.score,
    accuracy: s.avgAccuracy,
    level: s.avgLevel,
    attendance: s.avgAttendance,
    attempts: s.totalAttempts,
  }));
}

function classRows(data: RankingsData): Row[] {
  return data.classes.map((c) => ({
    key: c.id,
    name: c.name,
    school: c.school,
    sub: `${c.school}${c.section ? ` · ${c.section}` : ""} · ${fmtInt(c.students)} students`,
    standing: `#${c.rankInSchool} in school`,
    noActivity: false,
    score: c.score,
    accuracy: c.avgAccuracy,
    level: c.avgLevel,
    attendance: c.avgAttendance,
    attempts: c.totalAttempts,
  }));
}

function studentRows(data: RankingsData): Row[] {
  return data.students.map((s) => ({
    key: s.studentId,
    name: s.name,
    school: s.school,
    sub: `${s.className} · ${s.school}`,
    standing: s.hasData
      ? `#${s.rankInClass} in class · #${s.rankInSchool} in school`
      : "no activity yet",
    noActivity: !s.hasData,
    score: s.score,
    accuracy: s.accuracy,
    level: s.level,
    attendance: s.attendance,
    attempts: s.attempts,
  }));
}

/* ------------------------------------------------------------------ *
 * Small presentational pieces
 * ------------------------------------------------------------------ */

function Segmented<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  ariaLabel: string;
}): ReactNode {
  const { value, onChange, options, ariaLabel } = props;
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-abyss/40 p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-cyan/15 text-cyan"
                : "text-dust hover:text-fog"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Kpi(props: {
  icon: ReactNode;
  label: string;
  value: string;
  accent: string;
}): ReactNode {
  const { icon, label, value, accent } = props;
  return (
    <div className="rounded-2xl border border-white/10 bg-space/60 p-4">
      <div className="flex items-start gap-2 text-dust">
        <span className={"mt-px shrink-0 " + accent}>{icon}</span>
        <span className="min-w-0 break-words text-[10px] font-medium uppercase leading-tight tracking-wider">{label}</span>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-ice">{value}</p>
    </div>
  );
}

function Highlight(props: {
  ring: string;
  chipBg: string;
  chipText: string;
  badge: ReactNode;
  kicker: string;
  title: string;
  subtitle: string;
  score: string;
  stats: { label: string; value: string }[];
}): ReactNode {
  const { ring, chipBg, chipText, badge, kicker, title, subtitle, score, stats } =
    props;
  return (
    <div className={`rounded-2xl border ${ring} bg-void p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${chipBg} ${chipText}`}
          >
            {badge}
          </span>
          <div className="min-w-0">
            <p className={`font-mono text-[10px] uppercase tracking-widest ${chipText}`}>
              {kicker}
            </p>
            <p className="mt-0.5 truncate text-base font-semibold text-ice" title={title}>
              {title || "—"}
            </p>
            <p className="truncate text-xs text-dust" title={subtitle}>
              {subtitle}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-2xl font-semibold text-ice">{score}</p>
          <p className="text-[10px] uppercase tracking-widest text-dust">score</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {stats.map((st) => (
          <div
            key={st.label}
            className="rounded-xl border border-white/10 bg-space/60 px-2.5 py-2 text-center"
          >
            <p className="font-mono text-sm font-semibold text-fog">{st.value}</p>
            <p className="text-[9px] uppercase tracking-widest text-dust">
              {st.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCard(props: {
  icon: ReactNode;
  title: string;
  caption?: string;
  children: ReactNode;
}): ReactNode {
  const { icon, title, caption, children } = props;
  return (
    <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="text-cyan">{icon}</span>
        <h2 className="font-display text-lg font-semibold text-ice">{title}</h2>
        {caption ? (
          <span className="ml-auto text-xs text-dust">{caption}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Charts (hand-rolled SVG — no external libraries)
 * ------------------------------------------------------------------ */

function BarChart(props: { rows: Row[]; metric: Metric }): ReactNode {
  const { rows, metric } = props;
  const data = rows.slice(0, CHART_TOP);
  if (data.length === 0) {
    return <EmptyNote label="No entries to chart yet." />;
  }

  const W = 1000;
  const rowH = 34;
  const barH = 16;
  const top = 8;
  const barStart = 250;
  const valueReserve = 130;
  const maxBarW = W - barStart - valueReserve;
  const H = data.length * rowH + top * 2;

  const values = data.map((r) => metricValue(r, metric) ?? 0);
  const max = Math.max(1, ...values);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Bar chart of the top ${data.length} by ${METRIC_LABEL[metric]}`}
      preserveAspectRatio="xMinYMin meet"
    >
      {data.map((r, i) => {
        const raw = metricValue(r, metric);
        const v = raw ?? 0;
        const w = Math.max(2, (v / max) * maxBarW);
        const cy = top + i * rowH + rowH / 2;
        const label = `${i < 3 ? MEDALS[i] : `#${i + 1}`}  ${truncate(r.name, 26)}`;
        return (
          <g key={r.key}>
            <text
              x={0}
              y={cy}
              dominantBaseline="middle"
              fill="#AEB8D8"
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
            >
              {label}
            </text>
            <rect
              x={barStart}
              y={cy - barH / 2}
              width={maxBarW}
              height={barH}
              rx={8}
              fill="rgba(255,255,255,0.05)"
            />
            <rect
              x={barStart}
              y={cy - barH / 2}
              width={w}
              height={barH}
              rx={8}
              fill={barFill(i, metric)}
              fillOpacity={i < 3 ? 1 : 0.75}
            />
            <text
              x={barStart + w + 10}
              y={cy}
              dominantBaseline="middle"
              fill="#EEF2FF"
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}
            >
              {fmtMetric(raw, metric)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LevelHistogram(props: {
  dist: { level: number; count: number }[];
}): ReactNode {
  const { dist } = props;
  const counts: number[] = [];
  for (let lvl = 1; lvl <= 10; lvl += 1) {
    const hit = dist.find((d) => d.level === lvl);
    counts.push(hit ? hit.count : 0);
  }
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) {
    return <EmptyNote label="No level data recorded yet." />;
  }

  const W = 1000;
  const H = 240;
  const padTop = 30;
  const padBottom = 30;
  const padX = 16;
  const plotH = H - padTop - padBottom;
  const slot = (W - padX * 2) / 10;
  const barW = slot * 0.56;
  const max = Math.max(1, ...counts);
  const baseY = padTop + plotH;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Distribution of students across levels 1 to 10"
      preserveAspectRatio="xMidYMid meet"
    >
      <line
        x1={padX}
        y1={baseY}
        x2={W - padX}
        y2={baseY}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />
      {counts.map((c, i) => {
        const lvl = i + 1;
        const h = (c / max) * plotH;
        const x = padX + slot * i + (slot - barW) / 2;
        const y = baseY - h;
        return (
          <g key={lvl}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(c > 0 ? 2 : 0, h)}
              rx={6}
              fill={levelColor(lvl)}
              fillOpacity={0.9}
            />
            <text
              x={x + barW / 2}
              y={y - 7}
              textAnchor="middle"
              fill="#EEF2FF"
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}
            >
              {c}
            </text>
            <text
              x={x + barW / 2}
              y={baseY + 18}
              textAnchor="middle"
              fill="#6B77A0"
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}
            >
              {lvl}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EmptyNote(props: { label: string }): ReactNode {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-white/10 bg-abyss/40 py-10 text-center text-sm text-dust">
      {props.label}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Loading skeleton
 * ------------------------------------------------------------------ */

function Skeleton(): ReactNode {
  return (
    <div className="space-y-6">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-white/5" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/5"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
      <div className="h-72 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Main component
 * ------------------------------------------------------------------ */

export function AnalyticsClient() {
  const [data, setData] = useState<RankingsData | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>("");
  const [forbidden, setForbidden] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const [scope, setScope] = useState<Scope>("students");
  const [metric, setMetric] = useState<Metric>("score");
  const [schoolFilter, setSchoolFilter] = useState<string>("");

  const load = useCallback(async (fresh: boolean) => {
    if (fresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const res = await fetch(
        `/api/portal/admin/rankings${fresh ? "?fresh=1" : ""}`,
        { cache: "no-store" },
      );
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setCached(Boolean(json.cached));
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Keep the "updated … ago" label fresh without re-fetching.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Reset the school filter if it no longer exists in fresh data.
  useEffect(() => {
    if (!data) return;
    if (schoolFilter && !data.schools.some((s) => s.school === schoolFilter)) {
      setSchoolFilter("");
    }
  }, [data, schoolFilter]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const base =
      scope === "schools"
        ? schoolRows(data)
        : scope === "classes"
        ? classRows(data)
        : studentRows(data);
    const filtered = schoolFilter
      ? base.filter((r) => r.school === schoolFilter)
      : base;
    return [...filtered].sort((a, b) => {
      const av = metricValue(a, metric);
      const bv = metricValue(b, metric);
      const an = av == null ? Number.NEGATIVE_INFINITY : av;
      const bn = bv == null ? Number.NEGATIVE_INFINITY : bv;
      if (bn !== an) return bn - an;
      return b.score - a.score || a.name.localeCompare(b.name);
    });
  }, [data, scope, metric, schoolFilter]);

  /* ---------------- guard states ---------------- */

  if (loading && !data) return <Skeleton />;

  if (forbidden) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-500/30 bg-void p-8 text-center">
        <ShieldAlert className="mx-auto text-amber-300" size={32} />
        <h2 className="mt-3 font-display text-xl font-semibold text-ice">
          Staff access only
        </h2>
        <p className="mt-2 text-sm text-fog">
          Rankings &amp; analytics are available to admins and staff. If you
          believe you should have access, contact a super-admin.
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-void p-8 text-center">
        <AlertTriangle className="mx-auto text-magenta" size={32} />
        <h2 className="mt-3 font-display text-xl font-semibold text-ice">
          Couldn&apos;t load analytics
        </h2>
        <p className="mt-2 text-sm text-fog">{error}</p>
        <button
          onClick={() => void load(false)}
          className="btn-ghost mt-5 !px-4 !py-2 text-sm"
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  if (!data) return <Skeleton />;

  const t = data.totals;
  const topSchool = data.topSchools[0] ?? data.schools[0] ?? null;
  const topClass = data.topClasses[0] ?? data.classes[0] ?? null;
  const topStudent = data.topStudents[0] ?? data.students[0] ?? null;

  const updated = relTime(data.generatedAt, now);
  const metricAccentClass = metricAccent(metric);
  const chartCaption = `Top ${Math.min(CHART_TOP, rows.length)} ${SCOPE_LABEL[
    scope
  ].toLowerCase()} by ${METRIC_LABEL[metric].toLowerCase()}${
    schoolFilter ? ` · ${schoolFilter}` : ""
  }`;

  return (
    <div className="space-y-6">
      {/* ---------------- Header ---------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan/30 bg-cyan/10 text-cyan">
            <Trophy size={20} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ice">
              Rankings &amp; Analytics
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-xs text-dust">
              <span>
                Leaderboards across schools, classes &amp; students
              </span>
              {updated ? (
                <span className="text-dust/80">· updated {updated}</span>
              ) : null}
              {cached ? (
                <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dust">
                  cached
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          title="Re-fetch the latest rankings"
          aria-label="Refresh rankings"
          className="btn-ghost !px-4 !py-2 text-sm disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : undefined}
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* ---------------- KPI strip ---------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi
          icon={<School size={15} />}
          label="Schools"
          value={fmtInt(t.schools)}
          accent="text-cyan"
        />
        <Kpi
          icon={<Layers size={15} />}
          label="Classes"
          value={fmtInt(t.classes)}
          accent="text-cyan"
        />
        <Kpi
          icon={<Users size={15} />}
          label="Students"
          value={fmtInt(t.students)}
          accent="text-emerald2"
        />
        <Kpi
          icon={<Activity size={15} />}
          label="Active"
          value={fmtInt(t.activeStudents)}
          accent="text-emerald2"
        />
        <Kpi
          icon={<Target size={15} />}
          label="Avg accuracy"
          value={fmtPct(t.avgAccuracy)}
          accent="text-emerald2"
        />
        <Kpi
          icon={<GraduationCap size={15} />}
          label="Avg level"
          value={fmtLevel(t.avgLevel)}
          accent="text-amber-300"
        />
        <Kpi
          icon={<Percent size={15} />}
          label="Avg attendance"
          value={fmtPct(t.avgAttendance)}
          accent="text-magenta"
        />
        <Kpi
          icon={<BarChart3 size={15} />}
          label="Attempts"
          value={fmtInt(t.totalAttempts)}
          accent="text-ice"
        />
      </div>

      {/* ---------------- Best performers ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Highlight
          ring="border-amber-300/25"
          chipBg="bg-amber-300/10"
          chipText="text-amber-300"
          badge={<Crown size={18} />}
          kicker="Top School"
          title={topSchool ? topSchool.school : ""}
          subtitle={
            topSchool
              ? `${fmtInt(topSchool.classes)} classes · ${fmtInt(
                  topSchool.students,
                )} students`
              : "No schools yet"
          }
          score={topSchool ? String(topSchool.score) : "—"}
          stats={[
            { label: "accuracy", value: fmtPct(topSchool?.avgAccuracy ?? null) },
            { label: "level", value: fmtLevel(topSchool?.avgLevel ?? null) },
            {
              label: "attendance",
              value: fmtPct(topSchool?.avgAttendance ?? null),
            },
          ]}
        />
        <Highlight
          ring="border-cyan/25"
          chipBg="bg-cyan/10"
          chipText="text-cyan"
          badge={<Trophy size={18} />}
          kicker="Top Class"
          title={topClass ? topClass.name : ""}
          subtitle={
            topClass
              ? `${topClass.school}${
                  topClass.section ? ` · ${topClass.section}` : ""
                }`
              : "No classes yet"
          }
          score={topClass ? String(topClass.score) : "—"}
          stats={[
            { label: "accuracy", value: fmtPct(topClass?.avgAccuracy ?? null) },
            { label: "level", value: fmtLevel(topClass?.avgLevel ?? null) },
            { label: "students", value: topClass ? fmtInt(topClass.students) : "—" },
          ]}
        />
        <Highlight
          ring="border-emerald2/25"
          chipBg="bg-emerald2/10"
          chipText="text-emerald2"
          badge={<Medal size={18} />}
          kicker="Top Student"
          title={topStudent ? topStudent.name : ""}
          subtitle={
            topStudent
              ? `${topStudent.className} · ${topStudent.school}`
              : "No students yet"
          }
          score={topStudent ? String(topStudent.score) : "—"}
          stats={[
            { label: "accuracy", value: fmtPct(topStudent?.accuracy ?? null) },
            { label: "level", value: fmtLevel(topStudent?.level ?? null) },
            {
              label: "attendance",
              value: fmtPct(topStudent?.attendance ?? null),
            },
          ]}
        />
      </div>

      {/* ---------------- Filters ---------------- */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-abyss/40 p-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-dust">
          <Filter size={14} /> Filters
        </span>
        <Segmented<Scope>
          ariaLabel="Choose scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: "schools", label: "Schools", icon: <School size={13} /> },
            { value: "classes", label: "Classes", icon: <Layers size={13} /> },
            { value: "students", label: "Students", icon: <Users size={13} /> },
          ]}
        />
        <Segmented<Metric>
          ariaLabel="Choose metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "score", label: "Score" },
            { value: "accuracy", label: "Accuracy" },
            { value: "level", label: "Level" },
            { value: "attendance", label: "Attendance" },
            { value: "attempts", label: "Attempts" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="school-filter" className="sr-only">
            Filter by school
          </label>
          <select
            id="school-filter"
            aria-label="Filter by school"
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
            className="rounded-full border border-white/10 bg-space/60 px-3 py-1.5 text-xs text-fog outline-none focus:border-cyan/40"
          >
            <option value="">All schools</option>
            {data.schools.map((s) => (
              <option key={s.school} value={s.school}>
                {s.school}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ---------------- Leaderboard table ---------------- */}
      <SectionCard
        icon={<Award size={18} />}
        title={`${SCOPE_LABEL[scope]} leaderboard`}
        caption={
          rows.length > VISIBLE_ROWS
            ? `showing top ${VISIBLE_ROWS} of ${fmtInt(rows.length)}`
            : `${fmtInt(rows.length)} ${
                rows.length === 1 ? "entry" : "entries"
              }`
        }
      >
        {rows.length === 0 ? (
          <EmptyNote label="Nothing matches these filters yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-dust">
                  <th className="w-16 px-3 py-2 font-medium">Rank</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Standing</th>
                  <th className="px-3 py-2 text-right font-medium">Level</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {METRIC_LABEL[metric]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, VISIBLE_ROWS).map((r, i) => (
                  <tr
                    key={r.key}
                    className={`border-t border-white/5 ${
                      r.noActivity ? "opacity-50" : ""
                    } hover:bg-white/[0.02]`}
                  >
                    <td className="px-3 py-2.5">
                      {i < 3 ? (
                        <span
                          className="font-mono text-base"
                          style={
                            i === 2 ? { color: "#C6A55A" } : undefined
                          }
                        >
                          {MEDALS[i]}
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-dust">
                          #{i + 1}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ice">{r.name}</p>
                      <p className="text-xs text-dust">{r.sub}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-xs ${
                          r.noActivity ? "italic text-dust" : "text-fog"
                        }`}
                      >
                        {r.standing}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-fog">
                      {fmtLevel(r.level)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono font-semibold ${metricAccentClass}`}
                    >
                      {fmtMetric(metricValue(r, metric), metric)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ---------------- Bar chart ---------------- */}
      <SectionCard
        icon={<BarChart3 size={18} />}
        title={`${SCOPE_LABEL[scope]} by ${METRIC_LABEL[metric]}`}
        caption={chartCaption}
      >
        <BarChart rows={rows} metric={metric} />
      </SectionCard>

      {/* ---------------- Level histogram ---------------- */}
      <SectionCard
        icon={<TrendingUp size={18} />}
        title="Level distribution"
        caption="levels 1 → 10 (low → high)"
      >
        <LevelHistogram dist={data.levelDistribution} />
      </SectionCard>
    </div>
  );
}

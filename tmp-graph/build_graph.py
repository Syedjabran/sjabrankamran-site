#!/usr/bin/env python3
"""Build a self-contained, unskewed interactive project-history graph.

Time axis = equal ordinal band per active dev day (NOT wall-clock).
Gaps between active days rendered as fixed narrow "no-commit" spacers.
"""
import re, html, json, datetime, collections, os

BASE = os.path.dirname(os.path.abspath(__file__))
COMMITS = os.path.join(BASE, "commits.txt")

def count_lines(p):
    with open(p, encoding="utf-8") as f:
        return sum(1 for ln in f if ln.strip())

routes_n  = count_lines(os.path.join(BASE, "routes.txt"))
apis_n    = count_lines(os.path.join(BASE, "api-routes.txt"))
libs_n    = count_lines(os.path.join(BASE, "libs.txt"))

# ---- Workstream taxonomy (ordered: first match wins) --------------------
# id, label, colour, ordered list of (regex) rules applied to subject.
TRACKS = [
    ("exam",     "Exam Lab",                       "#F0883D"),
    ("study",    "Study plans & tasks",            "#7CE38B"),
    ("coord",    "Coordinator / roles & authz",    "#E24DB7"),
    ("alerts",   "Alerts / Calendar / Push",       "#C77DFF"),
    ("timetable","Timetable",                      "#4DD0E1"),
    ("attend",   "Attendance",                     "#FFD166"),
    ("mail",     "Mail / Google integration",      "#5AC8FA"),
    ("onboard",  "Onboarding / guardian gate",     "#FF8FA3"),
    ("qa",       "QA / demo",                      "#9AA7B4"),
    ("portal",   "Education Portal core",          "#3DE1F0"),
    ("brand",    "Branding / Physics content",     "#B9A2FF"),
    ("site",     "Website foundation & redesign",  "#6EE7F0"),
    ("fix",      "Fixes / deploys",                "#8892A0"),
]
TRACK_INDEX = {t[0]: i for i, t in enumerate(TRACKS)}

def classify(subj):
    s = subj.lower()
    # ordered specific -> general
    if re.search(r'exam-lab|exam lab|maxwell|proctor|past.?paper|mcq|9702|test generator|sealed|per-question|integrity mode|drill', s):
        # study-plan drills that are portal-task oriented still count as exam if exam-lab prefix
        if 'study-plan' in s and 'exam-lab' not in s:
            return 'study'
        return 'exam'
    if re.search(r'study plan|study-plan|automated study|individual tasks|per-user performance|tasks/|assigned tasks|challenges', s):
        return 'study'
    if re.search(r'coordinator|facilitator|registrar|role|authoriz|authoris|class scope|class staff|command.?center|view as|preview interface|rankings & analytics|owner control|role confusion', s):
        return 'coord'
    if re.search(r'notification|announcement|alert|push|web push|performance index|ranking notif|my-ranking|leaderboard code|bell', s):
        return 'alerts'
    if re.search(r'timetable|schedule', s):
        return 'timetable'
    if re.search(r'attendance|leave|exemption|exempt|voice attendance', s):
        return 'attend'
    if re.search(r'\bmail\b|gmail|email|google|drive|classroom|relay|apps script|progress-email|progress report|calendar|\.ics', s):
        return 'mail'
    if re.search(r'onboarding|guardian|self-service|self-register|self registration|register/|enrollment code|whatsapp now mandatory|photo upload', s):
        return 'onboard'
    if re.search(r'demo student|demo-student|qa student|visual reports|activity 360', s):
        return 'qa'
    if re.search(r'portal|edu-|edu_|rls|migration|student module|teacher module|parent module|institution|resource librar|forum|resource', s):
        return 'portal'
    if re.search(r'physics-studio|physics studio|tutor|katex|gemini|einstein|animation|hero video|logo|branding|redesign|monogram', s):
        # site redesign vs physics content
        if re.search(r'redesign|three-ecosystem|hero video|monogram|site upgrade|csp|hsts|pwa|analytics|foundation', s):
            return 'site'
        return 'brand'
    if re.search(r'^fix|^chore|deploy|retrigger|hotfix|repair|504|timeout|overflow|no-op', s):
        return 'fix'
    return 'portal'

# ---- Parse commits -------------------------------------------------------
commits = []
with open(COMMITS, encoding="utf-8") as f:
    for ln in f:
        ln = ln.rstrip("\n")
        if not ln.strip():
            continue
        m = re.match(r'^([0-9a-f]{7})\|(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\|([^|]*)\|(.*)$', ln)
        if not m:
            raise SystemExit("Unparseable line: " + ln)
        h, d, t, author, subj = m.groups()
        commits.append({
            "hash": h, "date": d, "time": t, "author": author.strip(),
            "subject": subj.strip(), "track": classify(subj),
        })

TOTAL = len(commits)

# ---- Day bands + gap spacers --------------------------------------------
by_day = collections.OrderedDict()
for c in commits:
    by_day.setdefault(c["date"], []).append(c)
active_days = list(by_day.keys())  # chronological (commits.txt is chronological)
ACTIVE = len(active_days)

first_day = datetime.date.fromisoformat(active_days[0])
last_day  = datetime.date.fromisoformat(active_days[-1])
span_days = (last_day - first_day).days + 1

# Build ordered axis columns: day columns with gap spacers between them.
DAY_W = 132     # px per active day band
GAP_W = 30      # fixed spacer width, "not to scale"
ROW_H = 30      # per node row height inside a day (nodes stack)
LANE_H = 34     # swimlane row height
LEFT = 190      # left gutter for lane labels
TOP = 96        # top area for date headers

columns = []  # {type:'day'|'gap', ...}
prev = None
for d in active_days:
    dd = datetime.date.fromisoformat(d)
    if prev is not None:
        missing = (dd - prev).days - 1
        if missing > 0:
            columns.append({"type": "gap", "days": missing,
                            "from": prev.isoformat(), "to": d})
    columns.append({"type": "day", "date": d, "count": len(by_day[d])})
    prev = dd

# x positions
x = LEFT
for col in columns:
    col["x"] = x
    col["w"] = DAY_W if col["type"] == "day" else GAP_W
    x += col["w"]
PLOT_W = x + 40
PLOT_H = TOP + len(TRACKS) * LANE_H + 40

# assign each commit a node position: x = day column center-ish, staggered;
# y = lane row. Multiple commits same day+lane -> stagger x within band.
day_col = {c["date"]: c for c in columns if c["type"] == "day"}
# group commits by (day, track) to stagger horizontally
stagger = collections.defaultdict(int)
node_list = []
for d in active_days:
    laneslots = collections.defaultdict(list)
    for c in by_day[d]:
        laneslots[c["track"]].append(c)
    col = day_col[d]
    for track, cs in laneslots.items():
        n = len(cs)
        lane_i = TRACK_INDEX[track]
        ly = TOP + lane_i * LANE_H + LANE_H/2
        for k, c in enumerate(cs):
            # spread within the band
            if n == 1:
                cx = col["x"] + DAY_W/2
            else:
                pad = 16
                cx = col["x"] + pad + (DAY_W - 2*pad) * (k/(n-1))
            c["cx"] = round(cx, 1)
            c["cy"] = round(ly, 1)
            node_list.append(c)

assert len(node_list) == TOTAL, (len(node_list), TOTAL)

# ---- Milestones (verified from memory logs + commit log) ----------------
# each: date, label, caption, [hashes]
MILESTONES = [
    ("2026-08-04", "Site foundation", "Executive website + education-first three-ecosystem redesign", ["f9ac0eb","ad34caf"]),
    ("2026-08-05", "AI Physics tutor", "Gemini live tutor + KaTeX math, Einstein companion", ["a085f57","f05f8c5","131d71b"]),
    ("2026-08-06", "Portal foundation", "EDU-001: 33 tables/9 roles/RLS + auth shell, admin/teacher/student/parent modules", ["5618580","514ad4d","3560aa4"]),
    ("2026-08-26", "Exam Lab", "CAIE 9702 generator → 2529 exact past-paper Qs + Maxwell examiner", ["66815d8","a29f63c","e84fab2","0b501ca"]),
    ("2026-08-27", "Proctored drills + Mail", "Anti-cheat proctoring, institutional analytics, onboarding gate, Gmail relay", ["5e77080","a409648"]),
    ("2026-08-29", "Command-center", "Owner control, rankings/live presence, view-as-role, voice attendance", ["b9ae88c","97b4f37","1d7fc42"]),
    ("2026-08-30", "Google Drive/Classroom", "Resource library + Drive/Classroom import & mirroring", ["d5f7022","d8ad958","77eed19"]),
    ("2026-09-01", "Proctor v2 + roles", "3 integrity modes, auto-calibration, Coordinator/Facilitator roles", ["1c1c2e6","09c6bb3","a2da675"]),
    ("2026-09-02", "Attendance Registrar", "School-scoped view-only registrar role", ["36aae09"]),
    ("2026-09-04", "Notification Centre", "notify() lib, Performance Index KPI engine, announcement broadcast", ["81a9a19","8211b84","ebbead8"]),
    ("2026-09-07", "Attendance Leave/Exempt", "Leave + lesson exemption w/ mandatory reason; deploy unblocked", ["6cfed72","d7b42ba"]),
    ("2026-09-08", "Self-registration", "Self-service student registration + credential email (A1/A2)", ["a9bd5d9","36fe4f0"]),
    ("2026-09-09", "Alerts + Timetable + Scope fix", "Calendar/Push, all-school timetable, study plans, coordinator scope fix", ["ba5cfd1","6ea4ad4","0a2b520"]),
    ("2026-09-10", "Sealed tests + Gmail + demo", "Secure test randomization, Gmail REST transport, demo student, task fixes", ["6f6e01d","4f62299","abfec84","e6401d0"]),
    ("2026-09-11", "Study-plan cache fix", "Hard-navigation bypass of stale study-plan route cache", ["2e444d2"]),
]

# ---- Dependency DAG (layered / tiered) ----------------------------------
# Nodes are subsystems; edges are topological "builds on".
DAG_NODES = [
    # id, label, tier (0=base .. n), track colour key
    ("site",    "Website\nfoundation",      0, "site"),
    ("tutor",   "AI Physics tutor",         0, "brand"),
    ("core",    "Portal core\n(EDU-001)",   1, "portal"),
    ("roles",   "Roles & RLS",              1, "coord"),
    ("attend",  "Attendance",               2, "attend"),
    ("exam",    "Exam Lab",                 2, "exam"),
    ("mail",    "Mail / Google",            2, "mail"),
    ("notif",   "Notifications",            3, "alerts"),
    ("coord",   "Coordinator\nscope fix",   3, "coord"),
    ("timet",   "Timetable",                3, "timetable"),
    ("onboard", "Onboarding /\nguardian",   3, "onboard"),
    ("calpush", "Calendar / Push",          4, "alerts"),
    ("study",   "Study plans\n& tasks",     4, "study"),
    ("qa",      "QA / demo",                5, "qa"),
]
DAG_EDGES = [
    ("site","core"), ("tutor","exam"), ("tutor","core"),
    ("core","attend"), ("core","exam"), ("core","mail"), ("core","roles"),
    ("roles","coord"), ("roles","onboard"),
    ("attend","notif"), ("exam","notif"), ("mail","notif"),
    ("exam","study"), ("study","qa"),
    ("notif","calpush"), ("timet","calpush"), ("timet","study"),
    ("mail","calpush"), ("core","timet"),
    ("coord","qa"), ("calpush","qa"),
]

# ---- Stats ---------------------------------------------------------------
per_track = collections.Counter(c["track"] for c in commits)
track_meta = {t[0]: {"label": t[1], "colour": t[2]} for t in TRACKS}

stats = {
    "total": TOTAL, "active_days": ACTIVE, "span_days": span_days,
    "first": active_days[0], "last": active_days[-1],
    "routes": routes_n, "apis": apis_n, "libs": libs_n,
    "authors": sorted(set(c["author"] for c in commits)),
    "per_track": {k: per_track.get(k, 0) for k, _ in TRACK_INDEX.items()},
}

payload = {
    "commits": commits, "columns": columns, "tracks": TRACKS,
    "milestones": MILESTONES, "dag_nodes": DAG_NODES, "dag_edges": DAG_EDGES,
    "stats": stats, "layout": {
        "DAY_W": DAY_W, "GAP_W": GAP_W, "LANE_H": LANE_H, "LEFT": LEFT,
        "TOP": TOP, "PLOT_W": PLOT_W, "PLOT_H": PLOT_H,
    },
}

with open(os.path.join(BASE, "graph_data.json"), "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False)

print("commits:", TOTAL, "active_days:", ACTIVE, "span_days:", span_days)
print("gaps:", sum(1 for c in columns if c["type"]=="gap"),
      "gap-day-total:", sum(c["days"] for c in columns if c["type"]=="gap"))
print("per_track:", dict(per_track))
print("PLOT:", PLOT_W, "x", PLOT_H)

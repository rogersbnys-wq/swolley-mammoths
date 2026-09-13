/* ============================================================
   SWOLLEY MAMMOTHS — pure logic
   Everything here is a pure function or a plain data constant.
   Nothing touches the DOM, localStorage, or React — see README
   for why: it's what lets an LLM (or a test suite) slot in later.
   ============================================================ */

/* ---------- exercise modes ---------- */

export const MODES = {
  barbell: { label: "Barbell", fields: ["weight", "reps"], strip: true },
  dumbbell: { label: "Dumbbell", fields: ["weight", "reps"], perHand: true },
  machine: { label: "Machine", fields: ["weight", "reps"] },
  bodyweight: { label: "Bodyweight", fields: ["added", "reps"] },
  timed: { label: "Timed / carry", fields: ["weight", "seconds"] },
  cardio: { label: "Cardio", fields: ["distance", "seconds"] },
};

/* a scheme is how the work was structured, independent of the exercise's
   equipment mode — AMRAP or EMOM can be applied to any exercise (not just
   a fixed catalog entry), which is why this is a property of the SET
   being logged, not of the exercise itself. */
export const SCHEMES = {
  straight: { label: "Straight sets" },
  amrap: { label: "AMRAP", fields: ["capMinutes", "totalReps"] },
  emom: { label: "EMOM", fields: ["intervalMinutes", "totalIntervals", "repsPerInterval"] },
};

/* ---------- capability taxonomy (Phase 3.5 / Phase 4) ----------
   Every exercise carries zero or more capabilities. Goals declare
   which capabilities they need. planCoverage() and the balanced
   scorecard are both just queries over this same tag set — one
   read against goals, one read against itself. ---------- */

export const CAPABILITIES = {
  squat: "Squat",
  hinge: "Hip hinge",
  horizontal_press: "Horizontal press",
  vertical_press: "Vertical press",
  horizontal_pull: "Horizontal pull",
  vertical_pull: "Vertical pull",
  carry: "Loaded carry",
  core: "Core",
  row_erg: "Rowing (erg)",
  ski_erg: "Ski erg",
  run: "Running",
  jump: "Jump / power",
};

/* which "side" a capability counts toward for the volume-balance ratios */
export function patternSide(cap) {
  if (cap === "horizontal_press" || cap === "vertical_press") return "push";
  if (cap === "horizontal_pull" || cap === "vertical_pull") return "pull";
  if (cap === "squat") return "quad";
  if (cap === "hinge") return "hinge";
  if (cap === "horizontal_press" || cap === "horizontal_pull") return "horizontal";
  return "other";
}

export function describeCapabilities(caps) {
  if (!caps || !caps.length) return "";
  const labels = caps.map((c) => CAPABILITIES[c] || c);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/* one color per capability, evenly spaced around the wheel (there are
   exactly 12 capabilities, so 30° apart) — a real categorical system
   instead of ad-hoc color picks, tuned for legibility on the app's
   dark ground. Never the only signal for a capability (always paired
   with its text label), just what makes the taxonomy visible instead
   of thirteen shades of gray. */
export const CAPABILITY_COLORS = Object.fromEntries(
  Object.keys(CAPABILITIES).map((cap, i) => [cap, `hsl(${(i * 30) % 360}, 62%, 62%)`])
);

/* ---------- seed data ---------- */

export const SEED_EXERCISES = [
  { id: "e1", name: "Back Squat", group: "Legs", mode: "barbell", capabilities: ["squat"] },
  { id: "e2", name: "Bench Press", group: "Push", mode: "barbell", capabilities: ["horizontal_press"] },
  { id: "e3", name: "Deadlift", group: "Pull", mode: "barbell", capabilities: ["hinge"] },
  { id: "e4", name: "Overhead Press", group: "Push", mode: "barbell", capabilities: ["vertical_press"] },
  { id: "e5", name: "Barbell Row", group: "Pull", mode: "barbell", capabilities: ["horizontal_pull"] },
  { id: "e6", name: "Romanian Deadlift", group: "Legs", mode: "barbell", capabilities: ["hinge"] },
  { id: "e7", name: "Incline Dumbbell Press", group: "Push", mode: "dumbbell", capabilities: ["horizontal_press"] },
  { id: "e8", name: "Dumbbell Row", group: "Pull", mode: "dumbbell", capabilities: ["horizontal_pull"] },
  { id: "e9", name: "Pull-Up", group: "Pull", mode: "bodyweight", capabilities: ["vertical_pull"] },
  { id: "e10", name: "Dip", group: "Push", mode: "bodyweight", capabilities: ["horizontal_press"] },
  { id: "e11", name: "Push-Up", group: "Push", mode: "bodyweight", capabilities: ["horizontal_press"] },
  { id: "e12", name: "Lat Pulldown", group: "Pull", mode: "machine", capabilities: ["vertical_pull"] },
  { id: "e13", name: "Leg Press", group: "Legs", mode: "machine", capabilities: ["squat"] },
  { id: "e14", name: "Leg Curl", group: "Legs", mode: "machine", capabilities: ["hinge"] },
  { id: "e15", name: "Cable Fly", group: "Push", mode: "machine", capabilities: ["horizontal_press"] },
  { id: "e16", name: "Farmer Carry", group: "Legs", mode: "timed", capabilities: ["carry"] },
  { id: "e17", name: "Plank", group: "Core", mode: "timed", capabilities: ["core"] },
  { id: "e18", name: "Row Erg", group: "Conditioning", mode: "cardio", capabilities: ["row_erg"] },
  { id: "e19", name: "Ski Erg", group: "Conditioning", mode: "cardio", capabilities: ["ski_erg"] },
  { id: "e20", name: "Run", group: "Conditioning", mode: "cardio", capabilities: ["run"] },
  { id: "e21", name: "Box Jump", group: "Legs", mode: "bodyweight", capabilities: ["jump", "squat"] },
];

export const SEED_PLANS = [
  { id: "p1", name: "Push Day", items: [
    { exerciseId: "e2", note: "touch and go, no pause", sets: 4, reps: 5 },
    { exerciseId: "e4", note: "", sets: 3, reps: 8 },
    { exerciseId: "e7", note: "30° bench", sets: 3, reps: 10 },
    { exerciseId: "e10", note: "lean forward for chest", sets: 3, reps: 12 },
  ]},
  { id: "p2", name: "Pull Day", items: [
    { exerciseId: "e3", note: "", sets: 3, reps: 5 },
    { exerciseId: "e9", note: "dead hang each rep", sets: 4, reps: 8 },
    { exerciseId: "e5", note: "", sets: 3, reps: 8 },
    { exerciseId: "e8", note: "", sets: 3, reps: 12 },
  ]},
  { id: "p3", name: "Leg Day", items: [
    { exerciseId: "e1", note: "high bar, below parallel", sets: 4, reps: 5 },
    { exerciseId: "e6", note: "", sets: 3, reps: 8 },
    { exerciseId: "e13", note: "", sets: 3, reps: 12 },
    { exerciseId: "e14", note: "", sets: 3, reps: 15 },
  ]},
];

export const PLATE_SPEC = {
  lb: { bar: 45, step: 5, plates: [
    { w: 45, color: "#2C5FA8", h: 100, wd: 15 },
    { w: 35, color: "#D9A521", h: 88, wd: 13 },
    { w: 25, color: "#3A7D53", h: 76, wd: 11 },
    { w: 10, color: "#C8322E", h: 56, wd: 9 },
    { w: 5, color: "#7E848E", h: 44, wd: 8 },
    { w: 2.5, color: "#EDE8E0", h: 34, wd: 6 },
  ]},
  kg: { bar: 20, step: 2.5, plates: [
    { w: 25, color: "#C8322E", h: 100, wd: 15 },
    { w: 20, color: "#2C5FA8", h: 100, wd: 13 },
    { w: 15, color: "#D9A521", h: 100, wd: 11 },
    { w: 10, color: "#3A7D53", h: 100, wd: 9 },
    { w: 5, color: "#EDE8E0", h: 72, wd: 8 },
    { w: 2.5, color: "#7E848E", h: 56, wd: 6 },
    { w: 1.25, color: "#4A4F58", h: 44, wd: 5 },
  ]},
};

/* Goal templates offered at creation. Capabilities are a starting
   point — the user can add/remove them per goal. targetKind decides
   what "arming a target" looks like for this goal (§6.2 step 3: the
   PRD deliberately defers numeric targets until there's evidence to
   set them from). */
export const GOAL_TEMPLATES = [
  { id: "stronger", label: "Get stronger", capabilities: ["squat", "hinge", "horizontal_press", "horizontal_pull"], targetKind: "lift" },
  { id: "hyrox", label: "Hyrox", capabilities: ["hinge", "squat", "carry", "vertical_pull", "row_erg", "ski_erg", "run"], targetKind: "event" },
  { id: "mile", label: "Faster mile", capabilities: ["run"], targetKind: "event" },
  { id: "vertical", label: "Jump higher", capabilities: ["squat", "jump"], targetKind: "event" },
  { id: "leanout", label: "Lose fat", capabilities: [], targetKind: "bodyweight" },
  { id: "injuryfree", label: "Stay injury-free", capabilities: ["horizontal_pull", "vertical_pull"], targetKind: "none" },
];

/* ---------- small pure helpers ---------- */

export const epley = (w, r) => (r <= 1 ? w : w * (1 + r / 30));
export const round1 = (n) => Math.round(n * 10) / 10;
export const uid = () => Math.random().toString(36).slice(2, 10);
export const LB_PER_KG = 2.2046226218;

export const convert = (w, from, to) =>
  from === to ? w : to === "kg" ? w / LB_PER_KG : w * LB_PER_KG;

/* a stored set's weight, expressed in the unit currently on screen */
export const wIn = (set, unit) => round1(convert(set.weight || 0, set.unit || "lb", unit));

export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/* the inverse of mmss — "35:30" -> 2130 seconds. Also accepts a bare
   number of seconds ("90") for quick entry, since that was always a
   valid thing to type before minutes:seconds editing existed. */
export function parseMMSS(str) {
  const s = String(str).trim();
  if (!s.includes(":")) return parseFloat(s);
  const [m, sec] = s.split(":");
  const mins = parseFloat(m);
  const secs = parseFloat(sec);
  return (isNaN(mins) ? 0 : mins * 60) + (isNaN(secs) ? 0 : secs);
}

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const mons = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${days[dt.getDay()]} ${String(d).padStart(2, "0")} ${mons[m - 1]}`;
}

export function daysAgo(key, now = new Date()) {
  const [y, m, d] = key.split("-").map(Number);
  const diff = Math.round((now - new Date(y, m - 1, d)) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 14) return `${diff}d ago`;
  return `${Math.round(diff / 7)}w ago`;
}

/* days between a date key and now, for windowing */
function ageDays(key, now = Date.now()) {
  const [y, m, d] = key.split("-").map(Number);
  return (now - new Date(y, m - 1, d).getTime()) / 86400000;
}

export function platesPerSide(total, unit) {
  const spec = PLATE_SPEC[unit];
  let rem = (total - spec.bar) / 2;
  if (rem < 0) return { plates: [], leftover: 0, under: true };
  const out = [];
  for (const p of spec.plates) {
    while (rem >= p.w - 1e-9 && out.length < 14) { out.push(p); rem -= p.w; }
  }
  return { plates: out, leftover: round1(rem), under: false };
}

/* how a single set reads on screen, given its exercise mode — a
   scheme (AMRAP/EMOM) is checked first since it can apply on top of
   any mode */
export function setLabel(set, ex, unit) {
  const mode = ex?.mode || "barbell";
  const scheme = set.scheme || "straight";

  if (scheme === "amrap" || scheme === "emom") {
    const w = wIn(set, unit);
    const atWeight = w > 0 ? ` @ ${w}${unit}` : "";
    if (scheme === "amrap") return `${set.totalReps || 0} reps in ${mmss((set.capMinutes || 0) * 60)} AMRAP${atWeight}`;
    const missed = set.missedIntervals ? ` · missed ${set.missedIntervals}` : "";
    return `${set.repsPerInterval || 0}/rd × ${set.totalIntervals || 0} EMOM${atWeight}${missed}`;
  }
  if (mode === "cardio") {
    const dist = set.distance || 0, secs = set.seconds || 0;
    if (dist <= 0) return mmss(secs);
    return `${round1(dist)}mi · ${mmss(secs)} (${mmss(secs / dist)}/mi)`;
  }
  if (mode === "timed") {
    const w = wIn(set, unit);
    return w > 0 ? `${w}${unit} · ${mmss(set.seconds || 0)}` : mmss(set.seconds || 0);
  }
  if (mode === "bodyweight") {
    const added = wIn(set, unit);
    return added > 0 ? `BW+${added} × ${set.reps}` : `BW × ${set.reps}`;
  }
  return `${wIn(set, unit)} × ${set.reps}`;
}

/* one comparable number per set, so trends work across modes AND
   schemes — always "higher is better" so PR detection stays generic */
export function setScore(set, ex, unit, bodyweight) {
  const mode = ex?.mode || "barbell";
  const scheme = set.scheme || "straight";

  if (scheme === "amrap") {
    const cap = set.capMinutes || 0;
    return cap > 0 ? (set.totalReps || 0) / cap : (set.totalReps || 0);
  }
  if (scheme === "emom") {
    const completed = Math.max(0, (set.totalIntervals || 0) - (set.missedIntervals || 0));
    return completed * (set.repsPerInterval || 0);
  }
  if (mode === "cardio") {
    const dist = set.distance || 0, secs = set.seconds || 0;
    return secs > 0 ? (dist / secs) * 60 : 0; // distance per minute
  }
  if (mode === "timed") return set.seconds || 0;
  if (mode === "bodyweight") return epley((bodyweight || 0) + wIn(set, unit), set.reps);
  return epley(wIn(set, unit), set.reps);
}

/* a set counts toward analysis unless it was tagged as a warmup —
   8.1 acceptance criteria: warmups are excluded from 1RM, volume,
   PR, and scorecard math, but stay visible in the session log. */
export const isCounted = (set) => !set?.warmup;

/* ---------- 1RM from every set you have logged ---------- */

const effectiveReps = (s) => (s.reps || 0) + (s.rir == null ? 0 : s.rir);

export function weightedSets(workouts, ex, unit, bodyweight, sinceDays = 120) {
  if (!ex || ex.mode === "timed" || ex.mode === "cardio") return [];
  const now = Date.now();
  const raw = [];
  workouts.forEach((w) =>
    w.sets.forEach((st) => {
      if (st.exerciseId !== ex.id || !isCounted(st)) return;
      if ((st.scheme || "straight") !== "straight") return; // AMRAP/EMOM aren't rep-max attempts
      const reps = effectiveReps(st);
      if (reps < 1 || reps > 10) return; // reliable regression range (tightened from 12, Sept 2026 recon)
      const load = (ex.mode === "bodyweight" ? bodyweight || 0 : 0) + wIn(st, unit);
      if (load <= 0) return;
      const age = st.ts ? (now - st.ts) / 86400000 : 0;
      if (age > sinceDays) return;
      raw.push({ reps, load, age, rir: st.rir, date: w.date, implied: epley(load, reps) });
    })
  );
  if (!raw.length) return [];

  const peak = Math.max(...raw.map((p) => p.implied));
  return raw
    .map((p) => {
      const rel = p.implied / peak;
      const quality = Math.max(0, Math.min(1, (rel - 0.8) / 0.2)) ** 2;
      const recency = 0.5 ** (p.age / 45);
      const effort = p.rir == null ? 0.6 : 1;
      return { ...p, w: quality * recency * effort };
    })
    .filter((p) => p.w > 0.01)
    .sort((x, y) => x.reps - y.reps);
}

export function fit1RM(points) {
  if (!points || !points.length) return null;
  const best = points.reduce((a, b) => (b.implied > a.implied ? b : a));
  const epleyEst = best.implied;
  const fallback = {
    est: epleyEst, lo: epleyEst * 0.95, hi: epleyEst * 1.05,
    method: "epley", n: points.length, epleyEst, points,
    assumed: points.some((p) => p.rir == null),
  };

  const SW = points.reduce((a, p) => a + p.w, 0);
  const mr = points.reduce((a, p) => a + p.w * p.reps, 0) / SW;
  const ml = points.reduce((a, p) => a + p.w * p.load, 0) / SW;
  let Sxx = 0, Sxy = 0;
  points.forEach((p) => {
    Sxx += p.w * (p.reps - mr) ** 2;
    Sxy += p.w * (p.reps - mr) * (p.load - ml);
  });
  if (Sxx < 1e-9 || Sxy >= 0 || !isFinite(Sxy / Sxx)) return fallback;

  const b = Sxy / Sxx, a = ml - b * mr, est = a + b;
  if (!isFinite(est) || est <= 0) return fallback;

  const sse = points.reduce((x, p) => x + p.w * (p.load - (a + b * p.reps)) ** 2, 0);
  const sst = points.reduce((x, p) => x + p.w * (p.load - ml) ** 2, 0);
  const nEff = SW ** 2 / points.reduce((x, p) => x + p.w ** 2, 0);
  const s2 = sse / Math.max(1, nEff - 2);
  const se = Math.sqrt(Math.max(0, s2 * (1 / SW + (1 - mr) ** 2 / Sxx)));
  const width = Math.max(est * 0.025, 1.96 * se);

  return {
    est, a, b, lo: est - width, hi: est + width,
    r2: sst > 0 ? Math.max(0, 1 - sse / sst) : 1,
    n: points.length, nEff, dropPerRep: -b / est,
    method: "fit", epleyEst, points,
    assumed: points.some((p) => p.rir == null),
  };
}

/* the exercise's estimated 1RM right now, or null if there's nothing to go on */
export function estimate1RM(workouts, ex, unit, bodyweight, sinceDays = 120) {
  if (!ex || ex.mode === "timed" || ex.mode === "cardio") return null;
  return fit1RM(weightedSets(workouts, ex, unit, bodyweight, sinceDays));
}

/* best raw set score ever logged for an exercise (used for PRs and sparks).
   Pass `scheme` to compare like with like — an AMRAP score and a straight
   set's e1RM live on completely different scales. */
export function bestScore(workouts, exId, ex, unit, bodyweight, { before, scheme } = {}) {
  let best = 0;
  workouts.forEach((w) => {
    if (before && w.date >= before) return;
    w.sets.forEach((s) => {
      if (s.exerciseId !== exId || !isCounted(s)) return;
      if (scheme && (s.scheme || "straight") !== scheme) return;
      best = Math.max(best, setScore(s, ex, unit, bodyweight));
    });
  });
  return best;
}

/* ---------- persistence-adjacent pure helpers ---------- */

export function seed() {
  return {
    exercises: SEED_EXERCISES, plans: SEED_PLANS, workouts: [],
    unit: "lb", bodyweight: 0, bodyweightLog: [], goals: [],
    profile: { daysPerWeek: null },
  };
}

export function currentBodyweight(data, unit) {
  const log = data.bodyweightLog || [];
  if (!log.length) return data.bodyweight || 0;
  const latest = log.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return round1(convert(latest.weight, latest.unit || "lb", unit));
}

/* bodyweight as of (on or before) a given date key, for historical comparisons */
export function bodyweightAsOf(data, unit, dateKey) {
  const log = (data.bodyweightLog || []).filter((e) => e.date <= dateKey);
  if (!log.length) return data.bodyweight || 0;
  const latest = log.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return round1(convert(latest.weight, latest.unit || "lb", unit));
}

/* catalog exercises (the ones this app ships, keyed by their fixed
   SEED_EXERCISES id) should always track the current seed definition
   — mode, capabilities, name, group — even on a device whose save
   predates a catalog change. A user's own custom exercises (ids not
   in the seed set) are never touched here. Without this, a returning
   user's already-saved "Run" stays frozen at whatever mode/capabilities
   it had the day their device first seeded it, forever. */
function reconcileExercises(stored) {
  const seedById = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e]));
  const reconciled = (stored || SEED_EXERCISES).map((e) => {
    const seedDef = seedById[e.id];
    return seedDef
      ? { ...e, ...seedDef }
      : { mode: e.mode || (e.bar === false ? "machine" : "barbell"), capabilities: e.capabilities || [], ...e };
  });
  const knownIds = new Set(reconciled.map((e) => e.id));
  return [...reconciled, ...SEED_EXERCISES.filter((e) => !knownIds.has(e.id))];
}

export function migrate(data) {
  if (!data) return null;
  const unitFallback = data.unit || "lb";
  return {
    ...seed(),
    ...data,
    exercises: reconcileExercises(data.exercises),
    plans: data.plans || SEED_PLANS,
    bodyweightLog: data.bodyweightLog || [],
    goals: data.goals || [],
    profile: { daysPerWeek: null, ...(data.profile || {}) },
    workouts: (data.workouts || []).map((w) => ({
      queue: [], planName: "Freestyle",
      ...w,
      sets: w.sets.map((s) => ({
        unit: unitFallback, note: "", seconds: 0, warmup: false, pain: false,
        scheme: "straight", distance: 0, heartRate: null,
        capMinutes: 0, totalReps: 0,
        intervalMinutes: 1, totalIntervals: 0, repsPerInterval: 0, missedIntervals: 0,
        ...s,
      })),
    })),
  };
}

/* ============================================================
   PHASE 3 / 3.5 — pace, bodyweight adjustment, rule-based coach
   ============================================================ */

/* the goal's current measured value, in the unit on screen — null
   when there's nothing logged to measure it from yet */
export function goalCurrentValue(goal, data, unit) {
  if (!goal.target) return null;
  if (goal.target.kind === "bodyweight") return currentBodyweight(data, unit);
  if (goal.target.kind === "lift") {
    const ex = data.exercises.find((e) => e.id === goal.target.exerciseId);
    if (!ex) return null;
    const bw = currentBodyweight(data, unit);
    const fit = estimate1RM(data.workouts, ex, unit, bw);
    return fit ? fit.est : null;
  }
  return null;
}

/* Can this goal have a numeric target armed yet? The PRD is explicit
   (§6.2 step 3) that targets are offered only once there's a baseline
   to measure from — never invented at setup. */
export function canArmTarget(goal, data, unit) {
  const tmpl = GOAL_TEMPLATES.find((t) => t.id === goal.templateId);
  const kind = tmpl?.targetKind;
  if (kind === "bodyweight") return currentBodyweight(data, unit) > 0;
  if (kind === "lift") {
    const exId = goal.liftExerciseId || goal.target?.exerciseId;
    const ex = exId && data.exercises.find((e) => e.id === exId);
    if (!ex) return false;
    return estimate1RM(data.workouts, ex, unit, currentBodyweight(data, unit)) != null;
  }
  return false; // "event" and "none" goals have no loggable primitive yet (§10)
}

/* pace math: needed rate, current gap, and (if the deadline has
   passed) an outcome instead of a broken progress bar */
export function pace(goal, data, unit, now = new Date()) {
  if (!goal.target || !goal.target.deadline || !goal.target.baseline) return null;
  const current = goalCurrentValue(goal, data, unit);
  if (current == null) return null;

  const { value: targetValue, deadline, baseline } = goal.target;
  const start = new Date(`${baseline.date}T00:00:00`);
  const end = new Date(`${deadline}T00:00:00`);
  const totalWeeks = Math.max((end - start) / (7 * 86400000), 1e-9);
  const totalNeeded = targetValue - baseline.value;
  const neededPerWeek = totalNeeded / totalWeeks;

  const past = now > end;
  if (past) {
    return {
      current, targetValue, baseline, neededPerWeek, weeksLeft: 0,
      gap: current - targetValue, onPace: null,
      outcome: (targetValue >= baseline.value ? current >= targetValue : current <= targetValue) ? "hit" : "missed",
    };
  }

  const elapsedWeeks = Math.max((now - start) / (7 * 86400000), 0);
  const expectedByNow = baseline.value + neededPerWeek * elapsedWeeks;
  const direction = targetValue >= baseline.value ? 1 : -1;
  const gap = (current - expectedByNow) * direction; // positive = ahead or on pace
  const weeksLeft = Math.max((end - now) / (7 * 86400000), 0);
  const remaining = (targetValue - current) * direction;
  const requiredPerWeekNow = weeksLeft > 1e-9 ? (remaining / weeksLeft) * direction : (remaining <= 0 ? 0 : Infinity);

  return {
    current, targetValue, baseline, neededPerWeek, elapsedWeeks, expectedByNow,
    gap, weeksLeft, requiredPerWeekNow, onPace: gap >= -1e-9, outcome: null,
  };
}

/* "+40 lb on +3 lb bodyweight" vs "+40 lb on +15 lb bodyweight" are
   different outcomes — the app already has both numbers (§8.4). */
export function bodyweightAdjustedStrength(data, ex, unit, sinceDays = 84) {
  const cutoff = todayKey(new Date(Date.now() - sinceDays * 86400000));
  const inWindow = data.workouts
    .filter((w) => w.date >= cutoff)
    .flatMap((w) => w.sets.filter((s) => s.exerciseId === ex.id && isCounted(s)).map((s) => ({ ...s, date: w.date })))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (inWindow.length < 2) return null;

  const bw = currentBodyweight(data, unit);
  const first = inWindow[0], last = inWindow[inWindow.length - 1];
  const liftStart = setScore(first, ex, unit, bodyweightAsOf(data, unit, first.date));
  const liftEnd = setScore(last, ex, unit, bw);
  const bwStart = bodyweightAsOf(data, unit, first.date);
  const bwEnd = bodyweightAsOf(data, unit, last.date);
  if (liftStart <= 0) return null;

  const liftDeltaPct = ((liftEnd - liftStart) / liftStart) * 100;
  const bwDeltaPct = bwStart > 0 ? ((bwEnd - bwStart) / bwStart) * 100 : 0;

  let verdict;
  if (liftDeltaPct <= 0.5) verdict = "flat";
  else if (bwDeltaPct > 0.5 && liftDeltaPct <= bwDeltaPct * 1.5) verdict = "mostly-bodyweight";
  else verdict = "real-gain";

  return { liftStart, liftEnd, liftDeltaPct: round1(liftDeltaPct), bwStart, bwEnd, bwDeltaPct: round1(bwDeltaPct), verdict };
}

const STALL_SESSIONS = 3;
const STALE_GROUP_DAYS = 12;

/* rule-based insights over set history — written as a pure function
   so an LLM can eventually take over narrating them (README's own
   design note). Each insight is {type, severity, text}. */
export function coachInsights(data, unit, now = new Date()) {
  const insights = [];
  const bw = currentBodyweight(data, unit);
  const sorted = data.workouts.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

  /* stalls: an exercise's best score hasn't improved in STALL_SESSIONS sessions */
  data.exercises.forEach((ex) => {
    const sessions = sorted.filter((w) => w.sets.some((s) => s.exerciseId === ex.id && isCounted(s)));
    if (sessions.length < STALL_SESSIONS + 1) return;
    const recent = sessions.slice(-STALL_SESSIONS - 1);
    const scores = recent.map((w) =>
      Math.max(...w.sets.filter((s) => s.exerciseId === ex.id && isCounted(s)).map((s) => setScore(s, ex, unit, bw)))
    );
    const peak = scores[0];
    const stalled = scores.slice(1).every((s) => s <= peak + 1e-9);
    if (stalled) {
      insights.push({ type: "stall", severity: "warn", exerciseId: ex.id,
        text: `${ex.name} hasn't beaten ${round1(peak)} in ${STALL_SESSIONS} sessions.` });
    }
  });

  /* stale groups: a muscle group untouched for a while */
  const groups = [...new Set(data.exercises.map((e) => e.group))];
  groups.forEach((g) => {
    const exIds = data.exercises.filter((e) => e.group === g).map((e) => e.id);
    const last = sorted.slice().reverse().find((w) => w.sets.some((s) => exIds.includes(s.exerciseId)));
    if (!last) return;
    const days = ageDays(last.date, now.getTime());
    if (days >= STALE_GROUP_DAYS) {
      insights.push({ type: "stale", severity: "warn", group: g,
        text: `You haven't trained ${g} in ${Math.round(days)} days.` });
    }
  });

  /* pain flags */
  const painSets = sorted.flatMap((w) => w.sets.filter((s) => s.pain).map((s) => ({ ...s, date: w.date })));
  if (painSets.length) {
    const latest = painSets[painSets.length - 1];
    const ex = data.exercises.find((e) => e.id === latest.exerciseId);
    insights.push({ type: "pain", severity: "alert", exerciseId: latest.exerciseId,
      text: `You flagged pain on ${ex?.name || "a lift"} (${daysAgo(latest.date, now)}).` });
  }

  /* recent PRs (progress) */
  data.exercises.forEach((ex) => {
    const sessions = sorted.filter((w) => w.sets.some((s) => s.exerciseId === ex.id && isCounted(s)));
    if (sessions.length < 2) return;
    const last = sessions[sessions.length - 1];
    const lastBest = Math.max(...last.sets.filter((s) => s.exerciseId === ex.id && isCounted(s)).map((s) => setScore(s, ex, unit, bw)));
    const priorBest = bestScore(data.workouts, ex.id, ex, unit, bw, { before: last.date });
    if (lastBest > priorBest + 0.01) {
      insights.push({ type: "progress", severity: "good", exerciseId: ex.id,
        text: `New best on ${ex.name}: ${round1(lastBest)}.` });
    }
  });

  /* consistency, against the training profile if one is set */
  if (data.profile?.daysPerWeek) {
    const recentSessions = sorted.filter((w) => ageDays(w.date, now.getTime()) <= 14);
    const actualPerWeek = recentSessions.length / 2;
    if (actualPerWeek < data.profile.daysPerWeek - 0.5) {
      insights.push({ type: "consistency", severity: "warn",
        text: `Averaging ${round1(actualPerWeek)} sessions/week over the last two, vs your target of ${data.profile.daysPerWeek}.` });
    }
  }

  return insights;
}

/* ============================================================
   PHASE 4 — the Coach evaluation engine
   Both lenses (goal-fitness and balance) are queries over the same
   three inputs: plans, logs, goals.
   ============================================================ */

/* §8.5a — does the user's *intended* training even cover a goal's
   required capabilities? Reads the Plans tab, not just the log. */
export function planCoverage(plans, goal, exercises) {
  if (!goal.capabilities || !goal.capabilities.length) {
    return { applicable: false, covered: [], missing: [], ratio: null };
  }
  const served = new Set();
  (plans || []).forEach((p) => p.items.forEach((it) => {
    const ex = exercises.find((e) => e.id === it.exerciseId);
    (ex?.capabilities || []).forEach((c) => served.add(c));
  }));
  const covered = goal.capabilities.filter((c) => served.has(c));
  const missing = goal.capabilities.filter((c) => !served.has(c));
  return { applicable: true, covered, missing, ratio: covered.length / goal.capabilities.length };
}

/* which existing plan is the most natural home for a missing
   capability — same "side" (push/pull/quad/hinge) wins; otherwise
   the plan with the fewest items so it doesn't lopside one day */
export function suggestPlanForCapability(cap, plans, exercises) {
  if (!plans || !plans.length) return null;
  const side = patternSide(cap);
  const scored = plans.map((p) => {
    const caps = new Set();
    p.items.forEach((it) => {
      const ex = exercises.find((e) => e.id === it.exerciseId);
      (ex?.capabilities || []).forEach((c) => caps.add(c));
    });
    const sameSide = [...caps].some((c) => patternSide(c) === side);
    return { plan: p, sameSide, size: p.items.length };
  });
  scored.sort((a, b) => (b.sameSide - a.sameSide) || (a.size - b.size));
  return scored[0]?.plan || null;
}

const LEAN_RATIO = 1.5;
const MIN_LEAN_SETS = 6;

/* §8.5a — one honest verdict per goal, combining structural coverage
   (plan ↔ goal) with pace (log ↔ goal). Deliberately does not
   compute adherence (log ↔ plan, §8.5b) — that's a P1, Phase 5 item. */
export function goalVerdict(goal, data, unit, now = new Date()) {
  const coverage = planCoverage(data.plans, goal, data.exercises);
  const p = pace(goal, data, unit, now);

  if (coverage.applicable && coverage.ratio === 0) {
    return {
      goal, status: "red", coverage, pace: p,
      headline: `Your plans don't train ${describeCapabilities(coverage.missing)} — as your training stands, this goal isn't reachable.`,
      suggestions: coverage.missing.map((cap) => ({
        capability: cap,
        plan: suggestPlanForCapability(cap, data.plans, data.exercises),
      })),
    };
  }
  if (coverage.applicable && coverage.missing.length > 0) {
    return {
      goal, status: "amber", coverage, pace: p,
      headline: `Your plans are missing ${describeCapabilities(coverage.missing)}.`,
      suggestions: coverage.missing.map((cap) => ({
        capability: cap,
        plan: suggestPlanForCapability(cap, data.plans, data.exercises),
      })),
    };
  }
  if (p && p.outcome) {
    return {
      goal, status: p.outcome === "hit" ? "green" : "red", coverage, pace: p,
      headline: p.outcome === "hit"
        ? `Hit the target: ${round1(p.current)} vs a goal of ${round1(p.targetValue)}.`
        : `Deadline passed at ${round1(p.current)}, short of the ${round1(p.targetValue)} target.`,
      suggestions: [],
    };
  }
  if (p && !p.onPace) {
    return {
      goal, status: "amber", coverage, pace: p,
      headline: `Off pace — you'd need ${round1(Math.abs(p.requiredPerWeekNow))}/wk from here to still hit it, vs ${round1(Math.abs(p.neededPerWeek))}/wk planned.`,
      suggestions: [],
    };
  }
  if (p && p.onPace) {
    return {
      goal, status: "green", coverage, pace: p,
      headline: `On pace for ${goal.label}: ${round1(p.current)} toward ${round1(p.targetValue)}.`,
      suggestions: [],
    };
  }
  if (coverage.applicable) {
    return {
      goal, status: "green", coverage, pace: p,
      headline: `Your plans train everything ${goal.label} needs.`,
      suggestions: [],
    };
  }
  return {
    goal, status: "unknown", coverage, pace: p,
    headline: `Not enough data yet to evaluate ${goal.label}.`,
    suggestions: [],
  };
}

/* §8.5a — critique a plan against every goal at the moment it's
   saved, using every OTHER plan plus this one as the candidate set,
   so the message reflects the whole intended program, not just this
   one day. */
export function evaluatePlanOnSave(plan, allPlans, goals, exercises) {
  const candidatePlans = [plan, ...allPlans.filter((p) => p.id !== plan.id)];
  const messages = [];
  (goals || []).forEach((goal) => {
    if (!goal.capabilities || !goal.capabilities.length) return;
    const coverage = planCoverage(candidatePlans, goal, exercises);
    if (coverage.missing.length > 0) {
      messages.push({
        goalId: goal.id,
        text: `This plan set has nothing for ${describeCapabilities(coverage.missing)}, which your "${goal.label}" goal needs. Add a piece for it, or lean on another day.`,
      });
    }
  });
  return messages;
}

/* §8.5c — volume by capability, warmups excluded, over a window */
export function volumeByCapability(workouts, exercises, sinceDays, now = Date.now()) {
  const out = {};
  workouts.forEach((w) => {
    if (ageDays(w.date, now) > sinceDays) return;
    w.sets.forEach((s) => {
      if (!isCounted(s)) return;
      const ex = exercises.find((e) => e.id === s.exerciseId);
      (ex?.capabilities || []).forEach((c) => { out[c] = (out[c] || 0) + 1; });
    });
  });
  return out;
}

function sumCaps(byCap, caps) {
  return caps.reduce((s, c) => s + (byCap[c] || 0), 0);
}

/* one side-vs-side volume comparison, framed as a lean and a trend —
   never a target ratio (the Sept 2026 recon found no defensible
   single number in the literature; see §8.5c). */
function volumeLean(byCapNow, byCapPrior, capsA, capsB, labelA, labelB) {
  const a = sumCaps(byCapNow, capsA), b = sumCaps(byCapNow, capsB);
  if (a + b < MIN_LEAN_SETS) return { labelA, labelB, a, b, status: "insufficient" };

  const ratio = b > 0 ? a / b : (a > 0 ? Infinity : 1);
  const leanNow = ratio >= LEAN_RATIO ? labelA : ratio <= 1 / LEAN_RATIO ? labelB : null;

  const pa = sumCaps(byCapPrior, capsA), pb = sumCaps(byCapPrior, capsB);
  let leanPrior = null;
  if (pa + pb >= MIN_LEAN_SETS) {
    const priorRatio = pb > 0 ? pa / pb : (pa > 0 ? Infinity : 1);
    leanPrior = priorRatio >= LEAN_RATIO ? labelA : priorRatio <= 1 / LEAN_RATIO ? labelB : null;
  }
  const sustained = leanNow && leanNow === leanPrior;

  return {
    labelA, labelB, a, b, ratio: isFinite(ratio) ? round1(ratio) : null,
    lean: leanNow, sustained, status: leanNow ? (sustained ? "sustained-lean" : "lean") : "balanced",
  };
}

/* trend: % change in an exercise's best logged score across a window,
   used for trajectory divergence — the recon's most defensible signal,
   since a within-user trend needs no disputed population threshold */
export function progressionPct(workouts, exercises, exId, unit, bodyweight, sinceDays, now = Date.now()) {
  const ex = exercises.find((e) => e.id === exId);
  if (!ex) return null;
  const inWindow = workouts
    .filter((w) => ageDays(w.date, now) <= sinceDays)
    .flatMap((w) => w.sets.filter((s) => s.exerciseId === exId && isCounted(s)))
    .map((s) => setScore(s, ex, unit, bodyweight));
  if (inWindow.length < 2) return null;
  const first = inWindow[0], last = inWindow[inWindow.length - 1];
  if (first <= 0) return null;
  return round1(((last - first) / first) * 100);
}

const DIVERGENCE_THRESHOLD = 8; // percentage points, over the trajectory window

/* compares two complementary exercises' progression rates */
export function trajectoryDivergence(workouts, exercises, exIdA, exIdB, unit, bodyweight, sinceDays = 56, now = Date.now()) {
  const a = progressionPct(workouts, exercises, exIdA, unit, bodyweight, sinceDays, now);
  const b = progressionPct(workouts, exercises, exIdB, unit, bodyweight, sinceDays, now);
  if (a == null || b == null) return { status: "insufficient", a, b };
  const divergence = a - b;
  if (Math.abs(divergence) < DIVERGENCE_THRESHOLD) return { status: "balanced", a, b, divergence: round1(divergence) };
  const exA = exercises.find((e) => e.id === exIdA), exB = exercises.find((e) => e.id === exIdB);
  return {
    status: "diverging", a, b, divergence: round1(divergence),
    leader: divergence > 0 ? exA?.name : exB?.name,
    laggard: divergence > 0 ? exB?.name : exA?.name,
    text: `${exA?.name} is ${a >= 0 ? "+" : ""}${a}% while ${exB?.name} is ${b >= 0 ? "+" : ""}${b}% over ${sinceDays} days — this is the pattern that precedes an imbalance.`,
  };
}

/* §8.5c — the balanced scorecard: volume leans + trajectory divergence,
   every ratio-based flag carrying an evidence qualifier rather than an
   asserted target. */
export function balancedScorecard(data, unit, { sinceDays = 28, now = Date.now(), pairs = [] } = {}) {
  const byCapNow = volumeByCapability(data.workouts, data.exercises, sinceDays, now);
  const byCapPrior = volumeByCapability(
    data.workouts.filter((w) => ageDays(w.date, now) > sinceDays && ageDays(w.date, now) <= sinceDays * 2),
    data.exercises, sinceDays * 2, now
  );

  const volume = [
    { ...volumeLean(byCapNow, byCapPrior, ["horizontal_press", "vertical_press"], ["horizontal_pull", "vertical_pull"], "pressing", "pulling"),
      key: "push_pull",
      note: "Sustained one-sidedness here is *associated with* shoulder issues in the literature, not established as causal — and the defensible ratio is contested (sources range 1:1 to 2:1). This names the lean, not a target." },
    { ...volumeLean(byCapNow, byCapPrior, ["squat"], ["hinge"], "quad-dominant", "hip-hinge"), key: "quad_hinge",
      note: "Flagged as a direction worth balancing, not a prescribed ratio." },
    { ...volumeLean(byCapNow, byCapPrior, ["horizontal_press", "horizontal_pull"], ["vertical_press", "vertical_pull"], "horizontal", "vertical"), key: "horizontal_vertical",
      note: "Flagged as a direction worth balancing, not a prescribed ratio." },
  ];

  const trajectories = pairs
    .map(([a, b]) => trajectoryDivergence(data.workouts, data.exercises, a, b, unit, currentBodyweight(data, unit), sinceDays * 2, now))
    .filter((t) => t.status === "diverging");

  const painInsights = coachInsights(data, unit, new Date(now)).filter((i) => i.type === "pain");

  return { volume, trajectories, painFlags: painInsights, sinceDays };
}

/* which exercise carrying a capability has the most logged history —
   used to pick a default complementary pair for trajectory divergence
   (the PRD's own example is specifically bench vs. row) */
export function mostTrainedExercise(workouts, exercises, capability) {
  const candidates = exercises.filter((e) => (e.capabilities || []).includes(capability));
  if (!candidates.length) return null;
  const counts = {};
  workouts.forEach((w) => w.sets.forEach((s) => {
    if (!isCounted(s)) return;
    if (candidates.some((c) => c.id === s.exerciseId)) counts[s.exerciseId] = (counts[s.exerciseId] || 0) + 1;
  }));
  const ranked = candidates.map((c) => ({ id: c.id, n: counts[c.id] || 0 })).sort((a, b) => b.n - a.n);
  return ranked[0].n > 0 ? ranked[0].id : null;
}

const STATUS_RANK = { red: 0, amber: 1, unknown: 2, green: 3 };

/* the single goal most worth surfacing on the home screen (§6.1 #1) —
   worst status first, so direction is never more than zero taps away */
export function topVerdict(data, unit, now = new Date()) {
  if (!data.goals || !data.goals.length) return null;
  return data.goals
    .map((g) => goalVerdict(g, data, unit, now))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0];
}

/* pulls everything the Coach knows into one ranked list for the
   verdict-first presentation (§8.5d) */
export function rankedChanges(goalVerdicts, scorecard) {
  const changes = [];
  goalVerdicts.forEach((v) => {
    if (v.status === "red" || v.status === "amber") {
      changes.push({ priority: v.status === "red" ? 0 : 1, source: "goal", goalId: v.goal.id, text: v.headline });
    }
  });
  scorecard.volume.forEach((v) => {
    if (v.status === "sustained-lean") {
      changes.push({ priority: 1, source: "scorecard", key: v.key,
        text: `${v.lean} volume has led for 4+ weeks (${v.a} vs ${v.b} sets). ${v.note}` });
    }
  });
  scorecard.trajectories.forEach((t) => {
    changes.push({ priority: 1, source: "scorecard", text: t.text });
  });
  scorecard.painFlags.forEach((p) => changes.push({ priority: 0, source: "pain", text: p.text }));
  return changes.sort((a, b) => a.priority - b.priority);
}

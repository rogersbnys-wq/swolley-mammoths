import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   SWOLLEY MAMMOTHS — Phase 2
   Adds: exercise modes, workout plans, mid-session swapping,
   per-set notes, and a full last-session comparison.
   ============================================================ */

const KEY = "swolleymammoths:v2";
const LEGACY_KEYS = ["swolleymammoths:v1", "ironledger:v1"];

/* mode decides which fields you're asked for, and how a set reads back */
const MODES = {
  barbell: { label: "Barbell", fields: ["weight", "reps"], strip: true },
  dumbbell: { label: "Dumbbell", fields: ["weight", "reps"], perHand: true },
  machine: { label: "Machine", fields: ["weight", "reps"] },
  bodyweight: { label: "Bodyweight", fields: ["added", "reps"] },
  timed: { label: "Timed / carry", fields: ["weight", "seconds"] },
};

const SEED_EXERCISES = [
  { id: "e1", name: "Back Squat", group: "Legs", mode: "barbell" },
  { id: "e2", name: "Bench Press", group: "Push", mode: "barbell" },
  { id: "e3", name: "Deadlift", group: "Pull", mode: "barbell" },
  { id: "e4", name: "Overhead Press", group: "Push", mode: "barbell" },
  { id: "e5", name: "Barbell Row", group: "Pull", mode: "barbell" },
  { id: "e6", name: "Romanian Deadlift", group: "Legs", mode: "barbell" },
  { id: "e7", name: "Incline Dumbbell Press", group: "Push", mode: "dumbbell" },
  { id: "e8", name: "Dumbbell Row", group: "Pull", mode: "dumbbell" },
  { id: "e9", name: "Pull-Up", group: "Pull", mode: "bodyweight" },
  { id: "e10", name: "Dip", group: "Push", mode: "bodyweight" },
  { id: "e11", name: "Push-Up", group: "Push", mode: "bodyweight" },
  { id: "e12", name: "Lat Pulldown", group: "Pull", mode: "machine" },
  { id: "e13", name: "Leg Press", group: "Legs", mode: "machine" },
  { id: "e14", name: "Leg Curl", group: "Legs", mode: "machine" },
  { id: "e15", name: "Cable Fly", group: "Push", mode: "machine" },
  { id: "e16", name: "Farmer Carry", group: "Legs", mode: "timed" },
  { id: "e17", name: "Plank", group: "Core", mode: "timed" },
];

const SEED_PLANS = [
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

const PLATE_SPEC = {
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

/* ---------- pure helpers ---------- */

const epley = (w, r) => (r <= 1 ? w : w * (1 + r / 30));
const round1 = (n) => Math.round(n * 10) / 10;
const uid = () => Math.random().toString(36).slice(2, 10);
const LB_PER_KG = 2.2046226218;

const convert = (w, from, to) =>
  from === to ? w : to === "kg" ? w / LB_PER_KG : w * LB_PER_KG;

/* a stored set's weight, expressed in the unit currently on screen */
const wIn = (set, unit) => round1(convert(set.weight || 0, set.unit || "lb", unit));

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const mons = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${days[dt.getDay()]} ${String(d).padStart(2, "0")} ${mons[m - 1]}`;
}

function daysAgo(key) {
  const [y, m, d] = key.split("-").map(Number);
  const diff = Math.round((new Date() - new Date(y, m - 1, d)) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 14) return `${diff}d ago`;
  return `${Math.round(diff / 7)}w ago`;
}

function platesPerSide(total, unit) {
  const spec = PLATE_SPEC[unit];
  let rem = (total - spec.bar) / 2;
  if (rem < 0) return { plates: [], leftover: 0, under: true };
  const out = [];
  for (const p of spec.plates) {
    while (rem >= p.w - 1e-9 && out.length < 14) { out.push(p); rem -= p.w; }
  }
  return { plates: out, leftover: round1(rem), under: false };
}

/* how a single set reads on screen, given its exercise mode */
function setLabel(set, ex, unit) {
  const mode = ex?.mode || "barbell";
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

/* one comparable number per set, so trends work across modes */
function setScore(set, ex, unit, bodyweight) {
  const mode = ex?.mode || "barbell";
  if (mode === "timed") return set.seconds || 0;
  if (mode === "bodyweight") return epley((bodyweight || 0) + wIn(set, unit), set.reps);
  return epley(wIn(set, unit), set.reps);
}

/* ---------- 1RM from every set you have logged ----------
   A single set gives one point. Epley then guesses the rest of the curve
   with a fixed 3.3%-per-rep decay that isn't true for everyone.
   Instead: put EVERY set on the chart, weight each by how much it can be
   trusted, fit a weighted line, and read it off at one rep. ---------- */

/* reps this set would have reached at failure */
const effectiveReps = (s) => (s.reps || 0) + (s.rir == null ? 0 : s.rir);

/* every set, scored for how much it should count toward the fit */
function weightedSets(workouts, ex, unit, bodyweight, sinceDays = 120) {
  if (!ex || ex.mode === "timed") return [];
  const now = Date.now();
  const raw = [];
  workouts.forEach((w) =>
    w.sets.forEach((st) => {
      if (st.exerciseId !== ex.id) return;
      const reps = effectiveReps(st);
      if (reps < 1 || reps > 12) return;          // the linear fit breaks past ~12
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
      // warmups and back-off sets sit well below your peak effort — taper them out
      const rel = p.implied / peak;
      const quality = Math.max(0, Math.min(1, (rel - 0.8) / 0.2)) ** 2;
      const recency = 0.5 ** (p.age / 45);        // 45-day half life
      const effort = p.rir == null ? 0.6 : 1;     // untagged sets are less trustworthy
      return { ...p, w: quality * recency * effort };
    })
    .filter((p) => p.w > 0.01)
    .sort((x, y) => x.reps - y.reps);
}

/* weighted least squares through all of them */
function fit1RM(points) {
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
  // no rep-range variety, or load rising with reps: nothing to fit
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

/* ---------- persistence ---------- */

function seed() {
  return {
    exercises: SEED_EXERCISES, plans: SEED_PLANS, workouts: [],
    unit: "lb", bodyweight: 0, bodyweightLog: [],
  };
}

/* most recent bodyweight, in the unit currently on screen */
function currentBodyweight(data, unit) {
  const log = data.bodyweightLog || [];
  if (!log.length) return data.bodyweight || 0;
  const latest = log.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return round1(convert(latest.weight, latest.unit || "lb", unit));
}

function migrate(data) {
  if (!data) return null;
  const unitFallback = data.unit || "lb";
  return {
    ...seed(),
    ...data,
    exercises: (data.exercises || SEED_EXERCISES).map((e) => ({
      // v1 stored a boolean `bar`; translate it into the new mode field
      mode: e.mode || (e.bar === false ? "machine" : "barbell"),
      ...e,
    })),
    plans: data.plans || SEED_PLANS,
    bodyweightLog: data.bodyweightLog || [],
    workouts: (data.workouts || []).map((w) => ({
      queue: [], planName: "Freestyle",
      ...w,
      sets: w.sets.map((s) => ({ unit: unitFallback, note: "", seconds: 0, ...s })),
    })),
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn("could not read saved data", e); }
  for (const lk of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(lk);
      if (raw) { const m = migrate(JSON.parse(raw)); saveData(m); return m; }
    } catch (e) { /* keep looking */ }
  }
  return null;
}

function saveData(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch (e) { console.error("save failed", e); return false; }
}

/* ============================================================
   PIECES
   ============================================================ */

function BarStrip({ weight, unit }) {
  const { plates, leftover, under } = useMemo(() => platesPerSide(weight, unit), [weight, unit]);
  const spec = PLATE_SPEC[unit];

  if (under)
    return <div className="strip strip--muted"><span className="strip__note">under bar weight ({spec.bar}{unit})</span></div>;

  return (
    <div className="strip">
      <div className="strip__rail" />
      <div className="strip__stack">
        {plates.map((p, i) => (
          <div key={i} className="plate" title={`${p.w}${unit}`}
            style={{ background: p.color, height: `${p.h}%`, width: `${p.wd}px`, animationDelay: `${i * 28}ms` }} />
        ))}
        <div className="collar" />
      </div>
      <div className="strip__meta">
        {plates.length === 0 ? <span>bar only</span>
          : <span>{spec.bar} + {plates.map((p) => p.w).join(" + ")} / side</span>}
        {leftover > 0 && <span className="strip__short">{leftover} short</span>}
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange, step, min, suffix, display }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);

  useEffect(() => { if (editing && ref.current) ref.current.select(); }, [editing]);

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= min) onChange(round1(n));
    setEditing(false);
  };

  return (
    <div className="stepper">
      <div className="stepper__label">{label}</div>
      <div className="stepper__row">
        <button className="stepper__btn" onClick={() => onChange(Math.max(min, round1(value - step)))} aria-label={`decrease ${label}`}>−</button>
        {editing ? (
          <input ref={ref} className="stepper__input" type="number" inputMode="decimal" value={draft}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()} />
        ) : (
          <button className="stepper__value" onClick={() => { setDraft(String(value)); setEditing(true); }}>
            {display ? display(value) : value}
            {suffix && !display && <span className="stepper__suffix">{suffix}</span>}
          </button>
        )}
        <button className="stepper__btn" onClick={() => onChange(round1(value + step))} aria-label={`increase ${label}`}>+</button>
      </div>
    </div>
  );
}

function Spark({ points, color }) {
  if (points.length < 2) return <div className="spark spark--empty">—</div>;
  const w = 96, h = 28, pad = 2;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p - min) / span) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lastY = h - pad - ((points[points.length - 1] - min) / span) * (h - pad * 2);
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={w - pad} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

/* every counted set, sized by influence, with the fitted line reaching back to one rep */
function ProfileChart({ fit }) {
  const { points, a, b, est } = fit;
  const W = 260, H = 100, PL = 30, PR = 10, PT = 12, PB = 20;
  const maxR = Math.max(...points.map((p) => p.reps), 2);
  const loads = [...points.map((p) => p.load), est];
  const loMin = Math.min(...loads), loMax = Math.max(...loads);
  const span = loMax - loMin || 1;
  const x = (r) => PL + ((r - 1) / (maxR - 1)) * (W - PL - PR);
  const y = (l) => PT + (1 - (l - loMin) / span) * (H - PT - PB);

  return (
    <svg className="pchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="every set, with the fitted curve">
      {fit.method === "fit" && (
        <line x1={x(1)} y1={y(a + b)} x2={x(maxR)} y2={y(a + b * maxR)}
          stroke="#D9A521" strokeWidth="1.5" opacity=".5" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={x(p.reps)} cy={y(p.load)} r={2 + p.w * 2.2}
          fill="#EDE8E0" opacity={0.25 + p.w * 0.75} />
      ))}
      <circle cx={x(1)} cy={y(est)} r="4.5" fill="#D9A521" />
      <text x={x(1)} y={y(est) - 9} className="pchart__t" textAnchor="middle">1RM</text>
      <text x={2} y={y(loMax) + 4} className="pchart__t">{Math.round(loMax)}</text>
      <text x={2} y={y(loMin) + 4} className="pchart__t">{Math.round(loMin)}</text>
      <text x={x(1)} y={H - 5} className="pchart__t" textAnchor="middle">1</text>
      <text x={x(maxR)} y={H - 5} className="pchart__t" textAnchor="end">{maxR} reps</text>
    </svg>
  );
}

/* ---------- exercise picker, reused for choose / add / swap ---------- */

function Picker({ data, picker, onPick, onClose, newName, setNewName, newMode, setNewMode, addExercise }) {
  const [q, setQ] = useState("");
  const list = data.exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  // when swapping, float same-muscle-group options to the top
  const sorted = picker.group
    ? [...list].sort((a, b) => (b.group === picker.group) - (a.group === picker.group))
    : list;

  const title = picker.mode === "swap" ? "Swap for"
    : picker.mode === "add" ? "Add to session"
    : picker.mode === "planAdd" ? "Add to plan" : "Choose a lift";

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__in" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__hd">{title}</div>
        {picker.mode === "swap" && <div className="sheet__hint">Equipment taken? Same muscle group listed first.</div>}
        <input className="sheet__search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="sheet__list">
          {sorted.map((ex) => (
            <button key={ex.id} className="sheet__i" onClick={() => onPick(ex.id)}>
              <span>{ex.name}</span>
              <span className="sheet__g">{ex.group} · {MODES[ex.mode]?.label || ex.mode}</span>
            </button>
          ))}
          {sorted.length === 0 && <div className="empty">No match. Add it below.</div>}
        </div>
        <div className="sheet__add">
          <input className="sheet__input" placeholder="New exercise" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExercise()} />
          <select className="sheet__sel" value={newMode} onChange={(e) => setNewMode(e.target.value)}>
            {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="sheet__addb" onClick={addExercise}>Add</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */

export default function SwolleyMammoths() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("today");
  const [openExId, setOpenExId] = useState(null);
  const [picker, setPicker] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planSheet, setPlanSheet] = useState(false);
  const [weight, setWeight] = useState(135);
  const [reps, setReps] = useState(5);
  const [seconds, setSeconds] = useState(60);
  const [note, setNote] = useState("");
  const [rir, setRir] = useState(null);
  const [flash, setFlash] = useState(null);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState("barbell");

  useEffect(() => { setData(loadData() || seed()); }, []);
  useEffect(() => { if (data) saveData(data); }, [data]);

  const unit = data?.unit || "lb";
  const spec = PLATE_SPEC[unit];
  const today = todayKey();

  const bodyweight = useMemo(() => (data ? currentBodyweight(data, unit) : 0), [data, unit]);
  const session = useMemo(() => data?.workouts.find((w) => w.date === today) || null, [data, today]);
  const exById = (id) => data?.exercises.find((e) => e.id === id) || null;
  const openEx = openExId ? exById(openExId) : null;

  const priorSessionFor = (exId) =>
    data.workouts
      .filter((w) => w.date !== today && w.sets.some((s) => s.exerciseId === exId))
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;

  /* the whole of last session, not just the top set */
  const lastSession = useMemo(() => {
    if (!openEx || !data) return null;
    const prior = priorSessionFor(openEx.id);
    if (!prior) return null;
    const sets = prior.sets.filter((s) => s.exerciseId === openEx.id);
    const best = sets.reduce((a, b) =>
      setScore(b, openEx, unit, bodyweight) > setScore(a, openEx, unit, bodyweight) ? b : a);
    return { date: prior.date, sets, best, note: sets.find((s) => s.note)?.note || "" };
  }, [openEx, data, today, unit, bodyweight]);

  const bestEver = useMemo(() => {
    if (!openEx || !data) return 0;
    let best = 0;
    data.workouts.forEach((w) => w.sets.forEach((s) => {
      if (s.exerciseId === openEx.id) best = Math.max(best, setScore(s, openEx, unit, bodyweight));
    }));
    return best;
  }, [openEx, data, unit, bodyweight]);

  const oneRM = useMemo(() => {
    if (!openEx || !data) return null;
    return fit1RM(weightedSets(data.workouts, openEx, unit, bodyweight));
  }, [openEx, data, unit, bodyweight]);

  const todaySets = useMemo(() => {
    if (!session || !openEx) return [];
    return session.sets.filter((s) => s.exerciseId === openEx.id);
  }, [session, openEx]);

  /* ---------- actions ---------- */

  const updateSession = (fn) =>
    setData((d) => ({ ...d, workouts: d.workouts.map((w) => (w.date === today ? fn(w) : w)) }));

  const startSession = (planId) => {
    const plan = planId ? data.plans.find((p) => p.id === planId) : null;
    setData((d) => ({
      ...d,
      workouts: [...d.workouts, {
        id: uid(), date: today, planId: planId || null,
        planName: plan ? plan.name : "Freestyle",
        queue: plan ? plan.items.map((i) => ({ ...i, id: uid() })) : [],
        sets: [],
      }],
    }));
  };

  /* append a plan's exercises to whatever is already in today's queue */
  const loadPlanIntoSession = (planId) => {
    const plan = data.plans.find((p) => p.id === planId);
    if (!plan) return;
    setPlanSheet(false);
    if (!session) { startSession(planId); return; }
    updateSession((w) => ({
      ...w,
      planName: w.queue.length === 0 && w.planName === "Freestyle" ? plan.name : `${w.planName} + ${plan.name}`,
      queue: [...w.queue, ...plan.items.map((i) => ({ ...i, id: uid() }))],
    }));
  };

  const openExercise = (exId) => {
    const ex = exById(exId);
    setOpenExId(exId);
    setNote("");
    setRir(null);
    // seed the entry from last time — most sessions start at the same load
    const prior = priorSessionFor(exId);
    const src = prior?.sets.filter((s) => s.exerciseId === exId).slice(-1)[0];
    if (src) {
      setWeight(wIn(src, unit));
      setReps(src.reps || 8);
      setSeconds(src.seconds || 60);
    } else {
      setWeight(ex?.mode === "bodyweight" ? 0 : ex?.mode === "barbell" ? spec.bar : 0);
      setReps(8);
      setSeconds(60);
    }
  };

  const logSet = () => {
    if (!openEx) return;
    const mode = openEx.mode;
    const set = {
      id: uid(), exerciseId: openEx.id, unit,
      weight, reps: mode === "timed" ? 0 : reps,
      seconds: mode === "timed" ? seconds : 0,
      note: note.trim(), rir, ts: Date.now(),
    };
    const score = setScore(set, openEx, unit, bodyweight);
    const isPR = score > bestEver + 0.01;

    if (!session) {
      setData((d) => ({
        ...d,
        workouts: [...d.workouts, {
          id: uid(), date: today, planId: null, planName: "Freestyle", queue: [], sets: [set],
        }],
      }));
    } else {
      updateSession((w) => ({ ...w, sets: [...w.sets, set] }));
    }
    setNote("");
    setFlash({ pr: isPR, score: round1(score), mode });
    setTimeout(() => setFlash(null), 2600);
  };

  const deleteSet = (setId) => updateSession((w) => ({ ...w, sets: w.sets.filter((s) => s.id !== setId) }));

  const moveQueueItem = (idx, dir) =>
    updateSession((w) => {
      const q = [...w.queue];
      const j = idx + dir;
      if (j < 0 || j >= q.length) return w;
      [q[idx], q[j]] = [q[j], q[idx]];
      return { ...w, queue: q };
    });

  const addExercise = () => {
    const name = newName.trim();
    if (!name) return;
    const ex = { id: uid(), name, group: "Custom", mode: newMode };
    setData((d) => ({ ...d, exercises: [...d.exercises, ex] }));
    setNewName("");
    handlePick(ex.id);
  };

  const handlePick = (exId) => {
    if (!picker) return;
    if (picker.mode === "swap") {
      updateSession((w) => ({
        ...w,
        queue: w.queue.map((q) => (q.id === picker.itemId ? { ...q, exerciseId: exId, swapped: true } : q)),
      }));
    } else if (picker.mode === "add") {
      updateSession((w) => ({
        ...w,
        queue: [...w.queue, { id: uid(), exerciseId: exId, note: "", sets: 3, reps: 8 }],
      }));
    } else if (picker.mode === "planAdd") {
      setEditingPlan((p) => ({ ...p, items: [...p.items, { exerciseId: exId, note: "", sets: 3, reps: 8 }] }));
    } else if (picker.mode === "freestyle") {
      openExercise(exId);
    }
    setPicker(null);
  };

  const toggleUnit = () => {
    const next = unit === "lb" ? "kg" : "lb";
    const step = PLATE_SPEC[next].step;
    const carried = Math.max(0, Math.round(convert(weight, unit, next) / step) * step);
    setData((d) => ({ ...d, unit: next }));
    setWeight(round1(carried));
  };

  const savePlan = () => {
    if (!editingPlan.name.trim()) return;
    setData((d) => ({
      ...d,
      plans: d.plans.some((p) => p.id === editingPlan.id)
        ? d.plans.map((p) => (p.id === editingPlan.id ? editingPlan : p))
        : [...d.plans, editingPlan],
    }));
    setEditingPlan(null);
  };

  const patchPlanItem = (i, patch) =>
    setEditingPlan((p) => {
      const items = [...p.items];
      items[i] = { ...items[i], ...patch };
      return { ...p, items };
    });

  const movePlanItem = (i, dir) =>
    setEditingPlan((p) => {
      const items = [...p.items];
      const j = i + dir;
      if (j < 0 || j >= items.length) return p;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...p, items };
    });

  const logBodyweight = (value) => {
    if (!(value > 0)) return;
    setData((d) => {
      const log = (d.bodyweightLog || []).filter((e) => e.date !== today);
      return { ...d, bodyweightLog: [...log, { date: today, weight: value, unit }] };
    });
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `swolley-mammoths-${today}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) return <div className="app"><style>{CSS}</style><div className="boot">waking the herd…</div></div>;

  const setsDone = (exId) => (session ? session.sets.filter((s) => s.exerciseId === exId).length : 0);
  const pickerEl = picker && (
    <Picker data={data} picker={picker} onPick={handlePick} onClose={() => setPicker(null)}
      newName={newName} setNewName={setNewName} newMode={newMode} setNewMode={setNewMode}
      addExercise={addExercise} />
  );

  /* ============ LOGGING SCREEN ============ */
  if (openEx) {
    const mode = openEx.mode;
    const cfg = MODES[mode];
    const queueItem = session?.queue.find((q) => q.exerciseId === openEx.id);

    return (
      <div className="app">
        <style>{CSS}</style>
        <header className="hd">
          <button className="back" onClick={() => setOpenExId(null)} aria-label="back">‹</button>
          <div className="hd__l">
            <div className="hd__ex">{openEx.name}</div>
            <div className="hd__date">
              {cfg.label}{queueItem?.sets ? ` · target ${queueItem.sets}×${queueItem.reps}` : ""}
            </div>
          </div>
          <button className="hd__unit" onClick={toggleUnit}>{unit}</button>
        </header>

        <main className="body">
          {queueItem?.note && <div className="cue">{queueItem.note}</div>}

          <div className="last">
            {lastSession ? (
              <>
                <div className="last__label">Last time · {daysAgo(lastSession.date)}</div>
                <div className="last__grid">
                  {lastSession.sets.map((s, i) => (
                    <span key={s.id} className={`last__set ${s.id === lastSession.best.id ? "top" : ""}`}>
                      <span className="last__n">{i + 1}</span>{setLabel(s, openEx, unit)}
                    </span>
                  ))}
                </div>
                <div className="last__sub">beat {setLabel(lastSession.best, openEx, unit)} for a new best</div>
                {lastSession.note && <div className="last__note">“{lastSession.note}”</div>}
              </>
            ) : (
              <>
                <div className="last__label">Last time</div>
                <div className="last__none">first entry — this becomes your baseline</div>
              </>
            )}
          </div>

          <div className="entry">
            <div className="entry__steppers">
              {cfg.fields.includes("weight") && (
                <Stepper label="Weight" value={weight} onChange={setWeight} step={spec.step} min={0}
                  suffix={cfg.perHand ? `${unit}/hand` : unit} />
              )}
              {cfg.fields.includes("added") && (
                <Stepper label="Added" value={weight} onChange={setWeight} step={spec.step} min={0} suffix={unit} />
              )}
              {cfg.fields.includes("reps") && (
                <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={1} />
              )}
              {cfg.fields.includes("seconds") && (
                <Stepper label="Time" value={seconds} onChange={setSeconds} step={5} min={5} display={mmss} />
              )}
            </div>

            {cfg.strip && <BarStrip weight={weight} unit={unit} />}

            {mode !== "timed" && (
              <div className="rir">
                <span className="rir__l">Reps left in the tank</span>
                <div className="rir__opts">
                  {[0, 1, 2, 3, 4].map((v) => (
                    <button key={v} className={rir === v ? "on" : ""} onClick={() => setRir(v)}>
                      {v === 4 ? "4+" : v}
                    </button>
                  ))}
                  <button className={rir == null ? "on" : ""} onClick={() => setRir(null)}>?</button>
                </div>
              </div>
            )}

            <input className="notefield" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Note — machine setting, form focus, how it felt" />

            {mode !== "timed" && (
              <div className="proj">
                projected 1RM <b>{round1(epley(weight + (mode === "bodyweight" ? bodyweight : 0), reps))}</b>
                {bestEver > 0 && <span className="proj__best">best {round1(bestEver)}</span>}
              </div>
            )}

            <button className="log" onClick={logSet}>Log set</button>
          </div>

          {flash && (
            <div className={`flash ${flash.pr ? "flash--pr" : ""}`}>
              {flash.pr
                ? (flash.mode === "timed" ? `New best — ${mmss(flash.score)}` : `New best — e1RM ${flash.score}`)
                : "Logged"}
            </div>
          )}

          <section className="sets">
            <div className="sets__hd">
              <span>Today</span>
              <span>{todaySets.length} set{todaySets.length === 1 ? "" : "s"}</span>
            </div>
            {todaySets.length === 0 ? <div className="empty">Nothing logged yet.</div>
              : todaySets.map((s, i) => {
                const beat = lastSession &&
                  setScore(s, openEx, unit, bodyweight) > setScore(lastSession.best, openEx, unit, bodyweight);
                return (
                  <div className="row" key={s.id}>
                    <span className="row__n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="row__main">{setLabel(s, openEx, unit)}</span>
                    {beat && <span className="row__beat" title="beat last session">▲</span>}
                    <span className="row__e1">
                      {mode === "timed" ? mmss(s.seconds) : round1(setScore(s, openEx, unit, bodyweight))}
                    </span>
                    <button className="row__x" onClick={() => deleteSet(s.id)} aria-label="delete set">×</button>
                    {s.note && <div className="row__note">{s.note}</div>}
                  </div>
                );
              })}
          </section>

          {oneRM && mode !== "timed" && (
            <section className="rm">
              <div className="rm__hd">Estimated 1 rep max</div>
              <div className="rm__val">
                {round1(oneRM.est)}<span className="rm__u">{unit}</span>
                <span className="rm__range">{round1(oneRM.lo)}–{round1(oneRM.hi)}</span>
              </div>

              {oneRM.method === "fit" ? (
                <>
                  <div className="rm__sub">
                    weighted across {oneRM.n} sets · {Math.round(oneRM.r2 * 100)}% fit
                  </div>
                  <ProfileChart fit={oneRM} unit={unit} />
                  <div className="rm__insight">
                    Your load drops <b>{(oneRM.dropPerRep * 100).toFixed(1)}%</b> per extra rep.
                    The standard formula assumes 3.3%
                    {oneRM.dropPerRep < 0.028 ? " — your reps hold up better than average."
                      : oneRM.dropPerRep > 0.038 ? " — you fall off faster than average."
                      : "."}
                  </div>
                  {Math.abs(oneRM.epleyEst - oneRM.est) > 5 && (
                    <div className="rm__vs">
                      A single-set formula would say {round1(oneRM.epleyEst)}
                      {oneRM.epleyEst > oneRM.est ? " — too high for your curve." : " — too low for your curve."}
                    </div>
                  )}
                </>
              ) : (
                <div className="rm__sub">
                  Every set so far sits at the same rep count, so there is no curve to fit yet
                  and this falls back to the single-set formula. Log a heavy triple and a set
                  of 8 and it will start using your real numbers.
                </div>
              )}

              {oneRM.assumed && (
                <div className="rm__warn">
                  Some sets have no effort logged, so they count as if taken to failure.
                  That makes this a floor, not a ceiling.
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    );
  }

  /* ============ PLAN EDITOR ============ */
  if (editingPlan) {
    return (
      <div className="app">
        <style>{CSS}</style>
        <header className="hd">
          <button className="back" onClick={() => setEditingPlan(null)} aria-label="back">‹</button>
          <div className="hd__l"><div className="hd__ex">Edit plan</div></div>
          <button className="hd__save" onClick={savePlan}>Save</button>
        </header>
        <main className="body">
          <input className="planname" placeholder="Plan name" value={editingPlan.name}
            onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })} />

          {editingPlan.items.map((it, i) => {
            const ex = exById(it.exerciseId);
            return (
              <div className="pitem" key={i}>
                <div className="pitem__top">
                  <span className="pitem__name">{ex ? ex.name : "—"}</span>
                  <div className="pitem__ctl">
                    <button onClick={() => movePlanItem(i, -1)} aria-label="move up">↑</button>
                    <button onClick={() => movePlanItem(i, 1)} aria-label="move down">↓</button>
                    <button onClick={() => setEditingPlan((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }))}
                      aria-label="remove">×</button>
                  </div>
                </div>
                <div className="pitem__targets">
                  <input type="number" inputMode="numeric" value={it.sets}
                    onChange={(e) => patchPlanItem(i, { sets: +e.target.value })} />
                  <span>sets ×</span>
                  <input type="number" inputMode="numeric" value={it.reps}
                    onChange={(e) => patchPlanItem(i, { reps: +e.target.value })} />
                  <span>reps</span>
                </div>
                <input className="pitem__note" placeholder="Cue — machine, grip, form focus" value={it.note}
                  onChange={(e) => patchPlanItem(i, { note: e.target.value })} />
              </div>
            );
          })}

          <button className="ghost" onClick={() => setPicker({ mode: "planAdd" })}>+ Add exercise</button>
        </main>
        {pickerEl}
      </div>
    );
  }

  /* ============ TABS ============ */
  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="hd">
        <div className="hd__l">
          <div className="hd__title">SWOLLEY <span className="hd__title2">MAMMOTHS</span></div>
          <div className="hd__date">{prettyDate(today)}</div>
        </div>
        <button className="hd__unit" onClick={toggleUnit}>{unit}</button>
      </header>

      <main className="body">
        {tab === "today" && (!session ? (
          <>
            <div className="prompt">Start today's session</div>
            {data.plans.map((p) => (
              <button className="planpick" key={p.id} onClick={() => startSession(p.id)}>
                <span className="planpick__n">{p.name}</span>
                <span className="planpick__m">
                  {p.items.map((i) => exById(i.exerciseId)?.name).filter(Boolean).slice(0, 3).join(" · ")}
                  {p.items.length > 3 ? ` +${p.items.length - 3}` : ""}
                </span>
              </button>
            ))}
            <button className="ghost" onClick={() => startSession(null)}>Freestyle — no plan</button>
          </>
        ) : (
          <>
            <div className="shd">
              <span className="shd__n">{session.planName}</span>
              <span className="shd__m">{session.sets.length} sets logged</span>
            </div>

            {session.queue.map((q, i) => {
              const ex = exById(q.exerciseId);
              const done = setsDone(q.exerciseId);
              const complete = q.sets && done >= q.sets;
              return (
                <div className={`qitem ${complete ? "done" : ""}`} key={q.id}>
                  <button className="qitem__main" onClick={() => openExercise(q.exerciseId)}>
                    <div className="qitem__l">
                      <div className="qitem__name">
                        {ex ? ex.name : "—"}{q.swapped && <span className="qitem__sw">swapped</span>}
                      </div>
                      {q.note && <div className="qitem__note">{q.note}</div>}
                    </div>
                    <div className="qitem__prog">{done}/{q.sets || "–"}</div>
                  </button>
                  <div className="qitem__ctl">
                    <button onClick={() => moveQueueItem(i, -1)} aria-label="move up">↑</button>
                    <button onClick={() => moveQueueItem(i, 1)} aria-label="move down">↓</button>
                    <button className="swap" onClick={() => setPicker({ mode: "swap", itemId: q.id, group: ex?.group })}>swap</button>
                    <button onClick={() => updateSession((w) => ({ ...w, queue: w.queue.filter((x) => x.id !== q.id) }))}
                      aria-label="remove">×</button>
                  </div>
                </div>
              );
            })}

            <button className="ghost" onClick={() => setPlanSheet(true)}>+ Load a plan into this session</button>
            <button className="ghost" onClick={() => setPicker({ mode: "add" })}>+ Add a single exercise</button>
            {session.queue.length === 0 && (
              <div className="empty">Freestyle session — add exercises as you go.</div>
            )}
          </>
        ))}

        {tab === "plans" && (
          <>
            <div className="prompt">Tap a plan to load it into today</div>
            {data.plans.map((p) => (
              <div className="prow" key={p.id}>
                <button className="prow__main" onClick={() => { loadPlanIntoSession(p.id); setTab("today"); }}>
                  <div className="prow__n">{p.name}</div>
                  <div className="prow__m">
                    {p.items.map((i) => exById(i.exerciseId)?.name).filter(Boolean).slice(0, 3).join(" · ")}
                    {p.items.length > 3 ? ` +${p.items.length - 3}` : ""}
                  </div>
                </button>
                <button className="prow__edit" onClick={() => setEditingPlan(JSON.parse(JSON.stringify(p)))}>edit</button>
                <button className="prow__x" aria-label="delete plan"
                  onClick={() => setData((d) => ({ ...d, plans: d.plans.filter((x) => x.id !== p.id) }))}>×</button>
              </div>
            ))}
            <button className="ghost" onClick={() => setEditingPlan({ id: uid(), name: "", items: [] })}>+ New plan</button>
          </>
        )}

        {tab === "lifts" && (
          <>
            <div className="bw">
              <div className="bw__l">
                <div className="bw__hd">Your bodyweight</div>
                <div className="bw__sub">
                  {bodyweight > 0
                    ? "Counted into pull-ups, dips and every bodyweight lift"
                    : "Set this so bodyweight lifts get scored properly"}
                </div>
              </div>
              <div className="bw__ctl">
                <button onClick={() => logBodyweight(Math.max(0, round1(bodyweight - (unit === "kg" ? 0.5 : 1))))}>−</button>
                <span className="bw__v">{bodyweight || "—"}<i>{unit}</i></span>
                <button onClick={() => logBodyweight(round1((bodyweight || (unit === "kg" ? 70 : 155)) + (unit === "kg" ? 0.5 : 1)))}>+</button>
              </div>
            </div>

            {data.exercises.map((ex) => {
              const pts = [];
              data.workouts.slice().sort((a, b) => (a.date > b.date ? 1 : -1)).forEach((w) => {
                const s = w.sets.filter((x) => x.exerciseId === ex.id);
                if (s.length) pts.push(Math.max(...s.map((x) => setScore(x, ex, unit, bodyweight))));
              });
              if (!pts.length) return null;
              const trend = pts.length > 1 ? pts[pts.length - 1] - pts[0] : 0;
              const best = Math.max(...pts);
              return (
                <button className="lift" key={ex.id} onClick={() => openExercise(ex.id)}>
                  <div className="lift__l">
                    <div className="lift__name">{ex.name}</div>
                    <div className="lift__meta">
                      {pts.length} session{pts.length > 1 ? "s" : ""} · best{" "}
                      {ex.mode === "timed" ? mmss(best) : `${round1(best)}${unit}`}
                    </div>
                  </div>
                  <div className="lift__r">
                    <Spark points={pts} color={trend >= 0 ? "#D9A521" : "#7E848E"} />
                    <div className={`lift__d ${trend >= 0 ? "up" : "down"}`}>{trend >= 0 ? "+" : ""}{round1(trend)}</div>
                  </div>
                </button>
              );
            })}
            {data.workouts.length === 0 && <div className="empty">No lifts tracked yet.</div>}
          </>
        )}

        {tab === "history" && (
          <>
            {data.workouts.length === 0 && <div className="empty">No sessions yet.</div>}
            {data.workouts.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((w) => {
              const byEx = {};
              w.sets.forEach((s) => { (byEx[s.exerciseId] = byEx[s.exerciseId] || []).push(s); });
              return (
                <div className="sesh" key={w.id}>
                  <div className="sesh__hd">
                    <span className="sesh__date">{prettyDate(w.date)}</span>
                    <span className="sesh__vol">{w.planName || "Freestyle"}</span>
                  </div>
                  {Object.entries(byEx).map(([exId, sets]) => {
                    const ex = exById(exId);
                    return (
                      <div className="sesh__ex" key={exId}>
                        <div className="sesh__exname">{ex ? ex.name : "—"}</div>
                        <div className="sesh__sets">
                          {sets.map((s) => <span className="chip" key={s.id}>{setLabel(s, ex, unit)}</span>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {data.workouts.length > 0 && <button className="export" onClick={exportJSON}>Export ledger as JSON</button>}
          </>
        )}
      </main>

      <nav className="nav">
        {[["today","Today"],["plans","Plans"],["lifts","Lifts"],["history","History"]].map(([k, l]) => (
          <button key={k} className={`nav__b ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {pickerEl}

      {planSheet && (
        <div className="sheet" onClick={() => setPlanSheet(false)}>
          <div className="sheet__in" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__hd">Load a plan</div>
            <div className="sheet__hint">Its exercises get added to today's list.</div>
            <div className="sheet__list">
              {data.plans.map((p) => (
                <button key={p.id} className="sheet__i" onClick={() => loadPlanIntoSession(p.id)}>
                  <span>{p.name}</span>
                  <span className="sheet__g">{p.items.length} exercises</span>
                </button>
              ))}
              {data.plans.length === 0 && <div className="empty">No plans yet. Build one on the Plans tab.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.app {
  --iron:#1A1D22; --raised:#23272E; --line:#31363F; --chalk:#EDE8E0;
  --dim:#858B96; --gold:#D9A521; --blue:#2C5FA8; --red:#C8322E;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  position:fixed; inset:0; display:flex; flex-direction:column;
  background:var(--iron); color:var(--chalk); font-family:var(--sans);
  -webkit-font-smoothing:antialiased; overflow:hidden;
}
.app *,.app *::before,.app *::after{box-sizing:border-box;}
.app button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}
.app button:focus-visible,.app input:focus-visible,.app select:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.app input,.app select{font-family:var(--sans);}
.boot{margin:auto;color:var(--dim);font-family:var(--mono);font-size:13px;}

.hd{display:flex;align-items:center;gap:12px;padding:calc(15px + env(safe-area-inset-top)) 18px 13px;border-bottom:1px solid var(--line);flex:0 0 auto;}
.hd__l{min-width:0;flex:1;}
.hd__title{font-size:14px;font-weight:750;letter-spacing:.13em;white-space:nowrap;}
.hd__title2{color:var(--gold);}
.hd__ex{font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hd__date{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);margin-top:3px;}
.hd__unit{font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--dim);border:1px solid var(--line);border-radius:4px;padding:4px 8px;text-transform:uppercase;flex:0 0 auto;}
.hd__save{font-size:13px;font-weight:600;color:var(--gold);flex:0 0 auto;}
.back{font-size:26px;line-height:1;color:var(--dim);padding:0 6px 0 0;flex:0 0 auto;}

.body{flex:1 1 auto;overflow-y:auto;padding:16px 18px 28px;}

.prompt{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:10px;}
.planpick{width:100%;text-align:left;padding:15px 16px;background:var(--raised);border:1px solid var(--line);border-radius:8px;margin-bottom:9px;display:block;}
.planpick__n{display:block;font-size:16px;font-weight:600;}
.planpick__m{display:block;font-family:var(--mono);font-size:10.5px;color:var(--dim);margin-top:4px;}
.ghost{width:100%;padding:13px;border:1px dashed var(--line);border-radius:8px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:8px;}

.shd{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:10px;border-bottom:1px solid var(--line);}
.shd__n{font-size:15px;font-weight:600;}
.shd__m{font-family:var(--mono);font-size:10.5px;color:var(--dim);}

.qitem{border-bottom:1px solid var(--line);padding:2px 0 8px;}
.qitem.done .qitem__name{color:var(--dim);}
.qitem__main{width:100%;display:flex;align-items:center;gap:12px;padding:12px 2px 6px;text-align:left;}
.qitem__l{flex:1;min-width:0;}
.qitem__name{font-size:15px;font-weight:550;}
.qitem__sw{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-left:8px;}
.qitem__note{font-size:12px;color:var(--dim);margin-top:3px;line-height:1.4;}
.qitem__prog{font-family:var(--mono);font-size:13px;color:var(--gold);flex:0 0 auto;}
.qitem.done .qitem__prog{color:var(--dim);}
.qitem__ctl{display:flex;gap:4px;}
.qitem__ctl button,.pitem__ctl button{font-family:var(--mono);font-size:11px;color:var(--dim);border:1px solid var(--line);border-radius:4px;padding:5px 10px;}
.qitem__ctl .swap{color:var(--gold);}

.cue{font-size:13px;background:var(--raised);border-left:2px solid var(--blue);padding:10px 12px;border-radius:0 6px 6px 0;margin-bottom:12px;line-height:1.45;}

.last{padding:14px 16px;border-left:2px solid var(--gold);background:linear-gradient(90deg,rgba(217,165,33,.07),transparent 70%);}
.last__label{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);}
.last__grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px;}
.last__set{font-family:var(--mono);font-size:14px;padding:5px 9px;background:#2C313A;border-radius:4px;display:flex;align-items:baseline;gap:6px;}
.last__set.top{background:var(--gold);color:#1A1D22;font-weight:600;}
.last__n{font-size:9px;opacity:.55;}
.last__sub{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:8px;}
.last__note{font-size:12.5px;opacity:.8;margin-top:7px;font-style:italic;line-height:1.45;}
.last__none{font-size:14px;color:var(--dim);margin-top:5px;}

.entry{margin-top:18px;}
.entry__steppers{display:flex;gap:10px;}
.stepper{flex:1;background:var(--raised);border:1px solid var(--line);border-radius:8px;padding:10px 8px 12px;min-width:0;}
.stepper__label{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);text-align:center;}
.stepper__row{display:flex;align-items:center;justify-content:space-between;margin-top:6px;}
.stepper__btn{width:38px;height:38px;border-radius:6px;flex:0 0 auto;font-size:22px;line-height:1;background:#2C313A;transition:background 120ms;}
.stepper__btn:active{background:var(--gold);color:#1A1D22;}
.stepper__value{flex:1;min-width:0;font-family:var(--mono);font-size:22px;font-weight:500;text-align:center;padding:0;}
.stepper__suffix{font-size:10px;color:var(--dim);margin-left:2px;}
.stepper__input{flex:1;width:100%;min-width:0;background:transparent;border:none;font-family:var(--mono);font-size:22px;text-align:center;color:var(--gold);}
.stepper__input::-webkit-outer-spin-button,.stepper__input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}

.strip{margin-top:12px;padding:12px 14px;background:var(--raised);border:1px solid var(--line);border-radius:8px;position:relative;}
.strip--muted{display:flex;align-items:center;justify-content:center;min-height:62px;}
.strip__note{font-family:var(--mono);font-size:11px;color:var(--dim);}
.strip__rail{position:absolute;left:14px;right:14px;top:40px;height:5px;background:#4A505B;border-radius:3px;}
.strip__stack{position:relative;display:flex;align-items:center;height:62px;gap:2px;padding-left:26px;}
.plate{border-radius:2px;flex:0 0 auto;animation:slide 220ms ease-out both;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35);}
.collar{width:7px;height:26%;background:#5A616D;border-radius:2px;margin-left:3px;}
@keyframes slide{from{opacity:0;transform:translateX(14px);}to{opacity:1;transform:none;}}
.strip__meta{font-family:var(--mono);font-size:10.5px;color:var(--dim);margin-top:4px;display:flex;gap:10px;}
.strip__short{color:var(--red);}

.notefield,.planname,.pitem__note,.sheet__search{width:100%;background:var(--raised);border:1px solid var(--line);border-radius:8px;padding:12px;color:var(--chalk);font-size:14px;margin-top:12px;}
.notefield::placeholder,.planname::placeholder,.pitem__note::placeholder,.sheet__search::placeholder{color:var(--dim);}
.planname{font-size:17px;font-weight:600;margin-top:0;}

.proj{font-family:var(--mono);font-size:12px;color:var(--dim);margin-top:12px;display:flex;gap:12px;align-items:baseline;}
.proj b{color:var(--chalk);font-size:15px;font-weight:500;}
.proj__best{margin-left:auto;color:var(--gold);}

.log{width:100%;margin-top:12px;padding:17px;background:var(--chalk);color:#1A1D22;border-radius:8px;font-size:15px;font-weight:650;transition:transform 90ms;}
.log:active{transform:scale(.985);}

.flash{margin-top:10px;padding:10px 14px;border-radius:6px;font-family:var(--mono);font-size:11.5px;background:#2C313A;color:var(--dim);animation:rise 240ms ease-out both;}
.flash--pr{background:var(--gold);color:#1A1D22;font-weight:600;}
@keyframes rise{from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:none;}}

.sets{margin-top:26px;}
.sets__hd{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);padding-bottom:8px;border-bottom:1px solid var(--line);}
.row{display:flex;align-items:baseline;gap:12px;padding:13px 2px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
.row__n{font-family:var(--mono);font-size:11px;color:var(--dim);}
.row__main{font-family:var(--mono);font-size:17px;}
.row__beat{color:var(--gold);font-size:11px;}
.row__e1{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--gold);}
.row__x{color:var(--dim);font-size:20px;padding:0 4px;line-height:1;}
.row__note{flex-basis:100%;font-size:12px;color:var(--dim);padding-left:23px;line-height:1.4;margin-top:2px;}
.empty{font-family:var(--mono);font-size:12px;color:var(--dim);padding:20px 2px;line-height:1.6;}

.rir{margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.rir__l{font-family:var(--mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--dim);}
.rir__opts{display:flex;gap:5px;margin-left:auto;}
.rir__opts button{font-family:var(--mono);font-size:12px;min-width:34px;padding:7px 0;border:1px solid var(--line);border-radius:5px;color:var(--dim);}
.rir__opts button.on{background:var(--gold);color:#1A1D22;border-color:var(--gold);font-weight:600;}

.rm{margin-top:26px;padding:16px;background:var(--raised);border:1px solid var(--line);border-radius:10px;}
.rm__hd{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);}
.rm__val{font-family:var(--mono);font-size:38px;font-weight:500;letter-spacing:-.02em;margin-top:4px;display:flex;align-items:baseline;gap:4px;}
.rm__u{font-size:14px;color:var(--dim);}
.rm__range{margin-left:auto;font-size:12px;color:var(--dim);}
.rm__sub{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:2px;line-height:1.6;}
.pchart{width:100%;height:auto;margin-top:12px;display:block;}
.pchart__t{font-family:var(--mono);font-size:8px;fill:#858B96;}
.rm__insight{font-size:12.5px;line-height:1.55;margin-top:10px;padding-top:10px;border-top:1px solid var(--line);}
.rm__insight b{color:var(--gold);font-family:var(--mono);}
.rm__vs{font-size:12px;color:var(--dim);margin-top:6px;line-height:1.5;}
.rm__warn{font-size:11.5px;color:var(--dim);margin-top:10px;padding-left:9px;border-left:2px solid var(--red);line-height:1.5;}

.bw{display:flex;align-items:center;gap:12px;padding:14px 15px;background:var(--raised);border:1px solid var(--line);border-radius:9px;margin-bottom:16px;}
.bw__l{flex:1;min-width:0;}
.bw__hd{font-size:14px;font-weight:600;}
.bw__sub{font-size:11.5px;color:var(--dim);margin-top:3px;line-height:1.4;}
.bw__ctl{display:flex;align-items:center;gap:4px;flex:0 0 auto;}
.bw__ctl button{width:34px;height:34px;border-radius:6px;background:#2C313A;font-size:19px;line-height:1;}
.bw__v{font-family:var(--mono);font-size:19px;min-width:58px;text-align:center;}
.bw__v i{font-size:10px;color:var(--dim);font-style:normal;margin-left:1px;}
.prow__edit{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);border:1px solid var(--line);border-radius:4px;padding:5px 9px;margin-right:4px;}

.prow{display:flex;align-items:center;border-bottom:1px solid var(--line);}
.prow__main{flex:1;text-align:left;padding:15px 2px;}
.prow__n{font-size:15px;font-weight:550;}
.prow__m{font-family:var(--mono);font-size:10.5px;color:var(--dim);margin-top:3px;}
.prow__x{color:var(--dim);font-size:20px;padding:0 8px;}

.pitem{background:var(--raised);border:1px solid var(--line);border-radius:8px;padding:12px;margin-top:10px;}
.pitem__top{display:flex;align-items:center;gap:8px;}
.pitem__name{flex:1;font-size:14.5px;font-weight:550;}
.pitem__ctl{display:flex;gap:4px;}
.pitem__targets{display:flex;align-items:center;gap:7px;margin-top:9px;font-family:var(--mono);font-size:11px;color:var(--dim);}
.pitem__targets input{width:52px;background:#1A1D22;border:1px solid var(--line);border-radius:4px;padding:7px;color:var(--chalk);font-family:var(--mono);font-size:13px;text-align:center;}
.pitem__note{margin-top:9px;font-size:13px;padding:9px;}

.lift{width:100%;display:flex;align-items:center;gap:14px;padding:15px 2px;border-bottom:1px solid var(--line);text-align:left;}
.lift__l{flex:1;min-width:0;}
.lift__name{font-size:15px;font-weight:550;}
.lift__meta{font-family:var(--mono);font-size:10.5px;color:var(--dim);margin-top:3px;}
.lift__r{display:flex;align-items:center;gap:10px;flex:0 0 auto;}
.spark{width:96px;height:28px;}
.spark--empty{color:var(--dim);font-family:var(--mono);font-size:12px;text-align:center;}
.lift__d{font-family:var(--mono);font-size:12px;min-width:44px;text-align:right;}
.lift__d.up{color:var(--gold);} .lift__d.down{color:var(--dim);}

.sesh{padding:16px 0;border-bottom:1px solid var(--line);}
.sesh__hd{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;color:var(--dim);}
.sesh__date{color:var(--chalk);}
.sesh__ex{margin-top:12px;}
.sesh__exname{font-size:13.5px;font-weight:550;}
.sesh__sets{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.chip{font-family:var(--mono);font-size:11.5px;padding:4px 8px;background:var(--raised);border:1px solid var(--line);border-radius:4px;}
.export{width:100%;margin-top:22px;padding:13px;border:1px solid var(--line);border-radius:8px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);}

.nav{display:flex;border-top:1px solid var(--line);background:var(--iron);flex:0 0 auto;}
.nav__b{flex:1;padding:15px 0 calc(20px + env(safe-area-inset-bottom));font-family:var(--mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--dim);border-top:2px solid transparent;}
.nav__b.on{color:var(--chalk);border-top-color:var(--gold);}

.sheet{position:fixed;inset:0;background:rgba(10,12,15,.72);display:flex;align-items:flex-end;z-index:20;animation:fade 140ms ease-out;}
.sheet__in{width:100%;max-height:88%;display:flex;flex-direction:column;background:var(--raised);border-top:1px solid var(--line);border-radius:14px 14px 0 0;animation:up 200ms cubic-bezier(.2,.8,.3,1);}
@keyframes fade{from{opacity:0;}to{opacity:1;}}
@keyframes up{from{transform:translateY(24px);}to{transform:none;}}
.sheet__hd{padding:18px 18px 6px;font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);}
.sheet__hint{padding:0 18px 4px;font-size:12px;color:var(--gold);}
.sheet__search{margin:8px 18px 10px;width:auto;}
.sheet__list{overflow-y:auto;flex:1 1 auto;}
.sheet__i{width:100%;display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:14px 18px;text-align:left;font-size:15px;border-bottom:1px solid var(--line);}
.sheet__g{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);flex:0 0 auto;}
.sheet__add{display:flex;gap:6px;padding:12px 18px calc(26px + env(safe-area-inset-bottom));flex:0 0 auto;}
.sheet__input{flex:1;min-width:0;background:#1A1D22;border:1px solid var(--line);border-radius:6px;padding:11px;color:var(--chalk);font-size:14px;}
.sheet__sel{background:#1A1D22;border:1px solid var(--line);border-radius:6px;color:var(--chalk);font-size:12px;padding:0 6px;}
.sheet__addb{padding:11px 15px;background:var(--chalk);color:#1A1D22;border-radius:6px;font-weight:600;font-size:14px;}

@media (prefers-reduced-motion: reduce){.app *,.app *::before,.app *::after{animation:none!important;transition:none!important;}}
`;

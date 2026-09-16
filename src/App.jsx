import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  MODES, SCHEMES, CAPABILITIES, CAPABILITY_COLORS, GOAL_TEMPLATES, PLATE_SPEC,
  epley, round1, uid, convert, wIn, mmss, parseMMSS, todayKey, prettyDate, daysAgo,
  platesPerSide, setLabel, setScore, isCounted, estimate1RM, bestScore,
  seed, currentBodyweight, migrate,
  canArmTarget, pace, bodyweightAdjustedStrength, coachInsights,
  goalVerdict, evaluatePlanOnSave, balancedScorecard, rankedChanges, goalProgressTrend,
  describeCapabilities, mostTrainedExercise, topVerdict,
  needsBackupReminder, importData, generateWarmupRamp, planAllItems,
  equivalentLoad, substitutedPoints, adherence, sessionSummary,
  weeklyCapabilityStatus,
} from "./logic.js";

/* a small colored dot for an exercise's primary capability — the
   capability taxonomy exists in the data model but was invisible in
   the UI; this is the minimal way to surface it without relying on
   color alone (always paired with the exercise/goal name as text) */
function CapDot({ capability }) {
  if (!capability) return null;
  const color = CAPABILITY_COLORS[capability];
  return <span className="capdot" style={{ background: color }} title={CAPABILITIES[capability]} />;
}

/* the scorecard's volume rows use human labels ("pressing", "quad-dominant", …)
   rather than raw capability keys — map each to a representative capability
   so its dot matches the same color used everywhere else for that pattern */
const SCORECARD_LABEL_CAP = {
  pressing: "horizontal_press", pulling: "horizontal_pull",
  "quad-dominant": "squat", "hip-hinge": "hinge",
  horizontal: "horizontal_press", vertical: "vertical_press",
};

/* the "new best" flash reads differently depending on what was just
   logged — an e1RM, a pace, or a conditioning score are not the same
   kind of number and shouldn't share one label */
function flashLabel(flash) {
  const { scheme, mode, score } = flash;
  if (scheme === "amrap") return `New best — ${round1(score)} reps/min`;
  if (scheme === "emom") return `New best — ${round1(score)} total reps`;
  if (mode === "cardio") return `New best pace — ${round1(score)} mi/min`;
  if (mode === "timed") return `New best — ${mmss(score)}`;
  return `New best — e1RM ${score}`;
}

/* ============================================================
   SWOLLEY MAMMOTHS — Phase 4
   The Coach evaluation engine: plan-aware goal verdicts, plan-save
   critique, and a balanced scorecard. All of the math lives in
   src/logic.js as pure functions — this file is UI and storage only.
   ============================================================ */

const KEY = "swolleymammoths:v2";
const LEGACY_KEYS = ["swolleymammoths:v1", "ironledger:v1"];

/* ---------- the only two functions that touch storage ---------- */

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

/* toDraft/fromDraft let a stepper round-trip through a display format
   other than a bare number — e.g. time fields show/edit "35:30"
   rather than a raw seconds count. Without fromDraft, a plain number
   input is used (so the numeric keypad still shows on mobile); with
   it, the input is text (a number input silently drops ":" on most
   mobile keyboards, which is the bug this exists to avoid). */
function Stepper({ label, value, onChange, step, min, suffix, display, toDraft, fromDraft }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);

  useEffect(() => { if (editing && ref.current) ref.current.select(); }, [editing]);

  const commit = () => {
    const n = (fromDraft || parseFloat)(draft);
    if (!isNaN(n) && n >= min) onChange(round1(n));
    setEditing(false);
  };

  return (
    <div className="stepper">
      <div className="stepper__label">{label}</div>
      <div className="stepper__row">
        <button className="stepper__btn" onClick={() => onChange(Math.max(min, round1(value - step)))} aria-label={`decrease ${label}`}>−</button>
        {editing ? (
          <input ref={ref} className="stepper__input" type={fromDraft ? "text" : "number"}
            inputMode={fromDraft ? "text" : "decimal"} value={draft}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()} />
        ) : (
          <button className="stepper__value" onClick={() => { setDraft((toDraft || String)(value)); setEditing(true); }}>
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

function Picker({ data, unit, picker, onPick, onClose, newName, setNewName, newMode, setNewMode, newCap, setNewCap, addExercise }) {
  const [q, setQ] = useState("");
  const list = data.exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  const sorted = picker.group
    ? [...list].sort((a, b) => (b.group === picker.group) - (a.group === picker.group))
    : list;

  const title = picker.mode === "swap" ? "Swap for"
    : picker.mode === "add" ? "Add to session"
    : picker.mode === "planAdd" ? "Add to plan" : "Choose a lift";

  /* §8.3 — ranked alternatives show a converted equivalent load,
     from your own history where you have it, a labeled estimate
     otherwise */
  const fromEx = picker.mode === "swap" ? data.exercises.find((e) => e.id === picker.fromExerciseId) : null;
  const fromBest = fromEx ? bestScore(data.workouts, fromEx.id, fromEx, unit, currentBodyweight(data, unit)) : 0;

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__in" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__hd">{title}</div>
        {picker.mode === "swap" && <div className="sheet__hint">Equipment taken? Same muscle group listed first.</div>}
        <input className="sheet__search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="sheet__list">
          {sorted.map((ex) => {
            const samePattern = fromEx && ex.capabilities?.some((c) => fromEx.capabilities?.includes(c));
            const conv = samePattern && fromBest > 0 && ex.id !== fromEx.id
              ? equivalentLoad(fromBest, fromEx.id, ex.id, data, unit) : null;
            return (
              <button key={ex.id} className="sheet__i" onClick={() => onPick(ex.id)}>
                <span className="sheet__iname"><CapDot capability={ex.capabilities?.[0]} />{ex.name}</span>
                <span className="sheet__g">
                  {conv ? `≈${conv.value}${unit}${conv.estimate ? " (est.)" : ""}` : `${ex.group} · ${MODES[ex.mode]?.label || ex.mode}`}
                </span>
              </button>
            );
          })}
          {sorted.length === 0 && <div className="empty">No match. Add it below.</div>}
        </div>
        <div className="sheet__add">
          <input className="sheet__input" placeholder="New exercise" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExercise()} />
          <select className="sheet__sel" value={newMode} onChange={(e) => setNewMode(e.target.value)}>
            {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="sheet__sel" value={newCap} onChange={(e) => setNewCap(e.target.value)}>
            <option value="">no pattern</option>
            {Object.entries(CAPABILITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="sheet__addb" onClick={addExercise}>Add</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Coach: verdict card + goal creation/arming ---------- */

function VerdictCard({ verdict, onArm, canArm, trends }) {
  const { goal, status, headline, pace: p } = verdict;
  return (
    <div className={`verdict verdict--${status}`}>
      <div className="verdict__top">
        <span className={`verdict__dot verdict__dot--${status}`} aria-hidden="true" />
        <span className="verdict__label">{goal.label}</span>
        {goal.capabilities?.length > 0 && (
          <span className="verdict__caps">{goal.capabilities.map((c) => <CapDot key={c} capability={c} />)}</span>
        )}
      </div>
      <div className="verdict__headline">{headline}</div>
      {p && p.gap != null && p.outcome == null && (
        <div className="verdict__num">
          {p.onPace
            ? `${round1(p.current)} now · ${round1(p.requiredPerWeekNow)}/wk keeps it`
            : `behind by ${round1(Math.abs(p.gap))} · need ${round1(Math.abs(p.requiredPerWeekNow))}/wk from here`}
        </div>
      )}
      {/* the structural verdict above says whether the plan reaches this
          goal; this says whether it's actually working — the same
          best-score trend the Lifts tab shows, pulled up here so you
          don't have to go check each lift yourself (§8.5d). */}
      {trends && trends.length > 0 && (
        <div className="verdict__trends">
          {trends.map((t) => (
            <span className={`verdict__trend ${t.trend >= 0 ? "up" : "down"}`} key={t.capability}>
              {t.exerciseName} {t.trend >= 0 ? "+" : ""}{t.trend}
            </span>
          ))}
        </div>
      )}
      {canArm && !goal.target && (
        <button className="verdict__arm" onClick={() => onArm(goal.id)}>+ Set a target</button>
      )}
    </div>
  );
}

function GoalSheet({ data, unit, onSave, onClose }) {
  const [templateId, setTemplateId] = useState(GOAL_TEMPLATES[0].id);
  const [label, setLabel_] = useState("");
  const [caps, setCaps] = useState(new Set(GOAL_TEMPLATES[0].capabilities));
  const [liftExerciseId, setLiftExerciseId] = useState("");
  const template = GOAL_TEMPLATES.find((t) => t.id === templateId);

  const pickTemplate = (id) => {
    setTemplateId(id);
    const t = GOAL_TEMPLATES.find((x) => x.id === id);
    setCaps(new Set(t.capabilities));
  };
  const toggleCap = (c) =>
    setCaps((prev) => { const next = new Set(prev); next.has(c) ? next.delete(c) : next.add(c); return next; });

  const save = () => {
    const goal = {
      id: uid(), templateId, label: label.trim() || template.label,
      capabilities: [...caps], target: null, createdAt: todayKey(),
      liftExerciseId: template.targetKind === "lift" ? (liftExerciseId || null) : null,
    };
    onSave(goal);
  };

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__in" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__hd">What are you working toward?</div>
        <div className="sheet__list goal__templates">
          {GOAL_TEMPLATES.map((t) => (
            <button key={t.id} className={`goal__tpl ${t.id === templateId ? "on" : ""}`} onClick={() => pickTemplate(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {templateId === "stronger" && (
          <select className="sheet__sel goal__liftpick" value={liftExerciseId} onChange={(e) => setLiftExerciseId(e.target.value)}>
            <option value="">Which lift? (optional, for a numeric target later)</option>
            {data.exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        )}
        <input className="sheet__input goal__label" placeholder="Name this goal (optional)" value={label} onChange={(e) => setLabel_(e.target.value)} />
        <div className="sheet__hint">Capabilities this goal needs — the Coach checks your plans against these.</div>
        <div className="goal__caps">
          {Object.entries(CAPABILITIES).map(([k, v]) => (
            <button key={k} className={`goal__cap ${caps.has(k) ? "on" : ""}`} onClick={() => toggleCap(k)}
              style={caps.has(k) ? { background: CAPABILITY_COLORS[k], borderColor: CAPABILITY_COLORS[k], color: "#1A1D22" } : { borderColor: CAPABILITY_COLORS[k], color: CAPABILITY_COLORS[k] }}>
              {v}
            </button>
          ))}
        </div>
        <button className="sheet__addb goal__save" onClick={save}>Add goal</button>
      </div>
    </div>
  );
}

function ArmTargetSheet({ goal, data, unit, onSave, onClose }) {
  const template = GOAL_TEMPLATES.find((t) => t.id === goal.templateId);
  const currentBW = currentBodyweight(data, unit);
  const liftEx = goal.liftExerciseId ? data.exercises.find((e) => e.id === goal.liftExerciseId) : null;
  const currentLift = liftEx ? estimate1RM(data.workouts, liftEx, unit, currentBW) : null;
  const baselineValue = template.targetKind === "bodyweight" ? currentBW : currentLift?.est || 0;

  const [value, setValue] = useState(round1(baselineValue + (template.targetKind === "bodyweight" ? -10 : 10)));
  const [deadline, setDeadline] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 56); return todayKey(d);
  });

  const save = () => {
    onSave(goal.id, {
      kind: template.targetKind, exerciseId: goal.liftExerciseId || null,
      value, deadline, baseline: { value: round1(baselineValue), date: todayKey() },
    });
  };

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__in" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__hd">Set a target — {goal.label}</div>
        <div className="sheet__hint">Baseline: {round1(baselineValue)}{template.targetKind === "bodyweight" ? unit : unit} as of today.</div>
        <div className="goal__armrow">
          <label>Target</label>
          <input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="goal__armrow">
          <label>By</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <button className="sheet__addb goal__save" onClick={save}>Save target</button>
      </div>
    </div>
  );
}

/* §8.1 — edit a logged set in place. AMRAP/EMOM's timing fields
   aren't editable here (delete + re-log covers that rare case);
   weight, reps/seconds/distance, note, warmup, and pain are. */
function EditSetSheet({ set, ex, unit, spec, onSave, onClose }) {
  const [weight, setWeight] = useState(set.weight || 0);
  const [reps, setReps] = useState(set.reps || 0);
  const [seconds, setSeconds] = useState(set.seconds || 0);
  const [distance, setDistance] = useState(set.distance || 0);
  const [note, setNote] = useState(set.note || "");
  const [warmup, setWarmup] = useState(!!set.warmup);
  const [pain, setPain] = useState(!!set.pain);
  const scheme = set.scheme || "straight";
  const cfg = MODES[ex.mode] || MODES.barbell;

  const save = () => onSave(set.id, { weight, reps, seconds, distance, note: note.trim(), warmup, pain });

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__in" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__hd">Edit set</div>
        {scheme !== "straight" ? (
          <div className="sheet__hint">
            AMRAP/EMOM timing isn't editable here — delete and re-log to change it. You can still edit the note or flags below.
          </div>
        ) : (
          <div className="entry__steppers" style={{ padding: "0 18px" }}>
            {(cfg.fields.includes("weight") || cfg.fields.includes("added")) && (
              <Stepper label={cfg.fields.includes("added") ? "Added" : "Weight"} value={weight} onChange={setWeight}
                step={spec.step} min={0} suffix={cfg.perHand ? `${unit}/hand` : unit} />
            )}
            {cfg.fields.includes("reps") && <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={0} />}
            {cfg.fields.includes("distance") && <Stepper label="Distance" value={distance} onChange={setDistance} step={0.1} min={0} suffix="mi" />}
            {cfg.fields.includes("seconds") && (
              <Stepper label="Time" value={seconds} onChange={setSeconds} step={5} min={0} display={mmss} toDraft={mmss} fromDraft={parseMMSS} />
            )}
          </div>
        )}
        <input className="notefield" style={{ margin: "12px 18px", width: "calc(100% - 36px)" }} value={note}
          onChange={(e) => setNote(e.target.value)} placeholder="Note" />
        <div className="flags" style={{ padding: "0 18px" }}>
          <button className={`flags__b ${warmup ? "on" : ""}`} onClick={() => setWarmup((v) => !v)}>Warmup</button>
          <button className={`flags__b flags__b--pain ${pain ? "on" : ""}`} onClick={() => setPain((v) => !v)}>⚠ Pain</button>
        </div>
        <button className="sheet__addb goal__save" onClick={save}>Save changes</button>
      </div>
    </div>
  );
}

/* §6.1 step 6 — rest countdown against the plan's prescribed rest,
   with +30s/skip and a vibration at zero. Owns its own interval so
   the parent only needs to hand it an end time. */
function RestTimer({ endAt, total, onExtend, onSkip }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.round((endAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0 && navigator.vibrate) navigator.vibrate(400);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endAt]);

  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <div className="resttimer">
      <div className="resttimer__bar"><div className="resttimer__fill" style={{ width: `${pct * 100}%` }} /></div>
      <div className="resttimer__row">
        <span className="resttimer__time">{remaining > 0 ? mmss(remaining) : "Rest done"}</span>
        <div className="resttimer__ctl">
          <button onClick={onExtend}>+30s</button>
          <button onClick={onSkip}>Skip</button>
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
  const [warmupFlag, setWarmupFlag] = useState(false);
  const [painFlag, setPainFlag] = useState(false);
  const [scheme, setScheme] = useState("straight");
  const [distance, setDistance] = useState(0);
  const [heartRate, setHeartRate] = useState("");
  const [capMinutes, setCapMinutes] = useState(20);
  const [totalReps, setTotalReps] = useState(0);
  const [intervalMinutes, setIntervalMinutes] = useState(1);
  const [totalIntervals, setTotalIntervals] = useState(8);
  const [repsPerInterval, setRepsPerInterval] = useState(10);
  const [missedIntervals, setMissedIntervals] = useState(0);
  const [flash, setFlash] = useState(null);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState("barbell");
  const [newCap, setNewCap] = useState("");
  const [goalSheet, setGoalSheet] = useState(false);
  const [armingGoalId, setArmingGoalId] = useState(null);
  const [planCritique, setPlanCritique] = useState(null);
  const [editingSetId, setEditingSetId] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);
  const [rest, setRest] = useState(null); // { endAt, total } | null
  const [dayPicker, setDayPicker] = useState(null); // { planId, action: "start" | "load" } | null
  const [activeDay, setActiveDay] = useState(0); // which day of a multi-day program is being edited
  const [showSummary, setShowSummary] = useState(false);

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

  /* the whole of last session, not just the top set — scheme-matched,
     so a straight-set comparison never gets mixed with an AMRAP score
     logged on the same exercise */
  const lastSession = useMemo(() => {
    if (!openEx || !data) return null;
    const matches = (s) => s.exerciseId === openEx.id && (s.scheme || "straight") === scheme;
    const prior = data.workouts
      .filter((w) => w.date !== today && w.sets.some(matches))
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!prior) return null;
    const sets = prior.sets.filter(matches);
    const best = sets.reduce((a, b) =>
      setScore(b, openEx, unit, bodyweight) > setScore(a, openEx, unit, bodyweight) ? b : a);
    return { date: prior.date, sets, best, note: sets.find((s) => s.note)?.note || "" };
  }, [openEx, data, today, unit, bodyweight, scheme]);

  const bestEver = useMemo(() => {
    if (!openEx || !data) return 0;
    return bestScore(data.workouts, openEx.id, openEx, unit, bodyweight, { scheme });
  }, [openEx, data, unit, bodyweight, scheme]);

  const oneRM = useMemo(() => {
    if (!openEx || !data) return null;
    return estimate1RM(data.workouts, openEx, unit, bodyweight);
  }, [openEx, data, unit, bodyweight]);

  /* §8.4 — "+40lb on +3lb bodyweight" vs "+40lb on +15lb bodyweight" are
     different outcomes; only meaningful for loaded lifts, not bodyweight
     movements (where the score already folds bodyweight in) or cardio/timed */
  const bwStrength = useMemo(() => {
    if (!openEx || !data || !["barbell", "dumbbell", "machine"].includes(openEx.mode)) return null;
    return bodyweightAdjustedStrength(data, openEx, unit);
  }, [openEx, data, unit]);

  const todaySets = useMemo(() => {
    if (!session || !openEx) return [];
    return session.sets.filter((s) => s.exerciseId === openEx.id);
  }, [session, openEx]);

  /* ---------- Coach: goal verdicts + balanced scorecard ---------- */

  const goalVerdicts = useMemo(() => {
    if (!data) return [];
    return (data.goals || []).map((g) => goalVerdict(g, data, unit));
  }, [data, unit]);

  const scorecard = useMemo(() => {
    if (!data) return null;
    const pressId = mostTrainedExercise(data.workouts, data.exercises, "horizontal_press");
    const pullId = mostTrainedExercise(data.workouts, data.exercises, "horizontal_pull");
    const pairs = pressId && pullId ? [[pressId, pullId]] : [];
    return balancedScorecard(data, unit, { pairs });
  }, [data, unit]);

  const changes = useMemo(() => {
    if (!data || !scorecard) return [];
    return rankedChanges(goalVerdicts, scorecard);
  }, [data, goalVerdicts, scorecard]);

  const insights = useMemo(() => (data ? coachInsights(data, unit) : []), [data, unit]);

  const adherenceInfo = useMemo(() => (data ? adherence(data, {}) : null), [data]);

  const weekStatus = useMemo(() => (data ? weeklyCapabilityStatus(data, unit) : null), [data, unit]);

  const goalTrends = useMemo(() => {
    const map = {};
    if (!data) return map;
    (data.goals || []).forEach((g) => { map[g.id] = goalProgressTrend(g, data, unit); });
    return map;
  }, [data, unit]);

  const homeVerdict = useMemo(() => (data ? topVerdict(data, unit) : null), [data, unit]);

  /* ---------- actions ---------- */

  const updateSession = (fn) =>
    setData((d) => ({ ...d, workouts: d.workouts.map((w) => (w.date === today ? fn(w) : w)) }));

  /* §8.3 — a multi-day program's `dayId` picks which day's items load;
     omitted for a plain single-day plan (or a program's only day) */
  const startSession = (planId, dayId) => {
    const plan = planId ? data.plans.find((p) => p.id === planId) : null;
    const day = dayId && plan?.days?.find((d) => d.id === dayId);
    const items = day ? day.items : plan?.items || [];
    setData((d) => ({
      ...d,
      workouts: [...d.workouts, {
        id: uid(), date: today, planId: planId || null,
        planName: plan ? (day ? `${plan.name} — ${day.name}` : plan.name) : "Freestyle",
        queue: plan ? items.map((i) => ({ ...i, id: uid() })) : [],
        sets: [],
      }],
    }));
  };

  /* append a plan's (or one day's) exercises to whatever is already in today's queue */
  const loadPlanIntoSession = (planId, dayId) => {
    const plan = data.plans.find((p) => p.id === planId);
    if (!plan) return;
    const day = dayId && plan.days?.find((d) => d.id === dayId);
    const items = day ? day.items : plan.items || [];
    const label = day ? `${plan.name} — ${day.name}` : plan.name;
    setPlanSheet(false);
    if (!session) { startSession(planId, dayId); return; }
    updateSession((w) => ({
      ...w,
      planName: w.queue.length === 0 && w.planName === "Freestyle" ? label : `${w.planName} + ${label}`,
      queue: [...w.queue, ...items.map((i) => ({ ...i, id: uid() }))],
    }));
  };

  /* a plan with 2+ days needs a day choice first; a plain plan (or a
     program with just one day) starts/loads immediately as before */
  const pickOrStart = (plan, action) => {
    if (plan.days && plan.days.length > 1) { setDayPicker({ planId: plan.id, action }); return; }
    const dayId = plan.days?.[0]?.id;
    if (action === "start") startSession(plan.id, dayId);
    else { loadPlanIntoSession(plan.id, dayId); setTab("today"); }
  };

  const planSummary = (p) => {
    if (p.days && p.days.length > 1) return `${p.days.length}-day program`;
    const items = planAllItems(p);
    const names = items.map((i) => exById(i.exerciseId)?.name).filter(Boolean).slice(0, 3).join(" · ");
    return items.length > 3 ? `${names} +${items.length - 3}` : names;
  };

  const openExercise = (exId) => {
    const ex = exById(exId);
    setOpenExId(exId);
    setNote("");
    setRir(null);
    setWarmupFlag(false);
    setPainFlag(false);
    setRest(null);
    const prior = priorSessionFor(exId);
    const src = prior?.sets.filter((s) => s.exerciseId === exId).slice(-1)[0];
    if (src) {
      setWeight(wIn(src, unit));
      setReps(src.reps || 8);
      setSeconds(src.seconds || 60);
      setScheme(src.scheme || "straight");
      setDistance(src.distance || 0);
      setHeartRate(src.heartRate ?? "");
      setCapMinutes(src.capMinutes || 20);
      setTotalReps(src.totalReps || 0);
      setIntervalMinutes(src.intervalMinutes || 1);
      setTotalIntervals(src.totalIntervals || 8);
      setRepsPerInterval(src.repsPerInterval || 10);
      setMissedIntervals(src.missedIntervals || 0);
    } else {
      setWeight(ex?.mode === "bodyweight" ? 0 : ex?.mode === "barbell" ? spec.bar : 0);
      setReps(8);
      setSeconds(60);
      setScheme("straight");
      setDistance(0);
      setHeartRate("");
      setCapMinutes(20);
      setTotalReps(0);
      setIntervalMinutes(1);
      setTotalIntervals(8);
      setRepsPerInterval(10);
      setMissedIntervals(0);
    }
  };

  const logSet = () => {
    if (!openEx) return;
    const mode = openEx.mode;
    const base = {
      id: uid(), exerciseId: openEx.id, unit, scheme,
      note: note.trim(), rir, warmup: warmupFlag, pain: painFlag, ts: Date.now(),
    };
    let set;
    if (scheme === "amrap") {
      set = { ...base, weight, reps: 0, seconds: capMinutes * 60, capMinutes, totalReps };
    } else if (scheme === "emom") {
      set = { ...base, weight, reps: 0, seconds: intervalMinutes * 60 * totalIntervals,
        intervalMinutes, totalIntervals, repsPerInterval, missedIntervals };
    } else if (mode === "cardio") {
      set = { ...base, weight: 0, reps: 0, distance, seconds, heartRate: heartRate === "" ? null : Number(heartRate) };
    } else if (mode === "timed") {
      set = { ...base, weight, reps: 0, seconds };
    } else {
      set = { ...base, weight, reps };
    }
    const score = setScore(set, openEx, unit, bodyweight);
    const isPR = !warmupFlag && score > bestEver + 0.01;
    set = { ...set, pr: isPR };

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
    setWarmupFlag(false);
    setPainFlag(false);
    setFlash({ pr: isPR, score: round1(score), mode, scheme });
    setTimeout(() => setFlash(null), 2600);

    /* §6.1 step 6 — auto-start rest after a real working set; AMRAP/EMOM
       carry their own timing and a warmup doesn't need a rest clock */
    if (!warmupFlag && scheme === "straight" && mode !== "cardio") {
      const queueItem = session?.queue.find((q) => q.exerciseId === openEx.id);
      const restSeconds = queueItem?.rest ?? 90;
      setRest({ endAt: Date.now() + restSeconds * 1000, total: restSeconds });
    }
  };

  /* §8.1 — a deleted set can be restored within 6 seconds; the set
     itself (not just an id) is captured since it's already gone from
     `data` by the time the undo window is showing */
  const deleteSet = (setId) => {
    const removed = session?.sets.find((s) => s.id === setId);
    updateSession((w) => ({ ...w, sets: w.sets.filter((s) => s.id !== setId) }));
    if (!removed) return;
    setLastDeleted({ set: removed, date: today });
    setTimeout(() => setLastDeleted((cur) => (cur?.set.id === removed.id ? null : cur)), 6000);
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    setData((d) => ({
      ...d,
      workouts: d.workouts.map((w) => (w.date === lastDeleted.date ? { ...w, sets: [...w.sets, lastDeleted.set] } : w)),
    }));
    setLastDeleted(null);
  };

  /* §8.1 — edit an already-logged set (weight/reps/timing/note/flags)
     without deleting and re-entering it */
  const updateSet = (setId, patch) =>
    updateSession((w) => ({ ...w, sets: w.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));

  /* §6.1 step 4 — one tap logs the whole warmup ramp, each set
     pre-tagged so it never pollutes analysis */
  const logWarmupRamp = () => {
    if (!openEx) return;
    const ramp = generateWarmupRamp(weight, unit).map((step, i) => ({
      id: uid(), exerciseId: openEx.id, unit, scheme: "straight",
      weight: step.weight, reps: step.reps,
      note: "", rir: null, warmup: true, pain: false, ts: Date.now() + i,
    }));
    if (!session) {
      setData((d) => ({
        ...d,
        workouts: [...d.workouts, { id: uid(), date: today, planId: null, planName: "Freestyle", queue: [], sets: ramp }],
      }));
    } else {
      updateSession((w) => ({ ...w, sets: [...w.sets, ...ramp] }));
    }
  };

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
    const ex = { id: uid(), name, group: "Custom", mode: newMode, capabilities: newCap ? [newCap] : [] };
    setData((d) => ({ ...d, exercises: [...d.exercises, ex] }));
    setNewName("");
    setNewCap("");
    handlePick(ex.id);
  };

  const handlePick = (exId) => {
    if (!picker) return;
    if (picker.mode === "swap") {
      updateSession((w) => ({
        ...w,
        queue: w.queue.map((q) => (q.id === picker.itemId
          ? { ...q, exerciseId: exId, swapped: true, originalExerciseId: picker.originalExerciseId }
          : q)),
      }));
    } else if (picker.mode === "add") {
      updateSession((w) => ({
        ...w,
        queue: [...w.queue, { id: uid(), exerciseId: exId, note: "", sets: 3, reps: 8, rest: 90 }],
      }));
    } else if (picker.mode === "planAdd") {
      setPlanItems((items) => [...items, { exerciseId: exId, note: "", sets: 3, reps: 8, rest: 90 }]);
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

  /* §8.5a — critique this plan against every goal the moment it's saved */
  const savePlan = () => {
    if (!editingPlan.name.trim()) return;
    const nextPlans = data.plans.some((p) => p.id === editingPlan.id)
      ? data.plans.map((p) => (p.id === editingPlan.id ? editingPlan : p))
      : [...data.plans, editingPlan];
    setData((d) => ({ ...d, plans: nextPlans }));
    const msgs = evaluatePlanOnSave(editingPlan, data.plans, data.goals || [], data.exercises);
    setEditingPlan(null);
    setPlanCritique(msgs.length ? msgs : null);
  };

  /* every plan-item mutation goes through this so it works identically
     whether editingPlan is a plain single-day plan (`items`) or a
     multi-day program (`days[activeDay].items`) */
  const setPlanItems = (updater) =>
    setEditingPlan((p) => {
      if (p.days) {
        const days = [...p.days];
        days[activeDay] = { ...days[activeDay], items: updater(days[activeDay].items) };
        return { ...p, days };
      }
      return { ...p, items: updater(p.items) };
    });

  const planItemsOf = (p) => (p.days ? p.days[activeDay]?.items || [] : p.items || []);

  const patchPlanItem = (i, patch) =>
    setPlanItems((items) => items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const movePlanItem = (i, dir) =>
    setPlanItems((items) => {
      const next = [...items];
      const j = i + dir;
      if (j < 0 || j >= next.length) return items;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addPlanDay = () =>
    setEditingPlan((p) => {
      const days = p.days ? [...p.days] : [{ id: uid(), name: "Day 1", items: p.items || [] }];
      days.push({ id: uid(), name: `Day ${days.length + 1}`, items: [] });
      setActiveDay(days.length - 1);
      return { ...p, days };
    });

  const removePlanDay = (idx) =>
    setEditingPlan((p) => {
      if (!p.days || p.days.length <= 1) return p;
      const days = p.days.filter((_, j) => j !== idx);
      setActiveDay((d) => Math.min(d, days.length - 1));
      return { ...p, days };
    });

  const renamePlanDay = (idx, name) =>
    setEditingPlan((p) => {
      const days = [...p.days];
      days[idx] = { ...days[idx], name };
      return { ...p, days };
    });

  const logBodyweight = (value) => {
    if (!(value > 0)) return;
    setData((d) => {
      const log = (d.bodyweightLog || []).filter((e) => e.date !== today);
      return { ...d, bodyweightLog: [...log, { date: today, weight: value, unit }] };
    });
  };

  /* feeds coachInsights' consistency check — without this set, the
     app has no denominator to compare actual sessions/week against */
  const setDaysPerWeek = (n) =>
    setData((d) => ({ ...d, profile: { ...d.profile, daysPerWeek: Math.max(0, n) || null } }));

  const addGoal = (goal) => {
    setData((d) => ({ ...d, goals: [...(d.goals || []), goal] }));
    setGoalSheet(false);
  };

  const removeGoal = (goalId) =>
    setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== goalId) }));

  const armTarget = (goalId, target) => {
    setData((d) => ({ ...d, goals: d.goals.map((g) => (g.id === goalId ? { ...g, target } : g)) }));
    setArmingGoalId(null);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `swolley-mammoths-${today}.json`; a.click();
    URL.revokeObjectURL(url);
    setData((d) => ({ ...d, lastExportAt: today }));
  };

  /* §8.10 — the PRD's own top-flagged risk: localStorage (and even
     IndexedDB) can be evicted by Safari under disk pressure, so a
     working import path is safety-critical on iPhone, not a nicety */
  const importFileRef = useRef(null);
  const triggerImport = () => importFileRef.current?.click();
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importData(reader.result);
      if (!imported) { alert("That file doesn't look like a Swolley Mammoths export."); return; }
      if (!window.confirm("Import this file? It replaces everything currently on this device.")) return;
      setData(imported);
    };
    reader.readAsText(file);
  };

  if (!data) return <div className="app"><style>{CSS}</style><div className="boot">waking the herd…</div></div>;

  const backupDue = needsBackupReminder(data);

  const setsDone = (exId) => (session ? session.sets.filter((s) => s.exerciseId === exId && isCounted(s)).length : 0);
  const pickerEl = picker && (
    <Picker data={data} unit={unit} picker={picker} onPick={handlePick} onClose={() => setPicker(null)}
      newName={newName} setNewName={setNewName} newMode={newMode} setNewMode={setNewMode}
      newCap={newCap} setNewCap={setNewCap}
      addExercise={addExercise} />
  );
  const armingGoal = armingGoalId ? data.goals.find((g) => g.id === armingGoalId) : null;

  /* ============ LOGGING SCREEN ============ */
  if (openEx) {
    const mode = openEx.mode;
    const cfg = MODES[mode];
    const queueItem = session?.queue.find((q) => q.exerciseId === openEx.id);
    // strength-specific UI (RIR, projected 1RM, the fitted-curve section)
    // only makes sense for a straight set on a weight/rep exercise
    const showsStrength = mode !== "timed" && mode !== "cardio" && scheme === "straight";

    return (
      <div className="app">
        <style>{CSS}</style>
        <header className="hd">
          <button className="back" onClick={() => { setOpenExId(null); setRest(null); }} aria-label="back">‹</button>
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
                {lastSession.note && <div className="last__note">"{lastSession.note}"</div>}
              </>
            ) : (
              <>
                <div className="last__label">Last time</div>
                <div className="last__none">first entry — this becomes your baseline</div>
              </>
            )}
          </div>

          <div className="entry">
            {mode !== "timed" && mode !== "cardio" && (
              <div className="schemepick">
                {Object.entries(SCHEMES).map(([k, v]) => (
                  <button key={k} className={scheme === k ? "on" : ""} onClick={() => setScheme(k)}>{v.label}</button>
                ))}
              </div>
            )}

            {scheme === "amrap" ? (
              <>
                <div className="entry__steppers">
                  <Stepper label="Cap" value={capMinutes} onChange={setCapMinutes} step={1} min={1} suffix="min" />
                  <Stepper label="Total reps" value={totalReps} onChange={setTotalReps} step={1} min={0} />
                </div>
                <div className="entry__steppers entry__steppers--sub">
                  <Stepper label="Weight" value={weight} onChange={setWeight} step={spec.step} min={0} suffix={unit} />
                </div>
              </>
            ) : scheme === "emom" ? (
              <>
                <div className="entry__steppers">
                  <Stepper label="Every" value={intervalMinutes} onChange={setIntervalMinutes} step={1} min={1} suffix="min" />
                  <Stepper label="Rounds" value={totalIntervals} onChange={setTotalIntervals} step={1} min={1} />
                  <Stepper label="Reps/rd" value={repsPerInterval} onChange={setRepsPerInterval} step={1} min={0} />
                </div>
                <div className="entry__steppers entry__steppers--sub">
                  <Stepper label="Weight" value={weight} onChange={setWeight} step={spec.step} min={0} suffix={unit} />
                  <Stepper label="Missed" value={missedIntervals} onChange={setMissedIntervals} step={1} min={0} />
                </div>
              </>
            ) : (
              <div className="entry__steppers">
                {cfg.fields.includes("weight") && (
                  <Stepper label="Weight" value={weight} onChange={setWeight} step={spec.step} min={0}
                    suffix={cfg.perHand ? `${unit}/hand` : unit} />
                )}
                {cfg.fields.includes("added") && (
                  <Stepper label="Added" value={weight} onChange={setWeight} step={spec.step} min={0} suffix={unit} />
                )}
                {cfg.fields.includes("distance") && (
                  <Stepper label="Distance" value={distance} onChange={setDistance} step={0.1} min={0} suffix="mi" />
                )}
                {cfg.fields.includes("reps") && (
                  <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={1} />
                )}
                {cfg.fields.includes("seconds") && (
                  <Stepper label="Time" value={seconds} onChange={setSeconds} step={5} min={5}
                    display={mmss} toDraft={mmss} fromDraft={parseMMSS} />
                )}
              </div>
            )}

            {mode === "cardio" && (
              <input className="notefield hrfield" type="number" inputMode="numeric" value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)} placeholder="Avg heart rate — optional" />
            )}

            {cfg.strip && scheme === "straight" && (
              <>
                <BarStrip weight={weight} unit={unit} />
                {weight > spec.bar && <button className="ghost warmupramp" onClick={logWarmupRamp}>Log warmup ramp</button>}
              </>
            )}

            {showsStrength && (
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

            <div className="flags">
              <button className={`flags__b ${warmupFlag ? "on" : ""}`} onClick={() => setWarmupFlag((v) => !v)}>
                Warmup — excluded from analysis
              </button>
              <button className={`flags__b flags__b--pain ${painFlag ? "on" : ""}`} onClick={() => setPainFlag((v) => !v)}>
                ⚠ Pain
              </button>
            </div>

            <input className="notefield" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Note — machine setting, form focus, how it felt" />

            {showsStrength && (
              <div className="proj">
                projected 1RM <b>{round1(epley(weight + (mode === "bodyweight" ? bodyweight : 0), reps))}</b>
                {bestEver > 0 && <span className="proj__best">best {round1(bestEver)}</span>}
              </div>
            )}

            <button className="log" onClick={logSet}>Log set</button>
          </div>

          {flash && (
            <div className={`flash ${flash.pr ? "flash--pr" : ""}`}>
              {flash.pr ? flashLabel(flash) : "Logged"}
            </div>
          )}

          {rest && (
            <RestTimer endAt={rest.endAt} total={rest.total}
              onExtend={() => setRest((r) => (r ? { ...r, endAt: r.endAt + 30000, total: r.total + 30 } : r))}
              onSkip={() => setRest(null)} />
          )}

          <section className="sets">
            <div className="sets__hd">
              <span>Today</span>
              <span>{todaySets.length} set{todaySets.length === 1 ? "" : "s"}</span>
            </div>
            {todaySets.length === 0 ? <div className="empty">Nothing logged yet.</div>
              : todaySets.map((s, i) => {
                const beat = lastSession && isCounted(s) &&
                  (s.scheme || "straight") === (lastSession.best.scheme || "straight") &&
                  setScore(s, openEx, unit, bodyweight) > setScore(lastSession.best, openEx, unit, bodyweight);
                return (
                  <button className={`row ${s.warmup ? "row--warmup" : ""}`} key={s.id} onClick={() => setEditingSetId(s.id)}>
                    <span className="row__n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="row__main">{setLabel(s, openEx, unit)}</span>
                    {s.warmup && <span className="row__tag">W</span>}
                    {s.pain && <span className="row__tag row__tag--pain" title="pain flagged">⚠</span>}
                    {beat && <span className="row__beat" title="beat last session">▲</span>}
                    <span className="row__e1">
                      {mode === "timed" ? mmss(s.seconds) : round1(setScore(s, openEx, unit, bodyweight))}
                    </span>
                    <span className="row__x" onClick={(e) => { e.stopPropagation(); deleteSet(s.id); }} aria-label="delete set">×</span>
                    {s.note && <div className="row__note">{s.note}</div>}
                  </button>
                );
              })}
          </section>

          {lastDeleted && (
            <div className="undotoast">
              <span>Set deleted.</span>
              <button onClick={undoDelete}>Undo</button>
            </div>
          )}

          {oneRM && mode !== "timed" && mode !== "cardio" && (
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

          {bwStrength && (
            <section className="bwadj">
              <div className="rm__hd">Strength vs. bodyweight</div>
              <div className="bwadj__line">
                <b className={bwStrength.liftDeltaPct >= 0 ? "up" : "down"}>
                  {bwStrength.liftDeltaPct >= 0 ? "+" : ""}{bwStrength.liftDeltaPct}%
                </b> strength on{" "}
                <b className={bwStrength.bwDeltaPct >= 0 ? "up" : "down"}>
                  {bwStrength.bwDeltaPct >= 0 ? "+" : ""}{bwStrength.bwDeltaPct}%
                </b> bodyweight
              </div>
              <div className="rm__sub">
                {bwStrength.verdict === "real-gain" && "A real strength gain — it's outpacing any bodyweight change."}
                {bwStrength.verdict === "mostly-bodyweight" && "Mostly tracking bodyweight change, not a strength gain on its own."}
                {bwStrength.verdict === "flat" && "Roughly flat over this window."}
              </div>
            </section>
          )}

          {editingSetId && todaySets.find((s) => s.id === editingSetId) && (
            <EditSetSheet
              set={todaySets.find((s) => s.id === editingSetId)}
              ex={openEx} unit={unit} spec={spec}
              onSave={(id, patch) => { updateSet(id, patch); setEditingSetId(null); }}
              onClose={() => setEditingSetId(null)}
            />
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

          {editingPlan.days && (
            <div className="daytabs">
              {editingPlan.days.map((d, i) => (
                <button key={d.id} className={`daytab ${i === activeDay ? "on" : ""}`} onClick={() => setActiveDay(i)}>
                  {d.name}
                </button>
              ))}
              <button className="daytab daytab--add" onClick={addPlanDay}>+</button>
            </div>
          )}
          {editingPlan.days && (
            <div className="dayname">
              <input className="dayname__input" value={editingPlan.days[activeDay]?.name || ""}
                onChange={(e) => renamePlanDay(activeDay, e.target.value)} placeholder="Day name" />
              {editingPlan.days.length > 1 && (
                <button className="dayname__x" onClick={() => removePlanDay(activeDay)} aria-label="remove day">Remove day</button>
              )}
            </div>
          )}

          {planItemsOf(editingPlan).map((it, i) => {
            const ex = exById(it.exerciseId);
            return (
              <div className="pitem" key={i}>
                <div className="pitem__top">
                  <span className="pitem__name">{ex ? ex.name : "—"}</span>
                  <div className="pitem__ctl">
                    <button onClick={() => movePlanItem(i, -1)} aria-label="move up">↑</button>
                    <button onClick={() => movePlanItem(i, 1)} aria-label="move down">↓</button>
                    <button onClick={() => setPlanItems((items) => items.filter((_, j) => j !== i))}
                      aria-label="remove">×</button>
                  </div>
                </div>
                <div className="pitem__targets">
                  <input type="number" inputMode="numeric" value={it.sets}
                    onChange={(e) => patchPlanItem(i, { sets: +e.target.value })} />
                  <span>sets ×</span>
                  <input type="number" inputMode="numeric" value={it.reps}
                    onChange={(e) => patchPlanItem(i, { reps: +e.target.value })} />
                  <span>reps · rest</span>
                  <input type="number" inputMode="numeric" value={it.rest ?? 90}
                    onChange={(e) => patchPlanItem(i, { rest: +e.target.value })} />
                  <span>s</span>
                </div>
                <input className="pitem__note" placeholder="Cue — machine, grip, form focus" value={it.note}
                  onChange={(e) => patchPlanItem(i, { note: e.target.value })} />
              </div>
            );
          })}

          <button className="ghost" onClick={() => setPicker({ mode: "planAdd" })}>+ Add exercise</button>
          {!editingPlan.days && <button className="ghost" onClick={addPlanDay}>+ Add a day (make this a program)</button>}
        </main>
        {pickerEl}
      </div>
    );
  }

  /* ============ SESSION SUMMARY (§6.1 step 9) ============ */
  if (showSummary && session) {
    const summary = sessionSummary(session, data, unit);
    return (
      <div className="app">
        <style>{CSS}</style>
        <header className="hd">
          <div className="hd__l">
            <div className="hd__ex">Session complete</div>
            <div className="hd__date">{session.planName}</div>
          </div>
        </header>
        <main className="body">
          <div className="summarygrid">
            <div className="summarystat"><span className="summarystat__n">{summary.countedSets}</span><span className="summarystat__l">sets</span></div>
            <div className="summarystat"><span className="summarystat__n">{summary.durationMin != null ? `${summary.durationMin}m` : "—"}</span><span className="summarystat__l">duration</span></div>
            <div className="summarystat"><span className="summarystat__n">{summary.tonnage > 0 ? `${round1(summary.tonnage)}${unit}` : "—"}</span><span className="summarystat__l">volume</span></div>
            <div className="summarystat"><span className="summarystat__n summarystat__n--gold">{summary.prs}</span><span className="summarystat__l">PR{summary.prs === 1 ? "" : "s"}</span></div>
          </div>

          {summary.insights.length > 0 && (
            <div className="summarycoach">
              <div className="prompt">From the Coach</div>
              {summary.insights.map((ins, i) => <div key={i} className={`insight insight--${ins.severity}`}>{ins.text}</div>)}
            </div>
          )}

          <button className="log" onClick={() => setShowSummary(false)}>Done</button>
        </main>
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

      <main className="body body--wide">
        {tab === "today" && (
          <>
            {backupDue && (
              <button className="backupnag" onClick={() => { exportJSON(); }}>
                <span>It's been a while since you backed up — your log only lives on this device.</span>
                <span className="backupnag__cta">Export now →</span>
              </button>
            )}
            {homeVerdict && (
              <button className={`hero hero--${homeVerdict.status}`} onClick={() => setTab("coach")}>
                <span className="hero__label">{homeVerdict.goal.label}</span>
                <span className="hero__headline">{homeVerdict.headline}</span>
              </button>
            )}
            {!session ? (
              <>
                <div className="prompt">Start today's session</div>
                <div className="cardgrid">
                  {data.plans.map((p) => (
                    <button className="planpick" key={p.id} onClick={() => pickOrStart(p, "start")}>
                      <span className="planpick__n">{p.name}</span>
                      <span className="planpick__m">{planSummary(p)}</span>
                    </button>
                  ))}
                </div>
                <button className="ghost" onClick={() => startSession(null)}>Freestyle — no plan</button>
              </>
            ) : (
              <>
                <div className="shd">
                  <span className="shd__n">
                    {session.planName}
                    {session.planName !== "Freestyle" && (
                      <button className="shd__clear" onClick={() => updateSession((w) => ({ ...w, planName: "Freestyle" }))}
                        aria-label="clear plan name" title="Clear plan name">×</button>
                    )}
                  </span>
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
                            <CapDot capability={ex?.capabilities?.[0]} />{ex ? ex.name : "—"}{q.swapped && <span className="qitem__sw">swapped</span>}
                          </div>
                          {q.note && <div className="qitem__note">{q.note}</div>}
                        </div>
                        <div className="qitem__prog">{done}/{q.sets || "–"}</div>
                      </button>
                      <div className="qitem__ctl">
                        <button onClick={() => moveQueueItem(i, -1)} aria-label="move up">↑</button>
                        <button onClick={() => moveQueueItem(i, 1)} aria-label="move down">↓</button>
                        <button className="swap" onClick={() => setPicker({
                          mode: "swap", itemId: q.id, group: ex?.group,
                          fromExerciseId: q.exerciseId, originalExerciseId: q.originalExerciseId || q.exerciseId,
                        })}>swap</button>
                        <button onClick={() => updateSession((w) => {
                          const queue = w.queue.filter((x) => x.id !== q.id);
                          return { ...w, queue, planName: queue.length === 0 ? "Freestyle" : w.planName };
                        })} aria-label="remove">×</button>
                      </div>
                    </div>
                  );
                })}

                <button className="ghost" onClick={() => setPlanSheet(true)}>+ Load a plan into this session</button>
                <button className="ghost" onClick={() => setPicker({ mode: "add" })}>+ Add a single exercise</button>
                {session.queue.length === 0 && (
                  <div className="empty">Freestyle session — add exercises as you go.</div>
                )}
                {session.sets.length > 0 && (
                  <button className="log finishsession" onClick={() => setShowSummary(true)}>Finish session</button>
                )}
              </>
            )}
          </>
        )}

        {tab === "plans" && (
          <>
            {planCritique && (
              <div className="critique">
                {planCritique.map((m, i) => <div key={i} className="critique__line">{m.text}</div>)}
                <button className="critique__x" onClick={() => setPlanCritique(null)} aria-label="dismiss">×</button>
              </div>
            )}
            <div className="prompt">Tap a plan to load it into today</div>
            <div className="cardgrid">
              {data.plans.map((p) => (
                <div className="prow" key={p.id}>
                  <button className="prow__main" onClick={() => pickOrStart(p, "load")}>
                    <div className="prow__n">{p.name}</div>
                    <div className="prow__m">{planSummary(p)}</div>
                  </button>
                  <button className="prow__edit" onClick={() => { setEditingPlan(JSON.parse(JSON.stringify(p))); setActiveDay(0); }}>edit</button>
                  <button className="prow__x" aria-label="delete plan"
                    onClick={() => setData((d) => ({ ...d, plans: d.plans.filter((x) => x.id !== p.id) }))}>×</button>
                </div>
              ))}
            </div>
            <button className="ghost" onClick={() => { setEditingPlan({ id: uid(), name: "", items: [] }); setActiveDay(0); }}>+ New plan</button>
          </>
        )}

        {tab === "coach" && (
          <>
            <div className="prompt">Your verdict</div>
            {(data.goals || []).length === 0 && (
              <div className="empty">No goals yet. Add one so the Coach has something to evaluate your training against.</div>
            )}
            <div className="cardgrid">
              {goalVerdicts.map((v) => (
                <VerdictCard key={v.goal.id} verdict={v} onArm={setArmingGoalId} canArm={canArmTarget(v.goal, data, unit)} trends={goalTrends[v.goal.id]} />
              ))}
            </div>
            <button className="ghost" onClick={() => setGoalSheet(true)}>+ Add a goal</button>

            {changes.length > 0 && (
              <>
                <div className="prompt coach__section">Changes to make</div>
                {changes.map((c, i) => <div key={i} className="change">{c.text}</div>)}
              </>
            )}

            {weekStatus && weekStatus.items.length > 0 && (
              <>
                <div className="prompt coach__section">This week</div>
                <div className="weekcard">
                  {weekStatus.items.map((it) => (
                    <div className="weekrow" key={it.capability}>
                      <div className="weekrow__head">
                        <span><CapDot capability={it.capability} />{it.label}</span>
                        <span className={`weekrow__status weekrow__status--${it.status}`}>
                          {it.status === "met" ? "on track"
                            : it.status === "missed" ? "missed"
                            : it.status === "not-in-plan" ? "not in plan"
                            : "in progress"}
                        </span>
                      </div>
                      <div className="weekrow__nums">
                        {it.status === "not-in-plan"
                          ? "Your current program doesn't include this"
                          : `${it.actual} of ${it.target} session${it.target === 1 ? "" : "s"} this week`}
                        {it.source === "guideline" && it.status !== "not-in-plan" && (
                          <span className="weekrow__src"> · general guidance</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* the frequency-floor note is the same text for every
                    capability sharing a domain (strength, endurance, …) —
                    show each distinct one once here rather than repeating
                    a paragraph per row */}
                {[...new Set(weekStatus.items.filter((i) => i.note && i.status !== "met").map((i) => i.note))]
                  .map((note, i) => <div className="weekcard__note" key={i}>{note}</div>)}
              </>
            )}

            {adherenceInfo && (
              <div className="adherence">
                <div className="adherence__num">
                  {adherenceInfo.actualSessions} of {adherenceInfo.intended} planned sessions
                  <span className="adherence__win"> · last {adherenceInfo.windowDays} days</span>
                </div>
                {adherenceInfo.diverged > 0 && (
                  <div className="adherence__note">
                    {adherenceInfo.diverged} session{adherenceInfo.diverged === 1 ? "" : "s"} logged against a plan
                    drifted materially from what it prescribed{adherenceInfo.matched > 0 ? `, vs ${adherenceInfo.matched} that matched` : ""}.
                  </div>
                )}
              </div>
            )}

            {scorecard && (
              <details className="scorecard">
                <summary>Balanced scorecard — last {scorecard.sinceDays} days</summary>
                {scorecard.volume.map((v) => (
                  <div className="scorecard__row" key={v.key}>
                    <div className="scorecard__head">
                      <span>
                        <CapDot capability={SCORECARD_LABEL_CAP[v.labelA]} />{v.labelA}
                        <span className="scorecard__vs"> vs </span>
                        <CapDot capability={SCORECARD_LABEL_CAP[v.labelB]} />{v.labelB}
                      </span>
                      <span className={`scorecard__status scorecard__status--${v.status}`}>{v.status.replace("-", " ")}</span>
                    </div>
                    <div className="scorecard__nums">{v.a} vs {v.b} sets{v.ratio != null ? ` · ${v.ratio}:1` : ""}</div>
                    {v.status !== "insufficient" && v.status !== "balanced" && <div className="scorecard__note">{v.note}</div>}
                  </div>
                ))}
                {scorecard.trajectories.map((t, i) => <div className="scorecard__note" key={i}>{t.text}</div>)}

                <div className="scorecard__sub">Strength ratio (snapshot, not a target)</div>
                {scorecard.strengthRatios.map((r) => (
                  <div className="scorecard__row" key={r.key}>
                    <div className="scorecard__head">
                      <span>
                        <CapDot capability={SCORECARD_LABEL_CAP[r.labelA]} />{r.labelA}
                        <span className="scorecard__vs"> vs </span>
                        <CapDot capability={SCORECARD_LABEL_CAP[r.labelB]} />{r.labelB}
                      </span>
                      <span className={`scorecard__status scorecard__status--${r.status === "lean" ? "lean" : r.status}`}>{r.status}</span>
                    </div>
                    {r.status !== "insufficient" && (
                      <>
                        <div className="scorecard__nums">{r.exA} {r.a}{unit} vs {r.exB} {r.b}{unit} · {r.ratio}:1</div>
                        {r.status === "lean" && <div className="scorecard__note">{r.note}</div>}
                      </>
                    )}
                  </div>
                ))}

                <div className="scorecard__sub">Domain balance</div>
                <div className="domainrow">
                  {scorecard.domains.map((d) => (
                    <span key={d.domain} className={`domainchip domainchip--${d.status}`}>
                      {d.domain}{d.status === "tracked" ? ` · ${d.sets}` : ""}
                    </span>
                  ))}
                </div>
              </details>
            )}

            {insights.length > 0 && (
              <details className="scorecard">
                <summary>All insights</summary>
                {insights.map((ins, i) => <div className={`insight insight--${ins.severity}`} key={i}>{ins.text}</div>)}
              </details>
            )}
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

            <div className="bw">
              <div className="bw__l">
                <div className="bw__hd">Training days/week</div>
                <div className="bw__sub">Lets the Coach flag when you're falling behind your own target</div>
              </div>
              <div className="bw__ctl">
                <button onClick={() => setDaysPerWeek((data.profile.daysPerWeek || 0) - 1)}>−</button>
                <span className="bw__v">{data.profile.daysPerWeek || "—"}</span>
                <button onClick={() => setDaysPerWeek((data.profile.daysPerWeek || 0) + 1)}>+</button>
              </div>
            </div>

            <div className="cardgrid">
              {data.exercises.map((ex) => {
                const direct = [];
                data.workouts.forEach((w) => {
                  const s = w.sets.filter((x) => x.exerciseId === ex.id && isCounted(x));
                  if (s.length) direct.push({ date: w.date, score: Math.max(...s.map((x) => setScore(x, ex, unit, bodyweight))) });
                });
                // §8.3 — sessions where a swap substituted for this exercise still
                // join its trend line, converted onto its scale
                const subs = substitutedPoints(data, ex.id, unit);
                const merged = [...direct, ...subs].sort((a, b) => (a.date < b.date ? -1 : 1));
                if (!merged.length) return null;
                const pts = merged.map((p) => p.score);
                const trend = pts.length > 1 ? pts[pts.length - 1] - pts[0] : 0;
                const best = Math.max(...pts);
                return (
                  <button className="lift" key={ex.id} onClick={() => openExercise(ex.id)}>
                    <div className="lift__l">
                      <div className="lift__name"><CapDot capability={ex.capabilities?.[0]} />{ex.name}</div>
                      <div className="lift__meta">
                        {merged.length} session{merged.length > 1 ? "s" : ""}
                        {subs.length > 0 ? ` (${subs.length} via swap)` : ""} · best{" "}
                        {ex.mode === "timed" ? mmss(best) : ex.mode === "cardio" ? `${round1(best)} mi/min` : `${round1(best)}${unit}`}
                      </div>
                    </div>
                    <div className="lift__r">
                      <Spark points={pts} color={trend >= 0 ? "#D9A521" : "#7E848E"} />
                      <div className={`lift__d ${trend >= 0 ? "up" : "down"}`}>{trend >= 0 ? "+" : ""}{round1(trend)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
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
                    const sub = w.queue?.find((q) => q.exerciseId === exId && q.originalExerciseId && q.originalExerciseId !== exId);
                    const subFrom = sub ? exById(sub.originalExerciseId) : null;
                    return (
                      <div className="sesh__ex" key={exId}>
                        <div className="sesh__exname">
                          {ex ? ex.name : "—"}
                          {subFrom && <span className="sesh__sub">sub for {subFrom.name}</span>}
                        </div>
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
            <button className="export" onClick={triggerImport}>Import from a JSON export</button>
            <input ref={importFileRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
          </>
        )}
      </main>

      <nav className="nav">
        {[["today","Today"],["plans","Plans"],["coach","Coach"],["lifts","Lifts"],["history","History"]].map(([k, l]) => (
          <button key={k} className={`nav__b ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {pickerEl}
      {goalSheet && <GoalSheet data={data} unit={unit} onSave={addGoal} onClose={() => setGoalSheet(false)} />}
      {armingGoal && <ArmTargetSheet goal={armingGoal} data={data} unit={unit} onSave={armTarget} onClose={() => setArmingGoalId(null)} />}

      {planSheet && (
        <div className="sheet" onClick={() => setPlanSheet(false)}>
          <div className="sheet__in" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__hd">Load a plan</div>
            <div className="sheet__hint">Its exercises get added to today's list.</div>
            <div className="sheet__list">
              {data.plans.map((p) => (
                <button key={p.id} className="sheet__i" onClick={() => pickOrStart(p, "load")}>
                  <span>{p.name}</span>
                  <span className="sheet__g">{p.days?.length > 1 ? `${p.days.length} days` : `${planAllItems(p).length} exercises`}</span>
                </button>
              ))}
              {data.plans.length === 0 && <div className="empty">No plans yet. Build one on the Plans tab.</div>}
            </div>
          </div>
        </div>
      )}

      {dayPicker && (() => {
        const plan = data.plans.find((p) => p.id === dayPicker.planId);
        if (!plan?.days) return null;
        return (
          <div className="sheet" onClick={() => setDayPicker(null)}>
            <div className="sheet__in" onClick={(e) => e.stopPropagation()}>
              <div className="sheet__hd">Which day — {plan.name}</div>
              <div className="sheet__list">
                {plan.days.map((d) => (
                  <button key={d.id} className="sheet__i" onClick={() => {
                    if (dayPicker.action === "start") startSession(plan.id, d.id);
                    else { loadPlanIntoSession(plan.id, d.id); setTab("today"); }
                    setDayPicker(null);
                  }}>
                    <span>{d.name}</span>
                    <span className="sheet__g">{d.items.length} exercises</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const CSS = `
.app {
  --iron:#1A1D22; --raised:#23272E; --line:#31363F; --chalk:#EDE8E0;
  --dim:#858B96; --gold:#D9A521; --blue:#2C5FA8; --red:#C8322E; --green:#3A7D53;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  position:fixed; inset:0; display:flex; flex-direction:column;
  background:var(--iron); color:var(--chalk); font-family:var(--sans);
  -webkit-font-smoothing:antialiased; overflow:hidden;
}
.app *,.app *::before,.app *::after{box-sizing:border-box;}
.app button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;-webkit-tap-highlight-color:transparent;transition:transform 100ms,filter 100ms,background-color 100ms;}
.app button:focus-visible,.app input:focus-visible,.app select:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.app input,.app select{font-family:var(--sans);}
/* baseline tap feedback for every button in the app — specific buttons
   below (e.g. .log, .stepper__btn) define their own :active and win
   the cascade by appearing later in this stylesheet */
.app button:active{filter:brightness(1.22);transform:scale(.97);}
.capdot{display:inline-block;width:7px;height:7px;border-radius:50%;flex:0 0 auto;margin-right:6px;vertical-align:middle;}
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
.body--wide{width:100%;}
.cardgrid{display:grid;grid-template-columns:1fr;gap:10px;}
@media (min-width:700px){
  .body--wide{max-width:1100px;margin:0 auto;padding-left:32px;padding-right:32px;}
  .body--wide .cardgrid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr));align-items:start;}
  .body--wide .cardgrid .planpick,.body--wide .cardgrid .prow,.body--wide .cardgrid .lift,.body--wide .cardgrid .verdict{margin-bottom:0;}
  .body--wide .prow{border-bottom:none;border:1px solid var(--line);border-radius:8px;padding:2px 8px;}
  .hd,.nav{padding-left:max(18px,calc(50% - 550px));padding-right:max(18px,calc(50% - 550px));}
}

.prompt{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:10px;}
.planpick{width:100%;text-align:left;padding:15px 16px;background:var(--raised);border:1px solid var(--line);border-radius:8px;margin-bottom:9px;display:block;}
.planpick__n{display:block;font-size:16px;font-weight:600;}
.planpick__m{display:block;font-family:var(--mono);font-size:10.5px;color:var(--dim);margin-top:4px;}
.ghost{width:100%;padding:13px;border:1px dashed var(--line);border-radius:8px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:8px;}

.shd{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:10px;border-bottom:1px solid var(--line);}
.shd__n{font-size:15px;font-weight:600;}
.shd__clear{color:var(--dim);font-size:16px;line-height:1;padding:0 0 0 8px;vertical-align:middle;}
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

.daytabs{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;}
.daytab{padding:8px 13px;border:1px solid var(--line);border-radius:16px;font-size:12.5px;color:var(--dim);}
.daytab.on{background:var(--gold);color:#1A1D22;border-color:var(--gold);font-weight:600;}
.daytab--add{font-weight:700;}
.dayname{display:flex;align-items:center;gap:10px;margin-top:12px;}
.dayname__input{flex:1;background:var(--raised);border:1px solid var(--line);border-radius:6px;padding:9px 11px;color:var(--chalk);font-size:14px;}
.dayname__x{font-family:var(--mono);font-size:10px;color:var(--red);white-space:nowrap;flex:0 0 auto;}

.proj{font-family:var(--mono);font-size:12px;color:var(--dim);margin-top:12px;display:flex;gap:12px;align-items:baseline;}
.proj b{color:var(--chalk);font-size:15px;font-weight:500;}
.proj__best{margin-left:auto;color:var(--gold);}

.log{width:100%;margin-top:12px;padding:17px;background:var(--chalk);color:#1A1D22;border-radius:8px;font-size:15px;font-weight:650;transition:transform 90ms;}
.finishsession{background:var(--gold);margin-top:20px;}

.summarygrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;}
.summarystat{background:var(--raised);border:1px solid var(--line);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:4px;}
.summarystat__n{font-family:var(--mono);font-size:26px;font-weight:600;}
.summarystat__n--gold{color:var(--gold);}
.summarystat__l{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);}
.summarycoach{margin-top:22px;}
.log:active{transform:scale(.985);}

.flash{margin-top:10px;padding:10px 14px;border-radius:6px;font-family:var(--mono);font-size:11.5px;background:#2C313A;color:var(--dim);animation:rise 240ms ease-out both;}
.flash--pr{background:var(--gold);color:#1A1D22;font-weight:600;}
@keyframes rise{from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:none;}}

.flags{display:flex;gap:8px;margin-top:12px;}
.flags__b{flex:1;padding:10px;border:1px solid var(--line);border-radius:8px;font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;color:var(--dim);text-align:center;}
.flags__b.on{background:var(--gold);color:#1A1D22;border-color:var(--gold);font-weight:600;}
.flags__b--pain.on{background:var(--red);border-color:var(--red);color:#fff;}

.sets{margin-top:26px;}
.sets__hd{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);padding-bottom:8px;border-bottom:1px solid var(--line);}
.row{width:100%;text-align:left;display:flex;align-items:baseline;gap:12px;padding:13px 2px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
.warmupramp{margin-top:8px;}
.undotoast{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px 14px;background:#2C313A;border-radius:6px;font-size:13px;}
.undotoast button{font-family:var(--mono);font-size:11px;color:var(--gold);font-weight:600;}

.resttimer{margin-top:10px;padding:12px 14px;background:var(--raised);border:1px solid var(--gold);border-radius:8px;}
.resttimer__bar{height:4px;background:#2C313A;border-radius:2px;overflow:hidden;}
.resttimer__fill{height:100%;background:var(--gold);transition:width 250ms linear;}
.resttimer__row{display:flex;justify-content:space-between;align-items:center;margin-top:9px;}
.resttimer__time{font-family:var(--mono);font-size:20px;font-weight:600;}
.resttimer__ctl{display:flex;gap:6px;}
.resttimer__ctl button{font-family:var(--mono);font-size:10.5px;color:var(--dim);border:1px solid var(--line);border-radius:5px;padding:6px 10px;}
.row--warmup{opacity:.6;}
.row__n{font-family:var(--mono);font-size:11px;color:var(--dim);}
.row__main{font-family:var(--mono);font-size:17px;}
.row__tag{font-family:var(--mono);font-size:9px;padding:2px 5px;border-radius:3px;background:#2C313A;color:var(--dim);}
.row__tag--pain{background:var(--red);color:#fff;}
.row__beat{color:var(--gold);font-size:11px;}
.row__e1{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--gold);}
.row__x{color:var(--dim);font-size:20px;padding:0 4px;line-height:1;cursor:pointer;}
.row__note{flex-basis:100%;font-size:12px;color:var(--dim);padding-left:23px;line-height:1.4;margin-top:2px;}
.empty{font-family:var(--mono);font-size:12px;color:var(--dim);padding:20px 2px;line-height:1.6;}

.schemepick{display:flex;gap:6px;margin-bottom:12px;}
.schemepick button{flex:1;padding:9px 4px;border:1px solid var(--line);border-radius:7px;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);text-align:center;}
.schemepick button.on{background:var(--gold);color:#1A1D22;border-color:var(--gold);font-weight:600;}
.entry__steppers--sub{margin-top:10px;}
.hrfield{margin-top:10px;}
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

.bwadj{margin-top:16px;padding:16px;background:var(--raised);border:1px solid var(--line);border-radius:10px;}
.bwadj__line{font-size:15px;margin-top:6px;}
.bwadj__line b{font-family:var(--mono);font-weight:600;}
.bwadj__line b.up{color:var(--gold);} .bwadj__line b.down{color:var(--dim);}

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
.sesh__sub{font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin-left:8px;}
.sesh__sets{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.chip{font-family:var(--mono);font-size:11.5px;padding:4px 8px;background:var(--raised);border:1px solid var(--line);border-radius:4px;}
.export{width:100%;margin-top:22px;padding:13px;border:1px solid var(--line);border-radius:8px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);}

.nav{display:flex;border-top:1px solid var(--line);background:var(--raised);flex:0 0 auto;}
.nav__b{flex:1;padding:14px 0 calc(19px + env(safe-area-inset-bottom));font-family:var(--mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--dim);border-top:3px solid transparent;border-right:1px solid var(--line);}
.nav__b:last-child{border-right:none;}
.nav__b.on{color:var(--chalk);border-top-color:var(--gold);background:rgba(217,165,33,.09);font-weight:600;}

.sheet{position:fixed;inset:0;background:rgba(10,12,15,.72);display:flex;align-items:flex-end;z-index:20;animation:fade 140ms ease-out;}
.sheet__in{width:100%;max-height:88%;display:flex;flex-direction:column;background:var(--raised);border-top:1px solid var(--line);border-radius:14px 14px 0 0;animation:up 200ms cubic-bezier(.2,.8,.3,1);overflow-y:auto;}
@keyframes fade{from{opacity:0;}to{opacity:1;}}
@keyframes up{from{transform:translateY(24px);}to{transform:none;}}
.sheet__hd{padding:18px 18px 6px;font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);}
.sheet__hint{padding:0 18px 4px;font-size:12px;color:var(--gold);}
.sheet__search{margin:8px 18px 10px;width:auto;}
.sheet__list{overflow-y:auto;flex:1 1 auto;}
.sheet__i{width:100%;display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:14px 18px;text-align:left;font-size:15px;border-bottom:1px solid var(--line);}
.sheet__iname{display:flex;align-items:center;}
.sheet__g{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);flex:0 0 auto;}
.sheet__add{display:flex;gap:6px;padding:12px 18px calc(26px + env(safe-area-inset-bottom));flex:0 0 auto;flex-wrap:wrap;}
.sheet__input{flex:1;min-width:0;background:#1A1D22;border:1px solid var(--line);border-radius:6px;padding:11px;color:var(--chalk);font-size:14px;}
.sheet__sel{background:#1A1D22;border:1px solid var(--line);border-radius:6px;color:var(--chalk);font-size:12px;padding:0 6px;}
.sheet__addb{padding:11px 15px;background:var(--chalk);color:#1A1D22;border-radius:6px;font-weight:600;font-size:14px;}

.hero{width:100%;text-align:left;display:block;padding:14px 16px;border-radius:10px;margin-bottom:14px;border:1px solid var(--line);background:var(--raised);border-left:3px solid var(--dim);}
.hero--red{border-left-color:var(--red);}
.hero--amber{border-left-color:var(--gold);}
.hero--green{border-left-color:var(--green);}

.backupnag{width:100%;text-align:left;display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:12px 14px;border-radius:8px;margin-bottom:12px;background:rgba(217,165,33,.08);border:1px solid var(--gold);}
.backupnag span:first-child{font-size:12.5px;line-height:1.4;}
.backupnag__cta{font-family:var(--mono);font-size:11px;color:var(--gold);white-space:nowrap;flex:0 0 auto;}
.hero__label{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);}
.hero__headline{display:block;font-size:14.5px;line-height:1.4;margin-top:5px;}

.coach__section{margin-top:22px;}
.verdict{padding:14px 15px;border-radius:10px;background:var(--raised);border:1px solid var(--line);border-left:3px solid var(--dim);margin-bottom:10px;}
.verdict--red{border-left-color:var(--red);}
.verdict--amber{border-left-color:var(--gold);}
.verdict--green{border-left-color:var(--green);}
.verdict__top{display:flex;align-items:center;gap:7px;}
.verdict__dot{width:7px;height:7px;border-radius:50%;background:var(--dim);flex:0 0 auto;}
.verdict__dot--red{background:var(--red);} .verdict__dot--amber{background:var(--gold);} .verdict__dot--green{background:var(--green);}
.verdict__label{font-size:13.5px;font-weight:600;}
.verdict__caps{display:flex;gap:2px;margin-left:auto;}
.verdict__caps .capdot{margin-right:0;}
.verdict__headline{font-size:13.5px;line-height:1.5;margin-top:6px;}
.verdict__num{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:6px;}
.verdict__trends{display:flex;flex-wrap:wrap;gap:3px 10px;margin-top:8px;}
.verdict__trend{font-family:var(--mono);font-size:11px;color:var(--dim);}
.verdict__trend.up{color:var(--gold);}
.verdict__arm{margin-top:9px;font-family:var(--mono);font-size:10.5px;color:var(--gold);}

.change{font-size:13px;line-height:1.5;padding:10px 0;border-bottom:1px solid var(--line);}

.weekcard{display:flex;flex-direction:column;gap:8px;}
.weekrow{padding:11px 13px;background:var(--raised);border:1px solid var(--line);border-radius:9px;}
.weekrow__head{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;font-weight:550;}
.weekrow__status{font-family:var(--mono);font-size:10px;text-transform:uppercase;color:var(--dim);}
.weekrow__status--met{color:var(--green);}
.weekrow__status--missed{color:var(--red);}
.weekrow__status--not-in-plan{color:var(--dim);}
.weekrow__nums{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:3px;}
.weekrow__src{font-style:italic;}
.weekcard__note{font-size:12px;color:var(--dim);line-height:1.5;margin-top:8px;}

.adherence{margin-top:18px;padding:14px 15px;background:var(--raised);border:1px solid var(--line);border-radius:9px;}
.adherence__num{font-size:14px;font-weight:600;}
.adherence__win{font-family:var(--mono);font-size:10.5px;font-weight:400;color:var(--dim);}
.adherence__note{font-size:12px;color:var(--dim);margin-top:6px;line-height:1.5;}

.scorecard{margin-top:20px;border-top:1px solid var(--line);padding-top:14px;}
.scorecard summary{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);cursor:pointer;}
.scorecard__row{padding:12px 0;border-bottom:1px solid var(--line);}
.scorecard__head{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;font-weight:550;}
.scorecard__vs{color:var(--dim);font-weight:400;margin:0 2px;}
.scorecard__status{font-family:var(--mono);font-size:10px;text-transform:uppercase;color:var(--dim);}
.scorecard__status--sustained-lean{color:var(--red);}
.scorecard__status--lean{color:var(--gold);}
.scorecard__nums{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:3px;}
.scorecard__note{font-size:12px;color:var(--dim);line-height:1.5;margin-top:5px;}
.scorecard__sub{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:18px;padding-top:14px;border-top:1px solid var(--line);}
.domainrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.domainchip{font-family:var(--mono);font-size:10.5px;padding:5px 10px;border-radius:12px;border:1px solid var(--line);text-transform:capitalize;color:var(--dim);}
.domainchip--tracked{color:var(--gold);border-color:var(--gold);}
.insight{font-size:12.5px;line-height:1.5;padding:8px 0;border-bottom:1px solid var(--line);}
.insight--alert{color:var(--red);}
.insight--good{color:var(--gold);}

.critique{background:var(--raised);border:1px solid var(--gold);border-radius:8px;padding:12px 14px;margin-bottom:14px;position:relative;}
.critique__line{font-size:13px;line-height:1.5;padding-right:16px;}
.critique__x{position:absolute;top:8px;right:10px;color:var(--dim);font-size:16px;}

.goal__templates{display:flex;flex-wrap:wrap;gap:8px;padding:0 18px 10px;overflow:visible;}
.goal__tpl{padding:9px 13px;border:1px solid var(--line);border-radius:20px;font-size:12.5px;color:var(--dim);}
.goal__tpl.on{background:var(--gold);color:#1A1D22;border-color:var(--gold);font-weight:600;}
.goal__liftpick{margin:0 18px 10px;width:calc(100% - 36px);}
.goal__label{margin-left:18px;margin-right:18px;width:calc(100% - 36px);}
.goal__caps{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px;}
.goal__cap{padding:6px 10px;border:1px solid var(--line);border-radius:14px;font-family:var(--mono);font-size:10.5px;color:var(--dim);}
.goal__cap.on{background:#2C313A;color:var(--gold);border-color:var(--gold);}
.goal__save{margin:12px 18px calc(20px + env(safe-area-inset-bottom));}
.goal__armrow{display:flex;align-items:center;gap:10px;padding:8px 18px;}
.goal__armrow label{font-family:var(--mono);font-size:11px;color:var(--dim);width:60px;}
.goal__armrow input{flex:1;background:#1A1D22;border:1px solid var(--line);border-radius:6px;padding:10px;color:var(--chalk);font-size:14px;}

@media (prefers-reduced-motion: reduce){.app *,.app *::before,.app *::after{animation:none!important;transition:none!important;}}
`;

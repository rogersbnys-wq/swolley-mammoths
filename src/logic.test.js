import { describe, it, expect } from "vitest";
import {
  epley, round1, convert, wIn, mmss, parseMMSS, todayKey, prettyDate, daysAgo,
  platesPerSide, setLabel, setScore, isCounted, weightedSets, fit1RM,
  estimate1RM, bestScore, seed, currentBodyweight, bodyweightAsOf, migrate,
  goalCurrentValue, canArmTarget, pace, bodyweightAdjustedStrength,
  coachInsights, planCoverage, suggestPlanForCapability, goalVerdict,
  evaluatePlanOnSave, volumeByCapability, progressionPct, trajectoryDivergence,
  balancedScorecard, rankedChanges, describeCapabilities, patternSide, planAllItems,
  personalRatio, equivalentLoad, substitutedPoints,
  mostTrainedExercise, topVerdict, CAPABILITY_COLORS,
  needsBackupReminder, importData, generateWarmupRamp,
  GOAL_TEMPLATES, SEED_EXERCISES, SEED_PLANS, CAPABILITIES,
} from "./logic.js";

const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };

const barbell = (id, name, capabilities = [], group = "Push") =>
  ({ id, name, group, mode: "barbell", capabilities });

/* ============ small pure helpers ============ */

describe("epley", () => {
  it("returns the weight unchanged at 1 rep or fewer", () => {
    expect(epley(200, 1)).toBe(200);
    expect(epley(200, 0)).toBe(200);
  });
  it("applies the 1/30-per-rep formula above 1 rep", () => {
    expect(round1(epley(200, 10))).toBeCloseTo(266.7, 1);
  });
});

describe("round1", () => {
  it("rounds to one decimal place", () => {
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
    expect(round1(1.249999)).toBe(1.2);
  });
});

describe("convert", () => {
  it("is a no-op when units match", () => {
    expect(convert(100, "lb", "lb")).toBe(100);
  });
  it("converts lb to kg and back", () => {
    expect(convert(220.462, "lb", "kg")).toBeCloseTo(100, 1);
    expect(convert(100, "kg", "lb")).toBeCloseTo(220.462, 1);
  });
});

describe("wIn", () => {
  it("defaults to lb when the set has no unit", () => {
    expect(wIn({ weight: 100 }, "lb")).toBe(100);
  });
  it("converts from the set's stored unit to the display unit", () => {
    expect(wIn({ weight: 100, unit: "kg" }, "lb")).toBeCloseTo(220.5, 1);
  });
});

describe("mmss", () => {
  it("formats seconds as m:ss", () => {
    expect(mmss(65)).toBe("1:05");
    expect(mmss(600)).toBe("10:00");
    expect(mmss(5)).toBe("0:05");
  });
});

describe("parseMMSS", () => {
  it("parses minutes:seconds back into total seconds", () => {
    expect(parseMMSS("35:30")).toBe(2130);
    expect(parseMMSS("1:05")).toBe(65);
    expect(parseMMSS("10:00")).toBe(600);
  });
  it("round-trips with mmss", () => {
    [65, 600, 5, 2130].forEach((s) => expect(parseMMSS(mmss(s))).toBe(s));
  });
  it("still accepts a bare number of seconds with no colon", () => {
    expect(parseMMSS("90")).toBe(90);
  });
  it("tolerates a missing half on either side of the colon", () => {
    expect(parseMMSS("35:")).toBe(2100);
    expect(parseMMSS(":30")).toBe(30);
  });
});

describe("todayKey / prettyDate / daysAgo", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("renders a pretty date from a key", () => {
    expect(prettyDate("2026-01-05")).toBe("MON 05 JAN");
  });
  it("labels today, yesterday, days, and weeks correctly", () => {
    const now = new Date(2026, 2, 15);
    expect(daysAgo(todayKey(now), now)).toBe("today");
    expect(daysAgo(todayKey(addDays(now, -1)), now)).toBe("yesterday");
    expect(daysAgo(todayKey(addDays(now, -5)), now)).toBe("5d ago");
    expect(daysAgo(todayKey(addDays(now, -20)), now)).toBe("3w ago");
  });
});

describe("platesPerSide", () => {
  it("flags under-bar-weight loads", () => {
    expect(platesPerSide(40, "lb").under).toBe(true);
  });
  it("returns bar-only for exactly the bar weight", () => {
    const r = platesPerSide(45, "lb");
    expect(r.under).toBe(false);
    expect(r.plates).toEqual([]);
  });
  it("computes the correct plate stack per side", () => {
    const r = platesPerSide(225, "lb"); // (225-45)/2 = 90/side = two 45s
    expect(r.plates.map((p) => p.w)).toEqual([45, 45]);
    expect(r.leftover).toBeCloseTo(0, 5);
  });
  it("reports leftover when the load can't be made exactly", () => {
    const r = platesPerSide(46, "lb"); // 0.5/side, smallest plate is 2.5
    expect(r.plates).toEqual([]);
    expect(r.leftover).toBeCloseTo(0.5, 5);
  });
});

describe("setLabel / setScore — cardio and AMRAP/EMOM schemes", () => {
  const cardio = { mode: "cardio" };

  it("labels cardio by distance and pace once distance is logged", () => {
    expect(setLabel({ distance: 5, seconds: 2400 }, cardio, "lb")).toBe("5mi · 40:00 (8:00/mi)");
  });
  it("falls back to a bare duration for cardio with no distance", () => {
    expect(setLabel({ distance: 0, seconds: 90 }, cardio, "lb")).toBe("1:30");
  });
  it("scores cardio as distance per minute (higher is better)", () => {
    expect(setScore({ distance: 5, seconds: 2400 }, cardio, "lb")).toBeCloseTo(0.125, 5); // 5mi / 40min
  });

  it("labels and scores an AMRAP set regardless of the exercise's mode", () => {
    const set = { scheme: "amrap", capMinutes: 20, totalReps: 214 };
    expect(setLabel(set, barbell("thr", "Thruster"), "lb")).toBe("214 reps in 20:00 AMRAP");
    expect(setScore(set, barbell("thr", "Thruster"), "lb")).toBeCloseTo(10.7, 1);
  });

  it("includes the prescribed weight in an AMRAP label when one was logged", () => {
    const set = { scheme: "amrap", capMinutes: 20, totalReps: 214, weight: 95, unit: "lb" };
    expect(setLabel(set, barbell("thr", "Thruster"), "lb")).toBe("214 reps in 20:00 AMRAP @ 95lb");
  });

  it("labels and scores an EMOM set, noting missed rounds", () => {
    const set = { scheme: "emom", intervalMinutes: 1, totalIntervals: 8, repsPerInterval: 10, missedIntervals: 1 };
    expect(setLabel(set, barbell("kb", "KB Swing"), "lb")).toBe("10/rd × 8 EMOM · missed 1");
    expect(setScore(set, barbell("kb", "KB Swing"), "lb")).toBe(70); // (8-1)*10
  });

  it("includes the prescribed weight in an EMOM label when one was logged", () => {
    const set = { scheme: "emom", intervalMinutes: 1, totalIntervals: 8, repsPerInterval: 10, weight: 53, unit: "lb" };
    expect(setLabel(set, barbell("kb", "KB Swing"), "lb")).toBe("10/rd × 8 EMOM @ 53lb");
  });

  it("excludes cardio and non-straight sets from the 1RM fit", () => {
    const now = Date.now();
    const cardioEx = barbell("run", "Run", ["run"]);
    cardioEx.mode = "cardio";
    const cardioWorkouts = [{ date: "2026-01-01", sets: [{ exerciseId: "run", distance: 5, seconds: 2400, ts: now }] }];
    expect(weightedSets(cardioWorkouts, cardioEx, "lb", 0)).toEqual([]);
    expect(estimate1RM(cardioWorkouts, cardioEx, "lb", 0)).toBeNull();

    const strengthEx = barbell("thr", "Thruster");
    const amrapWorkouts = [{ date: "2026-01-01", sets: [{ exerciseId: "thr", scheme: "amrap", capMinutes: 20, totalReps: 200, ts: now }] }];
    expect(weightedSets(amrapWorkouts, strengthEx, "lb", 0)).toEqual([]);
  });

  it("bestScore can be filtered to a single scheme so AMRAP and straight-set PRs don't mix", () => {
    const ex = barbell("thr", "Thruster");
    const workouts = [{ date: "2026-01-01", sets: [
      { exerciseId: "thr", weight: 95, reps: 10, unit: "lb" }, // epley score ~126
      { exerciseId: "thr", scheme: "amrap", capMinutes: 20, totalReps: 200 }, // score 10
    ] }];
    expect(bestScore(workouts, "thr", ex, "lb", 0, { scheme: "straight" })).toBeCloseTo(epley(95, 10), 5);
    expect(bestScore(workouts, "thr", ex, "lb", 0, { scheme: "amrap" })).toBe(10);
  });
});

describe("setLabel", () => {
  const ex = (mode) => ({ mode });
  it("labels a timed set with and without added weight", () => {
    expect(setLabel({ seconds: 90 }, ex("timed"), "lb")).toBe("1:30");
    expect(setLabel({ seconds: 90, weight: 25 }, ex("timed"), "lb")).toBe("25lb · 1:30");
  });
  it("labels a bodyweight set with and without added weight", () => {
    expect(setLabel({ reps: 10 }, ex("bodyweight"), "lb")).toBe("BW × 10");
    expect(setLabel({ reps: 10, weight: 25 }, ex("bodyweight"), "lb")).toBe("BW+25 × 10");
  });
  it("labels a standard set as weight × reps", () => {
    expect(setLabel({ weight: 135, reps: 5 }, ex("barbell"), "lb")).toBe("135 × 5");
  });
});

describe("setScore", () => {
  it("uses raw seconds for timed sets", () => {
    expect(setScore({ seconds: 45 }, { mode: "timed" }, "lb")).toBe(45);
  });
  it("adds bodyweight in for bodyweight sets", () => {
    const score = setScore({ weight: 25, reps: 8 }, { mode: "bodyweight" }, "lb", 180);
    expect(round1(score)).toBe(round1(epley(205, 8)));
  });
  it("uses plain epley for barbell/machine/dumbbell sets", () => {
    expect(setScore({ weight: 135, reps: 5 }, { mode: "barbell" }, "lb")).toBe(epley(135, 5));
  });
});

describe("isCounted", () => {
  it("excludes warmup sets and includes everything else", () => {
    expect(isCounted({ warmup: true })).toBe(false);
    expect(isCounted({ warmup: false })).toBe(true);
    expect(isCounted({})).toBe(true);
  });
});

/* ============ 1RM engine ============ */

describe("weightedSets", () => {
  const ex = barbell("e1", "Bench", ["horizontal_press"]);
  it("returns nothing for timed exercises", () => {
    expect(weightedSets([], { mode: "timed" }, "lb", 0)).toEqual([]);
  });
  it("excludes warmup sets", () => {
    const workouts = [{ date: "2026-01-01", sets: [
      { exerciseId: "e1", weight: 135, reps: 5, warmup: true, ts: Date.now() },
    ] }];
    expect(weightedSets(workouts, ex, "lb", 0)).toEqual([]);
  });
  it("drops sets whose effective reps fall outside 1-10", () => {
    const workouts = [{ date: "2026-01-01", sets: [
      { exerciseId: "e1", weight: 135, reps: 15, ts: Date.now() },
    ] }];
    expect(weightedSets(workouts, ex, "lb", 0)).toEqual([]);
  });
  it("drops sets older than the lookback window", () => {
    const workouts = [{ date: "2026-01-01", sets: [
      { exerciseId: "e1", weight: 135, reps: 5, ts: Date.now() - 200 * 86400000 },
    ] }];
    expect(weightedSets(workouts, ex, "lb", 0, 120)).toEqual([]);
  });
  it("keeps a valid set and assigns it positive weight", () => {
    const workouts = [{ date: "2026-01-01", sets: [
      { exerciseId: "e1", weight: 135, reps: 5, rir: 0, ts: Date.now() },
    ] }];
    const pts = weightedSets(workouts, ex, "lb", 0);
    expect(pts).toHaveLength(1);
    expect(pts[0].w).toBeGreaterThan(0);
  });
});

describe("fit1RM", () => {
  it("returns null with no points", () => {
    expect(fit1RM([])).toBeNull();
    expect(fit1RM(null)).toBeNull();
  });
  it("falls back to the epley formula with only one rep range", () => {
    const points = [
      { reps: 5, load: 135, implied: epley(135, 5), w: 1 },
      { reps: 5, load: 145, implied: epley(145, 5), w: 1 },
    ];
    const fit = fit1RM(points);
    expect(fit.method).toBe("epley");
    expect(fit.est).toBe(Math.max(...points.map((p) => p.implied)));
  });
  it("fits a line across genuine rep-range variety", () => {
    const points = [
      { reps: 3, load: 185, implied: epley(185, 3), w: 1 },
      { reps: 5, load: 165, implied: epley(165, 5), w: 1 },
      { reps: 8, load: 145, implied: epley(145, 8), w: 1 },
      { reps: 10, load: 135, implied: epley(135, 10), w: 1 },
    ];
    const fit = fit1RM(points);
    expect(fit.method).toBe("fit");
    expect(fit.est).toBeGreaterThan(0);
    expect(fit.dropPerRep).toBeGreaterThan(0);
  });
  it("labels the estimate assumed when any set has no RIR tagged", () => {
    const points = [{ reps: 5, load: 135, implied: epley(135, 5), w: 1, rir: null }];
    expect(fit1RM(points).assumed).toBe(true);
  });
});

describe("estimate1RM / bestScore", () => {
  const ex = barbell("e1", "Bench", ["horizontal_press"]);
  const workouts = [
    { date: "2026-01-01", sets: [{ exerciseId: "e1", weight: 135, reps: 5, rir: 1, ts: Date.now() - 10 * 86400000, warmup: false }] },
    { date: "2026-01-08", sets: [{ exerciseId: "e1", weight: 145, reps: 5, rir: 1, ts: Date.now() - 3 * 86400000, warmup: false },
                                  { exerciseId: "e1", weight: 95, reps: 5, ts: Date.now() - 3 * 86400000, warmup: true }] },
  ];
  it("returns null for timed exercises", () => {
    expect(estimate1RM(workouts, { mode: "timed" }, "lb", 0)).toBeNull();
  });
  it("estimates from the logged history", () => {
    expect(estimate1RM(workouts, ex, "lb", 0).est).toBeGreaterThan(0);
  });
  it("finds the best counted score, excluding warmups", () => {
    const best = bestScore(workouts, "e1", ex, "lb", 0);
    expect(best).toBe(epley(145, 5));
  });
  it("respects a 'before' cutoff", () => {
    const best = bestScore(workouts, "e1", ex, "lb", 0, { before: "2026-01-08" });
    expect(best).toBe(epley(135, 5));
  });
});

/* ============ persistence-adjacent ============ */

describe("seed / currentBodyweight / bodyweightAsOf / migrate", () => {
  it("seeds a complete, empty data shape", () => {
    const s = seed();
    expect(s.workouts).toEqual([]);
    expect(s.goals).toEqual([]);
    expect(s.exercises.length).toBeGreaterThan(0);
  });
  it("falls back to data.bodyweight with no log", () => {
    expect(currentBodyweight({ bodyweight: 180 }, "lb")).toBe(180);
  });
  it("picks the most recent bodyweight log entry", () => {
    const data = { bodyweightLog: [
      { date: "2026-01-01", weight: 180, unit: "lb" },
      { date: "2026-02-01", weight: 185, unit: "lb" },
    ] };
    expect(currentBodyweight(data, "lb")).toBe(185);
  });
  it("bodyweightAsOf ignores entries after the cutoff date", () => {
    const data = { bodyweightLog: [
      { date: "2026-01-01", weight: 180, unit: "lb" },
      { date: "2026-02-01", weight: 185, unit: "lb" },
    ] };
    expect(bodyweightAsOf(data, "lb", "2026-01-15")).toBe(180);
  });
  it("migrate fills in defaults for an old save", () => {
    const migrated = migrate({ workouts: [{ date: "2026-01-01", sets: [{ exerciseId: "e1", weight: 100, reps: 5 }] }] });
    expect(migrated.goals).toEqual([]);
    expect(migrated.workouts[0].sets[0].warmup).toBe(false);
    expect(migrated.workouts[0].sets[0].pain).toBe(false);
    expect(migrated.workouts[0].sets[0].scheme).toBe("straight");
    expect(migrated.workouts[0].sets[0].distance).toBe(0);
    expect(migrated.exercises[0].capabilities).toBeDefined();
  });
  it("migrate returns null for null input", () => {
    expect(migrate(null)).toBeNull();
  });

  it("migrate upgrades a catalog exercise to the current seed definition, even when the device saved it before the catalog changed", () => {
    // simulates a real device whose save predates the timed->cardio move for Run
    const staleData = {
      exercises: [{ id: "e20", name: "Run", group: "Conditioning", mode: "timed" }], // no capabilities at all
      workouts: [],
    };
    const migrated = migrate(staleData);
    const run = migrated.exercises.find((e) => e.id === "e20");
    expect(run.mode).toBe("cardio");
    expect(run.capabilities).toEqual(["run"]);
  });

  it("migrate never touches a genuinely custom (non-catalog) exercise", () => {
    const staleData = {
      exercises: [{ id: "custom1", name: "Sled Push", group: "Custom", mode: "timed", capabilities: ["carry"] }],
      workouts: [],
    };
    const migrated = migrate(staleData);
    const custom = migrated.exercises.find((e) => e.id === "custom1");
    expect(custom.mode).toBe("timed");
    expect(custom.capabilities).toEqual(["carry"]);
  });

  it("migrate appends catalog exercises the saved device never had at all", () => {
    const staleData = { exercises: [{ id: "e1", name: "Back Squat", group: "Legs", mode: "barbell" }], workouts: [] };
    const migrated = migrate(staleData);
    expect(migrated.exercises.find((e) => e.id === "e20")).toBeTruthy(); // Run, added later
  });
});

/* ============ goals: value, arming, pace ============ */

describe("goalCurrentValue / canArmTarget", () => {
  it("reads a bodyweight goal from the bodyweight log", () => {
    const goal = { target: { kind: "bodyweight" } };
    const data = { bodyweightLog: [{ date: "2026-01-01", weight: 180, unit: "lb" }] };
    expect(goalCurrentValue(goal, data, "lb")).toBe(180);
  });
  it("returns null for a lift goal with no matching exercise", () => {
    const goal = { target: { kind: "lift", exerciseId: "nope" } };
    expect(goalCurrentValue(goal, { exercises: [], workouts: [] }, "lb")).toBeNull();
  });
  it("returns null with no target at all", () => {
    expect(goalCurrentValue({ target: null }, {}, "lb")).toBeNull();
  });
  it("only arms a bodyweight target once a bodyweight is logged", () => {
    const goal = { templateId: "leanout" };
    expect(canArmTarget(goal, { bodyweight: 0, bodyweightLog: [] }, "lb")).toBe(false);
    expect(canArmTarget(goal, { bodyweight: 180, bodyweightLog: [] }, "lb")).toBe(true);
  });
  it("never arms a target for event/none-shaped goals", () => {
    expect(canArmTarget({ templateId: "hyrox" }, { exercises: [] }, "lb")).toBe(false);
    expect(canArmTarget({ templateId: "injuryfree" }, { exercises: [] }, "lb")).toBe(false);
  });
  it("only arms a lift target once that exercise has an estimate", () => {
    const ex = barbell("bench", "Bench", ["horizontal_press"]);
    const data = { exercises: [ex], workouts: [] };
    expect(canArmTarget({ templateId: "stronger", liftExerciseId: "bench" }, data, "lb")).toBe(false);
    const dataWithHistory = { exercises: [ex], workouts: [{ date: "2026-01-01", sets: [{ exerciseId: "bench", weight: 135, reps: 5, unit: "lb" }] }] };
    expect(canArmTarget({ templateId: "stronger", liftExerciseId: "bench" }, dataWithHistory, "lb")).toBe(true);
  });
});

describe("pace", () => {
  it("returns null without a fully armed target", () => {
    expect(pace({ target: null }, {}, "lb")).toBeNull();
    expect(pace({ target: { deadline: null, baseline: { value: 1, date: "2026-01-01" } } }, {}, "lb")).toBeNull();
  });

  it("reads zero gap and matching required rate on an exact-pace goal", () => {
    const baselineDate = new Date(2026, 0, 1);
    const deadlineDate = addDays(baselineDate, 70);
    const nowDate = addDays(baselineDate, 35);
    const goal = { target: { kind: "bodyweight", value: 200, baseline: { value: 100, date: todayKey(baselineDate) }, deadline: todayKey(deadlineDate) } };
    const data = { bodyweightLog: [{ date: todayKey(nowDate), weight: 150, unit: "lb" }] };
    const p = pace(goal, data, "lb", nowDate);
    expect(p.current).toBe(150);
    expect(p.neededPerWeek).toBeCloseTo(10, 5);
    expect(p.gap).toBeCloseTo(0, 5);
    expect(p.onPace).toBe(true);
    expect(p.requiredPerWeekNow).toBeCloseTo(10, 5);
    expect(p.outcome).toBeNull();
  });

  it("flags off pace with a steeper required rate when behind", () => {
    const baselineDate = new Date(2026, 0, 1);
    const deadlineDate = addDays(baselineDate, 70);
    const nowDate = addDays(baselineDate, 35);
    const goal = { target: { kind: "bodyweight", value: 200, baseline: { value: 100, date: todayKey(baselineDate) }, deadline: todayKey(deadlineDate) } };
    const data = { bodyweightLog: [{ date: todayKey(nowDate), weight: 120, unit: "lb" }] };
    const p = pace(goal, data, "lb", nowDate);
    expect(p.gap).toBeLessThan(0);
    expect(p.onPace).toBe(false);
    expect(p.requiredPerWeekNow).toBeGreaterThan(p.neededPerWeek);
  });

  it("reports an outcome instead of a progress bar once the deadline passes", () => {
    const baselineDate = new Date(2026, 0, 1);
    const deadlineDate = addDays(baselineDate, 30);
    const nowDate = addDays(deadlineDate, 5);
    const goal = { target: { kind: "bodyweight", value: 200, baseline: { value: 180, date: todayKey(baselineDate) }, deadline: todayKey(deadlineDate) } };
    const hit = pace(goal, { bodyweightLog: [{ date: todayKey(nowDate), weight: 205, unit: "lb" }] }, "lb", nowDate);
    expect(hit.outcome).toBe("hit");
    expect(hit.onPace).toBeNull();
    const missed = pace(goal, { bodyweightLog: [{ date: todayKey(nowDate), weight: 195, unit: "lb" }] }, "lb", nowDate);
    expect(missed.outcome).toBe("missed");
  });
});

describe("bodyweightAdjustedStrength", () => {
  const ex = barbell("e1", "Bench", ["horizontal_press"]);
  it("returns null with fewer than two sets in the window", () => {
    const data = { workouts: [], bodyweightLog: [] };
    expect(bodyweightAdjustedStrength(data, ex, "lb")).toBeNull();
  });
  it("calls a real gain when strength outpaces bodyweight", () => {
    const data = {
      bodyweight: 180,
      bodyweightLog: [{ date: todayKey(addDays(new Date(), -60)), weight: 180, unit: "lb" }, { date: todayKey(new Date()), weight: 183, unit: "lb" }],
      workouts: [
        { date: todayKey(addDays(new Date(), -60)), sets: [{ exerciseId: "e1", weight: 135, reps: 5, unit: "lb" }] },
        { date: todayKey(new Date()), sets: [{ exerciseId: "e1", weight: 175, reps: 5, unit: "lb" }] },
      ],
    };
    const r = bodyweightAdjustedStrength(data, ex, "lb");
    expect(r.verdict).toBe("real-gain");
    expect(r.liftDeltaPct).toBeGreaterThan(r.bwDeltaPct);
  });
  it("calls it mostly-bodyweight when the lift barely outpaces bodyweight gain", () => {
    const data = {
      bodyweight: 180,
      bodyweightLog: [{ date: todayKey(addDays(new Date(), -60)), weight: 180, unit: "lb" }, { date: todayKey(new Date()), weight: 195, unit: "lb" }],
      workouts: [
        { date: todayKey(addDays(new Date(), -60)), sets: [{ exerciseId: "e1", weight: 135, reps: 5, unit: "lb" }] },
        { date: todayKey(new Date()), sets: [{ exerciseId: "e1", weight: 141, reps: 5, unit: "lb" }] },
      ],
    };
    expect(bodyweightAdjustedStrength(data, ex, "lb").verdict).toBe("mostly-bodyweight");
  });
});

/* ============ rule-based coach insights ============ */

describe("coachInsights", () => {
  it("flags a stalled exercise across sessions without a new best", () => {
    const exercises = [barbell("sq", "Squat", ["squat"], "Legs")];
    const dates = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"];
    const weights = [230, 220, 210, 200];
    const workouts = dates.map((date, i) => ({ date, sets: [{ exerciseId: "sq", weight: weights[i], reps: 5, unit: "lb" }] }));
    const data = { exercises, workouts, profile: {} };
    const insights = coachInsights(data, "lb", new Date(2026, 0, 22));
    expect(insights.find((i) => i.type === "stall" && i.exerciseId === "sq")).toBeTruthy();
  });

  it("flags a muscle group gone stale", () => {
    const exercises = [barbell("bp", "Bench", ["horizontal_press"], "Push")];
    const workouts = [{ date: "2026-01-01", sets: [{ exerciseId: "bp", weight: 135, reps: 5, unit: "lb" }] }];
    const data = { exercises, workouts, profile: {} };
    const insights = coachInsights(data, "lb", new Date(2026, 0, 20));
    expect(insights.find((i) => i.type === "stale" && i.group === "Push")).toBeTruthy();
  });

  it("flags a logged pain set", () => {
    const exercises = [barbell("bp", "Bench", ["horizontal_press"], "Push")];
    const workouts = [{ date: "2026-01-01", sets: [{ exerciseId: "bp", weight: 135, reps: 5, unit: "lb", pain: true }] }];
    const data = { exercises, workouts, profile: {} };
    const insights = coachInsights(data, "lb", new Date(2026, 0, 2));
    expect(insights.find((i) => i.type === "pain")).toBeTruthy();
  });

  it("celebrates a new best in the most recent session", () => {
    const exercises = [barbell("bp", "Bench", ["horizontal_press"], "Push")];
    const workouts = [
      { date: "2026-01-01", sets: [{ exerciseId: "bp", weight: 135, reps: 5, unit: "lb" }] },
      { date: "2026-01-08", sets: [{ exerciseId: "bp", weight: 145, reps: 5, unit: "lb" }] },
    ];
    const data = { exercises, workouts, profile: {} };
    const insights = coachInsights(data, "lb", new Date(2026, 0, 8));
    expect(insights.find((i) => i.type === "progress" && i.exerciseId === "bp")).toBeTruthy();
  });

  it("flags falling behind a stated training frequency", () => {
    const exercises = [barbell("bp", "Bench", ["horizontal_press"], "Push")];
    const workouts = [{ date: "2026-01-01", sets: [{ exerciseId: "bp", weight: 135, reps: 5, unit: "lb" }] }];
    const data = { exercises, workouts, profile: { daysPerWeek: 4 } };
    const insights = coachInsights(data, "lb", new Date(2026, 0, 10));
    expect(insights.find((i) => i.type === "consistency")).toBeTruthy();
  });
});

/* ============ Phase 4: the Coach evaluation engine ============ */

describe("patternSide / describeCapabilities", () => {
  it("groups capabilities into push/pull/quad/hinge/other", () => {
    expect(patternSide("horizontal_press")).toBe("push");
    expect(patternSide("vertical_pull")).toBe("pull");
    expect(patternSide("squat")).toBe("quad");
    expect(patternSide("hinge")).toBe("hinge");
    expect(patternSide("carry")).toBe("other");
  });
  it("joins capability labels into readable prose", () => {
    expect(describeCapabilities(["run"])).toBe("Running");
    expect(describeCapabilities(["run", "carry"])).toBe("Running and Loaded carry");
    expect(describeCapabilities(["run", "carry", "squat"])).toBe("Running, Loaded carry, and Squat");
  });
});

describe("planAllItems", () => {
  it("returns a single-day plan's items directly", () => {
    const plan = { id: "p1", items: [{ exerciseId: "e1" }, { exerciseId: "e2" }] };
    expect(planAllItems(plan)).toEqual(plan.items);
  });
  it("flattens every day's items for a multi-day program", () => {
    const plan = { id: "p1", days: [
      { id: "d1", name: "Day 1", items: [{ exerciseId: "e1" }] },
      { id: "d2", name: "Day 2", items: [{ exerciseId: "e2" }, { exerciseId: "e3" }] },
    ] };
    expect(planAllItems(plan)).toEqual([{ exerciseId: "e1" }, { exerciseId: "e2" }, { exerciseId: "e3" }]);
  });
  it("returns an empty array for a plan with neither", () => {
    expect(planAllItems({ id: "p1" })).toEqual([]);
  });
});

describe("movement equivalence", () => {
  // real seed ids, since EQUIVALENCE_DEFAULT_COEFFICIENT is keyed on the catalog:
  // e1 = Back Squat (coefficient 1), e13 = Leg Press (coefficient 1.8)
  const exercises = [barbell("e1", "Back Squat", ["squat"]), barbell("e13", "Leg Press", ["squat"])];

  it("has no personal ratio until both exercises have history", () => {
    const data = { exercises, workouts: [] };
    expect(personalRatio(data, "e1", "e13", "lb")).toBeNull();
  });

  it("computes the user's own ratio once both have logged sets", () => {
    const data = { exercises, workouts: [
      { date: "2026-01-01", sets: [{ exerciseId: "e1", weight: 200, reps: 5, unit: "lb" }] },
      { date: "2026-01-02", sets: [{ exerciseId: "e13", weight: 400, reps: 5, unit: "lb" }] },
    ] };
    const ratio = personalRatio(data, "e1", "e13", "lb");
    expect(ratio).toBeGreaterThan(0);
    // equivalentLoad should use this personal ratio, not the population default (1.8)
    const conv = equivalentLoad(200, "e1", "e13", data, "lb");
    expect(conv.estimate).toBe(false);
    expect(conv.value).toBeCloseTo(200 * ratio, 5);
  });

  it("falls back to the population-default coefficient and labels it an estimate", () => {
    const data = { exercises, workouts: [] };
    const conv = equivalentLoad(200, "e1", "e13", data, "lb");
    expect(conv.estimate).toBe(true);
    expect(conv.value).toBeCloseTo(360, 5); // 200 * (1.8/1)
  });

  it("is a no-op converting an exercise to itself", () => {
    const data = { exercises, workouts: [] };
    expect(equivalentLoad(200, "e1", "e1", data, "lb")).toEqual({ value: 200, estimate: false });
  });

  it("substitutedPoints finds converted sessions logged against a swap-in, tied to the original via originalExerciseId", () => {
    const data = {
      exercises,
      workouts: [{
        date: "2026-01-05", queue: [{ id: "q1", exerciseId: "e13", originalExerciseId: "e1", swapped: true }],
        sets: [{ exerciseId: "e13", weight: 400, reps: 5, unit: "lb" }],
      }],
    };
    const points = substitutedPoints(data, "e1", "lb");
    expect(points).toHaveLength(1);
    expect(points[0].viaId).toBe("e13");
    expect(points[0].estimate).toBe(true); // no personal ratio logged yet
  });

  it("substitutedPoints ignores queue items that were never actually swapped", () => {
    const data = {
      exercises,
      workouts: [{ date: "2026-01-05", queue: [{ id: "q1", exerciseId: "e1" }], sets: [] }],
    };
    expect(substitutedPoints(data, "e1", "lb")).toEqual([]);
  });
});

describe("planCoverage", () => {
  const exercises = [
    barbell("bench", "Bench", ["horizontal_press"]),
    barbell("sq", "Squat", ["squat"]),
    barbell("dl", "Deadlift", ["hinge"]),
    barbell("carry", "Farmer Carry", ["carry"]),
  ];
  it("is not applicable for a goal with no capabilities", () => {
    expect(planCoverage([], { capabilities: [] }, exercises).applicable).toBe(false);
  });
  it("reports full coverage across plans", () => {
    const plans = [{ id: "p1", items: [{ exerciseId: "sq" }, { exerciseId: "dl" }] }];
    const cov = planCoverage(plans, { capabilities: ["squat", "hinge"] }, exercises);
    expect(cov.missing).toEqual([]);
    expect(cov.ratio).toBe(1);
  });
  it("reports zero coverage when no plan touches the goal", () => {
    const plans = [{ id: "p1", items: [{ exerciseId: "bench" }] }];
    const cov = planCoverage(plans, { capabilities: ["hinge", "carry"] }, exercises);
    expect(cov.covered).toEqual([]);
    expect(cov.ratio).toBe(0);
  });
  it("counts a capability trained on any day of a multi-day program", () => {
    const program = { id: "prog", days: [
      { id: "d1", name: "Day 1", items: [{ exerciseId: "bench" }] },
      { id: "d2", name: "Day 2", items: [{ exerciseId: "dl" }] },
    ] };
    const cov = planCoverage([program], { capabilities: ["hinge"] }, exercises);
    expect(cov.ratio).toBe(1);
  });
});

describe("suggestPlanForCapability", () => {
  const exercises = [barbell("bench", "Bench", ["horizontal_press"]), barbell("row", "Row", ["horizontal_pull"])];
  it("returns null with no plans", () => {
    expect(suggestPlanForCapability("carry", [], exercises)).toBeNull();
  });
  it("prefers the plan already on the same side", () => {
    const plans = [
      { id: "push", items: [{ exerciseId: "bench" }] },
      { id: "pull", items: [{ exerciseId: "row" }] },
    ];
    expect(suggestPlanForCapability("vertical_pull", plans, exercises).id).toBe("pull");
  });
});

describe("goalVerdict", () => {
  const exercises = [
    barbell("bench", "Bench", ["horizontal_press"]),
    barbell("sq", "Squat", ["squat"]),
    barbell("dl", "Deadlift", ["hinge"]),
    barbell("carry", "Farmer Carry", ["carry"]),
  ];

  it("is red when no plan trains any required capability", () => {
    const data = { exercises, plans: [{ id: "p1", items: [{ exerciseId: "bench" }] }], workouts: [], goals: [] };
    const goal = { id: "g1", label: "Hyrox", capabilities: ["hinge", "carry"], target: null };
    const v = goalVerdict(goal, data, "lb");
    expect(v.status).toBe("red");
    expect(v.suggestions.length).toBe(2);
  });

  it("is amber when a plan partially covers the goal", () => {
    const data = { exercises, plans: [{ id: "p1", items: [{ exerciseId: "sq" }] }], workouts: [], goals: [] };
    const goal = { id: "g1", label: "Hyrox", capabilities: ["squat", "carry"], target: null };
    expect(goalVerdict(goal, data, "lb").status).toBe("amber");
  });

  it("is green when plans train everything the goal needs and there's no target", () => {
    const data = { exercises, plans: [{ id: "p1", items: [{ exerciseId: "sq" }, { exerciseId: "dl" }] }], workouts: [], goals: [] };
    const goal = { id: "g1", label: "Get stronger", capabilities: ["squat", "hinge"], target: null };
    expect(goalVerdict(goal, data, "lb").status).toBe("green");
  });

  it("is unknown for a capability-less goal with no target and no data", () => {
    const data = { exercises, plans: [], workouts: [], goals: [] };
    const goal = { id: "g1", label: "Write-in", capabilities: [], target: null };
    expect(goalVerdict(goal, data, "lb").status).toBe("unknown");
  });

  it("evaluates pace once structure is satisfied", () => {
    const baselineDate = new Date(2026, 0, 1);
    const nowDate = addDays(baselineDate, 35);
    const deadlineDate = addDays(baselineDate, 70);
    const data = {
      exercises, plans: [], workouts: [], goals: [],
      bodyweightLog: [{ date: todayKey(nowDate), weight: 150, unit: "lb" }],
    };
    const onPaceGoal = { id: "g1", label: "Lean out", capabilities: [], target: { kind: "bodyweight", value: 200, baseline: { value: 100, date: todayKey(baselineDate) }, deadline: todayKey(deadlineDate) } };
    expect(goalVerdict(onPaceGoal, data, "lb", nowDate).status).toBe("green");

    const behindData = { ...data, bodyweightLog: [{ date: todayKey(nowDate), weight: 110, unit: "lb" }] };
    expect(goalVerdict(onPaceGoal, behindData, "lb", nowDate).status).toBe("amber");
  });
});

describe("evaluatePlanOnSave", () => {
  const exercises = [barbell("bench", "Bench", ["horizontal_press"]), barbell("carry", "Farmer Carry", ["carry"])];
  const goals = [{ id: "g1", label: "Hyrox", capabilities: ["carry"] }];

  it("flags a plan set that still misses a goal's capabilities after saving", () => {
    const plan = { id: "push", items: [{ exerciseId: "bench" }] };
    const msgs = evaluatePlanOnSave(plan, [], goals, exercises);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toContain("Loaded carry");
  });

  it("says nothing once the saved plan (or another) covers the goal", () => {
    const plan = { id: "push", items: [{ exerciseId: "bench" }, { exerciseId: "carry" }] };
    expect(evaluatePlanOnSave(plan, [], goals, exercises)).toHaveLength(0);
  });

  it("counts capabilities served by other plans, not just the one being saved", () => {
    const plan = { id: "push", items: [{ exerciseId: "bench" }] };
    const otherPlans = [{ id: "legs", items: [{ exerciseId: "carry" }] }];
    expect(evaluatePlanOnSave(plan, otherPlans, goals, exercises)).toHaveLength(0);
  });
});

describe("volumeByCapability", () => {
  const exercises = [barbell("bench", "Bench", ["horizontal_press"])];
  it("counts only counted sets within the window", () => {
    const now = Date.now();
    const workouts = [
      { date: todayKey(new Date(now - 5 * 86400000)), sets: [
        { exerciseId: "bench", warmup: false },
        { exerciseId: "bench", warmup: true },
      ] },
      { date: todayKey(new Date(now - 90 * 86400000)), sets: [{ exerciseId: "bench", warmup: false }] },
    ];
    const byCap = volumeByCapability(workouts, exercises, 28, now);
    expect(byCap.horizontal_press).toBe(1);
  });
});

describe("progressionPct", () => {
  const exercises = [barbell("bench", "Bench", ["horizontal_press"])];
  it("returns null with fewer than two counted sets", () => {
    expect(progressionPct([], exercises, "bench", "lb", 0, 56)).toBeNull();
  });
  it("computes percent change between first and last set in the window", () => {
    const now = Date.now();
    const workouts = [
      { date: todayKey(new Date(now - 40 * 86400000)), sets: [{ exerciseId: "bench", weight: 100, reps: 5, unit: "lb" }] },
      { date: todayKey(new Date(now - 5 * 86400000)), sets: [{ exerciseId: "bench", weight: 110, reps: 5, unit: "lb" }] },
    ];
    const pct = progressionPct(workouts, exercises, "bench", "lb", 0, 56, now);
    expect(pct).toBeCloseTo(round1(((epley(110, 5) - epley(100, 5)) / epley(100, 5)) * 100), 3);
  });
});

describe("trajectoryDivergence", () => {
  const exercises = [barbell("bench", "Bench", ["horizontal_press"]), barbell("row", "Row", ["horizontal_pull"])];
  it("is insufficient with too little data", () => {
    expect(trajectoryDivergence([], exercises, "bench", "row", "lb", 0).status).toBe("insufficient");
  });
  it("is balanced when both lifts move together", () => {
    const now = Date.now();
    const workouts = [
      { date: todayKey(new Date(now - 40 * 86400000)), sets: [
        { exerciseId: "bench", weight: 100, reps: 5, unit: "lb" },
        { exerciseId: "row", weight: 100, reps: 5, unit: "lb" },
      ] },
      { date: todayKey(new Date(now - 5 * 86400000)), sets: [
        { exerciseId: "bench", weight: 103, reps: 5, unit: "lb" },
        { exerciseId: "row", weight: 103, reps: 5, unit: "lb" },
      ] },
    ];
    expect(trajectoryDivergence(workouts, exercises, "bench", "row", "lb", 0, 56, now).status).toBe("balanced");
  });
  it("flags diverging trajectories with a leader and laggard", () => {
    const now = Date.now();
    const workouts = [
      { date: todayKey(new Date(now - 40 * 86400000)), sets: [
        { exerciseId: "bench", weight: 100, reps: 5, unit: "lb" },
        { exerciseId: "row", weight: 100, reps: 5, unit: "lb" },
      ] },
      { date: todayKey(new Date(now - 5 * 86400000)), sets: [
        { exerciseId: "bench", weight: 130, reps: 5, unit: "lb" },
        { exerciseId: "row", weight: 100, reps: 5, unit: "lb" },
      ] },
    ];
    const t = trajectoryDivergence(workouts, exercises, "bench", "row", "lb", 0, 56, now);
    expect(t.status).toBe("diverging");
    expect(t.leader).toBe("Bench");
    expect(t.laggard).toBe("Row");
  });
});

describe("balancedScorecard", () => {
  const exercises = [barbell("bench", "Bench", ["horizontal_press"]), barbell("row", "Row", ["horizontal_pull"])];

  const setsOf = (n, exerciseId) => Array.from({ length: n }, () => ({ exerciseId, weight: 100, reps: 5, unit: "lb", warmup: false }));

  it("calls out insufficient data below the minimum set count", () => {
    const now = Date.now();
    const data = { exercises, workouts: [{ date: todayKey(new Date(now - 5 * 86400000)), sets: setsOf(2, "bench") }] };
    const card = balancedScorecard(data, "lb", { sinceDays: 28, now });
    expect(card.volume.find((v) => v.key === "push_pull").status).toBe("insufficient");
  });

  it("detects a sustained lean across two consecutive windows", () => {
    const now = Date.now();
    const data = {
      exercises,
      workouts: [
        { date: todayKey(new Date(now - 10 * 86400000)), sets: setsOf(10, "bench") },
        { date: todayKey(new Date(now - 40 * 86400000)), sets: setsOf(10, "bench") },
      ],
    };
    const card = balancedScorecard(data, "lb", { sinceDays: 28, now });
    const pushPull = card.volume.find((v) => v.key === "push_pull");
    expect(pushPull.lean).toBe("pressing");
    expect(pushPull.status).toBe("sustained-lean");
  });

  it("calls a fresh (non-sustained) lean out separately from a sustained one", () => {
    const now = Date.now();
    const data = {
      exercises,
      workouts: [
        { date: todayKey(new Date(now - 10 * 86400000)), sets: setsOf(10, "bench") },
        { date: todayKey(new Date(now - 40 * 86400000)), sets: [...setsOf(5, "bench"), ...setsOf(5, "row")] },
      ],
    };
    const card = balancedScorecard(data, "lb", { sinceDays: 28, now });
    expect(card.volume.find((v) => v.key === "push_pull").status).toBe("lean");
  });

  it("reports balanced volume when both sides are close", () => {
    const now = Date.now();
    const data = { exercises, workouts: [{ date: todayKey(new Date(now - 5 * 86400000)), sets: [...setsOf(6, "bench"), ...setsOf(6, "row")] }] };
    const card = balancedScorecard(data, "lb", { sinceDays: 28, now });
    expect(card.volume.find((v) => v.key === "push_pull").status).toBe("balanced");
  });

  it("never asserts a bare numeric target ratio in its notes", () => {
    const now = Date.now();
    const data = { exercises, workouts: [{ date: todayKey(new Date(now - 5 * 86400000)), sets: setsOf(10, "bench") }] };
    const card = balancedScorecard(data, "lb", { sinceDays: 28, now });
    card.volume.forEach((v) => expect(v.note).not.toMatch(/should be \d+:\d+/));
  });
});

describe("rankedChanges", () => {
  it("puts red goals and pain flags ahead of amber goals and scorecard leans", () => {
    const goalVerdicts = [
      { status: "amber", goal: { id: "g1" }, headline: "amber issue" },
      { status: "red", goal: { id: "g2" }, headline: "red issue" },
      { status: "green", goal: { id: "g3" }, headline: "fine" },
    ];
    const scorecard = {
      volume: [{ key: "push_pull", status: "sustained-lean", lean: "pressing", a: 10, b: 2, note: "" }],
      trajectories: [],
      painFlags: [{ text: "pain flagged" }],
    };
    const ranked = rankedChanges(goalVerdicts, scorecard);
    expect(ranked[0].priority).toBe(0);
    expect(ranked.some((r) => r.text === "red issue")).toBe(true);
    expect(ranked.some((r) => r.text === "pain flagged")).toBe(true);
    expect(ranked.find((r) => r.text === "fine")).toBeUndefined();
    const priorities = ranked.map((r) => r.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });
});

describe("mostTrainedExercise", () => {
  const exercises = [barbell("bench", "Bench", ["horizontal_press"]), barbell("incline", "Incline Press", ["horizontal_press"])];
  it("returns null with no logged sets for the capability", () => {
    expect(mostTrainedExercise([], exercises, "horizontal_press")).toBeNull();
  });
  it("picks whichever exercise has more counted sets", () => {
    const workouts = [{ date: "2026-01-01", sets: [
      { exerciseId: "bench", warmup: false }, { exerciseId: "bench", warmup: false },
      { exerciseId: "incline", warmup: false },
    ] }];
    expect(mostTrainedExercise(workouts, exercises, "horizontal_press")).toBe("bench");
  });
});

describe("topVerdict", () => {
  const exercises = [barbell("bench", "Bench", ["horizontal_press"]), barbell("carry", "Farmer Carry", ["carry"])];
  it("returns null with no goals", () => {
    expect(topVerdict({ goals: [], exercises, plans: [], workouts: [] }, "lb")).toBeNull();
  });
  it("surfaces the worst-status goal first", () => {
    const data = {
      exercises,
      plans: [{ id: "p1", items: [{ exerciseId: "bench" }] }],
      workouts: [], bodyweightLog: [],
      goals: [
        { id: "fine", label: "Fine", capabilities: [], target: null },
        { id: "broke", label: "Broken", capabilities: ["carry"], target: null },
      ],
    };
    expect(topVerdict(data, "lb").goal.id).toBe("broke");
    expect(topVerdict(data, "lb").status).toBe("red");
  });
});

describe("CAPABILITY_COLORS", () => {
  it("assigns a distinct color to every capability", () => {
    const caps = Object.keys(CAPABILITIES);
    const colors = caps.map((c) => CAPABILITY_COLORS[c]);
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBe(caps.length);
  });
  it("produces valid hsl() strings", () => {
    Object.values(CAPABILITY_COLORS).forEach((c) => expect(c).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/));
  });
});

describe("generateWarmupRamp", () => {
  it("is just the bar when the working weight is at or below it", () => {
    expect(generateWarmupRamp(45, "lb")).toEqual([{ weight: 45, reps: 5 }]);
    expect(generateWarmupRamp(30, "lb")).toEqual([{ weight: 45, reps: 5 }]);
  });
  it("builds an ascending ramp from the bar up to (but not reaching) the working weight", () => {
    const ramp = generateWarmupRamp(225, "lb");
    expect(ramp[0]).toEqual({ weight: 45, reps: 5 });
    for (let i = 1; i < ramp.length; i++) expect(ramp[i].weight).toBeGreaterThan(ramp[i - 1].weight);
    ramp.forEach((s) => expect(s.weight).toBeLessThan(225));
  });
  it("never produces a weight below the bar, even for a light working weight just above it", () => {
    const ramp = generateWarmupRamp(50, "lb");
    ramp.forEach((s) => expect(s.weight).toBeGreaterThanOrEqual(45));
  });
  it("works in kg with the kg bar and step", () => {
    const ramp = generateWarmupRamp(100, "kg");
    expect(ramp[0]).toEqual({ weight: 20, reps: 5 });
    ramp.forEach((s) => expect(s.weight % 2.5).toBeCloseTo(0, 5));
  });
});

describe("needsBackupReminder", () => {
  it("never nags with no workouts logged yet", () => {
    expect(needsBackupReminder({ workouts: [] })).toBe(false);
  });
  it("nags once 8+ sessions have been logged with no export at all", () => {
    const now = new Date(2026, 0, 8); // close to the fixture dates, so only the session count is in play
    const workouts = Array.from({ length: 8 }, (_, i) => ({ date: `2026-01-0${i + 1}`, sets: [] }));
    expect(needsBackupReminder({ workouts, lastExportAt: null }, now)).toBe(true);
    expect(needsBackupReminder({ workouts: workouts.slice(0, 3), lastExportAt: null }, now)).toBe(false);
  });
  it("nags once 30+ days have passed since the last export, even with few sessions", () => {
    const now = new Date(2026, 2, 1);
    const workouts = [{ date: "2026-02-25", sets: [] }];
    expect(needsBackupReminder({ workouts, lastExportAt: "2026-01-01" }, now)).toBe(true);
    expect(needsBackupReminder({ workouts, lastExportAt: "2026-02-20" }, now)).toBe(false);
  });
  it("only counts sessions logged after the last export toward the session threshold", () => {
    const workouts = [
      { date: "2026-01-01", sets: [] }, { date: "2026-01-02", sets: [] }, { date: "2026-01-03", sets: [] },
    ];
    expect(needsBackupReminder({ workouts, lastExportAt: "2026-01-02" }, new Date(2026, 0, 3))).toBe(false);
  });
});

describe("importData", () => {
  it("returns null for invalid JSON", () => {
    expect(importData("not json")).toBeNull();
  });
  it("returns null for valid JSON that isn't a real export", () => {
    expect(importData(JSON.stringify({ foo: "bar" }))).toBeNull();
  });
  it("migrates a valid export just like a localStorage load would be", () => {
    const exported = JSON.stringify({ workouts: [{ date: "2026-01-01", sets: [{ exerciseId: "e1", weight: 100, reps: 5 }] }] });
    const imported = importData(exported);
    expect(imported.workouts[0].sets[0].scheme).toBe("straight");
    expect(imported.goals).toEqual([]);
  });
});

/* ============ seed data sanity ============ */

describe("seed data", () => {
  it("gives every seed exercise a capabilities array", () => {
    SEED_EXERCISES.forEach((ex) => expect(Array.isArray(ex.capabilities)).toBe(true));
  });
  it("keeps every plan's exercise ids valid", () => {
    const ids = new Set(SEED_EXERCISES.map((e) => e.id));
    SEED_PLANS.forEach((p) => p.items.forEach((it) => expect(ids.has(it.exerciseId)).toBe(true)));
  });
  it("gives every goal template a valid targetKind", () => {
    const kinds = ["lift", "event", "bodyweight", "none"];
    GOAL_TEMPLATES.forEach((t) => expect(kinds).toContain(t.targetKind));
  });
});

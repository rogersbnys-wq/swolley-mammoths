# Swolley Mammoths

A lifting log that shows you last time, right where you need it.

Local-first: every set lives in `localStorage` on the device. No account, no server,
no backend bill. Export to JSON any time from the History tab.

---

## Run it locally

```bash
npm install
npm run dev
```

Open the printed URL. To test on your actual phone over wifi, run `npm run dev -- --host`
and open the network address it prints.

---

## Deploy it

### GitHub Pages (current)

Live at `rogersbnys-wq.github.io/swolley-mammoths`, deployed by
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) — every push to
`main` runs the tests, builds, and publishes automatically. No separate hosting account,
so no separate billing relationship that can hit a wall (this replaced Netlify after that
team's plan paused production deploys with zero warning on the app itself — the git repo
kept taking pushes fine, the deploy step just silently stopped happening).

One-time setup this workflow can't do on its own: in the repo's **Settings → Pages**, set
**Source** to **GitHub Actions**. After that it's hands-off.

Pages serves from a subpath, which is why `vite.config.js` sets:

```js
base: "/swolley-mammoths/",
```

Deploying somewhere else (Netlify, Vercel, a custom domain) needs this commented back out
first — those serve from the domain root instead.

### Netlify / Vercel

Both work the same way: push this repo to GitHub, then at
[app.netlify.com](https://app.netlify.com) or [vercel.com/new](https://vercel.com/new),
**import the repo** — either one detects Vite automatically (build command `npm run build`,
publish directory `dist`) and redeploys on every push to `main`. Remember to comment out
the `base` line above first.

---

## Install it to a home screen

**iPhone (Safari — must be Safari, not Chrome):** open the URL → Share button →
**Add to Home Screen**. It launches fullscreen with no browser chrome.

**Android (Chrome):** open the URL → menu → **Install app**.

Send your friend the same link and they do the same. Their data is theirs — it's
stored on their phone, not yours. Nothing syncs between you, which is the right
default for v1.

---

## Where the data lives

One `localStorage` key: `swolleymammoths:v1`.

```js
{
  unit: "lb",
  exercises: [{ id, name, group, bar }],
  workouts: [{ id, date, sets: [{ id, exerciseId, weight, reps, ts }] }]
}
```

Every set is stored as its own row, never aggregated. Charts, PRs, volume, 1RM
projections, and future coaching are all queries over that table.

### What it does

- **Any exercise type** — barbell, dumbbell, machine, bodyweight, timed/carry. Each mode
  asks only for the fields that apply, and barbell lifts get a plate-loading strip.
- **Last time, in full** — every set from your previous session for that lift, with the best
  one highlighted and any note you left. Entry fields pre-fill with last session's load.
- **Plans** — reusable templates with per-exercise cues and set/rep targets. Load one into
  today, reorder, add, or **swap** an exercise when the equipment is taken.
- **1RM from every set** — see below.
- **Bodyweight** — tracked with a date, and counted into pull-ups, dips, and every
  bodyweight lift.

### How the 1RM estimate works

Single-set formulas like Epley assume everyone loses ~3.3% per extra rep. That isn't true —
some lifters hold reps far better than others, and for them Epley overestimates badly.

Instead, every set you've logged becomes a point of (reps, load), and a weighted least
squares line is fitted through them and read off at one rep. Each set is weighted by three
things: how close it was to your peak effort (so warmups taper out), how recent it is
(45-day half life), and whether you tagged reps-in-reserve.

The fit needs *rep-range variety* to find a slope. Sets at a single rep count are all kept
and counted, but until you log a different rep range the app falls back to the single-set
formula and says so.

Tagging **reps left in the tank** matters more than volume: 225x5 with two in reserve is a
very different data point from 225x5 grinding. Untagged sets are treated as if taken to
failure, which makes the estimate a floor rather than a ceiling.

### Units

Each set stores the unit it was logged in. Flipping lb/kg re-expresses your whole
history for display; it never rewrites the stored numbers, so toggling back and forth
can't accumulate rounding drift.

### Offline

`public/sw.js` caches the app shell, so once it's been opened online it launches with
no connection. It uses runtime caching rather than a precache list, because Vite hashes
asset filenames and a hardcoded list would go stale on every deploy. Navigations go to
the network first, so a redeploy is picked up on the next launch.

**Caveat worth knowing:** `localStorage` is per-browser and per-device. Clearing site
data wipes it, and it does not follow you to a new phone. Use **Export ledger as JSON**
in the History tab as your backup. When that stops being good enough, swap `loadData`
and `saveData` at the top of `src/App.jsx` — they're the only two functions that touch
storage. Everything else lives in `src/logic.js` as pure functions (`epley`, `platesPerSide`,
`todayKey`, the Coach's `planCoverage`/`goalVerdict`/`balancedScorecard`, …), covered by
`src/logic.test.js` — see **Tests** below.

---

## Tests

```bash
npm test          # run once (Vitest)
npm run test:watch
```

`src/logic.js` is the pure core — no DOM, no storage — and `src/logic.test.js` is the
main suite. `src/App.test.jsx` adds a handful of render-level smoke tests on top of it.

---

## What's next

- **Phase 1–3.5** ✅ — exercise library, five exercise modes, plans with mid-session swap,
  multi-set weighted 1RM, goals with capability-based pace tracking, rule-based coaching,
  bodyweight-adjusted strength, warmup/pain tagging excluded from analysis.
- **Phase 4** ✅ — **the Coach evaluation engine**: `planCoverage`, per-goal green/amber/red
  verdicts, plan-save critique, and a balanced scorecard (volume leans + trajectory
  divergence) framed as leans and trends with an evidence qualifier, never an asserted
  target ratio. See the PRD's §8.5.
- **Phase 5** ✅ — warmup ramp auto-generation, set edit + 6-second undo, a per-exercise
  rest timer, multi-day programs, the movement-equivalence model with cross-exercise
  progression continuity, adherence (log ↔ plan), the remaining scorecard layers
  (strength-ratio + domain balance), and a session-completion summary screen. Also closed
  §8.10's data-durability gap (JSON import + a backup-due nag) — the PRD's own
  top-flagged risk, since Safari can evict `localStorage` under disk pressure on iPhone.
- **Phase 6** ✅ — **"this week" capability status** on the Coach tab: per goal capability,
  actual sessions logged this calendar week against a target — the real cadence of an
  active multi-day program when one exists, or `CAPABILITY_FREQUENCY_FLOOR`'s sourced,
  hedged frequency-floor guidance (train a pattern ≥2x/week) when it doesn't. Fills the
  gap between `planCoverage` (checks the plan's blueprint, never whether it got trained)
  and the balanced scorecard (compares patterns against each other, never against what a
  goal actually needs).
- **Next up — accounts + cloud sync (decided, not yet started).** Real sign-in with
  data following you across devices, replacing the current local-first/export-import
  model. This is the single biggest architectural change so far — it needs a backend
  (a serverless function + managed DB) — and it's also the foundation the conversational
  coach (below) will need regardless. Everything else on this list can wait behind it if
  it needs to.
- **Later** — IndexedDB migration, conversational coach, myth buster, progress photos,
  side-by-side comparison, nutrition/supplements. Onboarding wizard remains deliberately
  skipped — goal creation lives on the Coach tab instead of first-run.
  - **LLM-personalized weekly targets.** The frequency floor above is deliberately
    generic, sourced guidance — the same architectural fork as the conversational coach:
    a live model call, grounded in the user's own goals, history, and equipment, could
    replace it with an actually-reasoned recommendation instead of a population default.
    Rides on the same backend as accounts/conversational coach; not worth its own
    infrastructure before that lands.

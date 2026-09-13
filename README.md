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

### Netlify (easiest)

1. Push this folder to a new GitHub repo.
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
3. Pick the repo. Netlify detects Vite automatically; confirm the settings are:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy. You get a URL like `swolley-mammoths.netlify.app`.
5. Optional: **Site settings → Change site name** to something you like.

Every push to `main` redeploys automatically.

### Vercel

Same flow at [vercel.com/new](https://vercel.com/new) — import the repo, accept the
detected Vite preset, deploy.

### GitHub Pages

Pages serves from a subpath, so first uncomment this line in `vite.config.js`:

```js
base: "/swolley-mammoths/",
```

Then build and publish `dist/`. Simplest route is the `gh-pages` package:

```bash
npm install -D gh-pages
```

Add to `package.json` scripts:

```json
"deploy": "npm run build && gh-pages -d dist"
```

Then `npm run deploy`, and in the repo's **Settings → Pages**, set the source to the
`gh-pages` branch.

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
- **Phase 4** ✅ (this change) — **the Coach evaluation engine**: `planCoverage` (does your
  training even cover a goal's required movement patterns), a per-goal green/amber/red
  verdict combining plan coverage with pace, a critique shown the moment a plan is saved,
  and a balanced scorecard (push:pull, quad:hinge, horizontal:vertical volume leans plus
  trajectory divergence) — framed as leans and trends with an evidence qualifier, never an
  asserted target ratio. See the PRD's §8.5 for the full spec this implements.
  **Deliberately deferred to later phases**, per the PRD's own phasing: multi-day programs,
  the movement-equivalence model with cross-exercise progression continuity, adherence
  (log ↔ plan), a rest timer and wake lock, and the onboarding wizard — goal creation
  currently lives on the Coach tab rather than first-run.
- **Phase 5** — movement-equivalence model, cross-exercise progression continuity,
  adherence, one-tap plan fixes, trajectory divergence depth
- **Phase 6** — IndexedDB migration, backend, conversational coach, myth buster
- **Phase 7** — progress photos, side-by-side comparison

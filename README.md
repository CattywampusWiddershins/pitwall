# Pitwall — F1 25 Career Tracker

A desktop app for tracking your F1 25 driver career: every session result for every driver, fastest laps, championship standings, head-to-head stats, season goals and AI-driven media sessions.

## Run it

You need [Node.js](https://nodejs.org) (LTS) installed once.

1. Unzip this folder somewhere permanent, e.g. `Documents\Pitwall`.
2. Open a terminal in that folder (in File Explorer: type `cmd` in the address bar and press Enter).
3. Run:

```
npm install
npm start
```

`npm install` is only needed the first time. After that, `npm start` opens the app.

## Build a proper Windows app (.exe)

```
npm run dist:win
```

This creates a `dist` folder containing:

- `Pitwall-<version>-portable.exe` — a single file you can double-click from anywhere (pin it to your taskbar or put it on the desktop)
- a `.zip` with the unpacked app

On a Mac use `npm run dist:mac`; on Linux `npm run dist:linux`.

Windows may show a SmartScreen warning the first time because the app isn't code-signed. Click **More info → Run anyway**.

## How seasons work

Every career contains every real season from 2016, read-only, with full qualifying, sprint and race results. Standings, stories, ratings, records and stats all count them.

- **Start in 2016–2024:** the real grid and calendar of that year. Each following season starts from the real grid of its year, with the moves made in your career on top.
- **Start in 2025:** the F1 25 grid. If your game added an 11th team, pick **APXGP** (Sonny Hayes and Joshua Pearce) or **Konnersport** (Aiden Jackson and Callie Mayer); it races 2025 only. Starting earlier, you're asked when your career reaches 2025; starting later, neither exists.
- **2026:** the 2026 Season Pack grid. **Audi** replaces Kick Sauber, **Cadillac** joins (Pérez and Bottas), and Madrid replaces Imola on the calendar.
- **Start after 2026:** you lay out the grid and calendar of your first season. The years between 2026 and your start are simulated race by race, with a driver market that ends on your grid.
- **From 2027 in your career:** the grid carries over and the rest of the market moves on its own (retirements, top teams signing drivers who beat their car, F2 and F3 rookies). Your own moves go in **Transfers**.
- **Simulated years and the AI market:** nobody races in the year they turn 44. A driver is only dropped if he is more than 0.3 s a lap slower than his teammate over two seasons (0.6 s for a driver under 30), and even then only 40% of the time; good drivers stop on their own terms. Free agents retire after three seasons out (or at 44), and a good one occasionally returns in place of a struggling driver. McLaren, Red Bull, Mercedes and Ferrari stay the top teams; a midfield team breaks in only rarely. Drivers who beat their car move up to a top team, replacing someone there who is struggling or only matching the car, who takes the seat that was left. Driver pace comes from every teammate battle of the last four seasons, linked into one scale, so the best drivers in the best cars win titles. Each career keeps its own F2 (22) and F3 (30) fields: whoever reaches F1 is replaced by new generated talent, F3 drivers step up after two years, and anyone not in F1 after two years in F2 (four in all) drops off.
- **Laying out a later grid:** drivers who would be retired by then are flagged, with **Auto-fill** to replace them from free drivers, F2/F3, your own drivers or new talent.

Rosters and calendars are editable under **Settings**, including adding back circuits that have left the calendar.

## Logging a weekend

Open a round from **Season**. Each weekend has a tab per session (practice, sprint qualifying, sprint, qualifying, race; practice format is set in Settings). For each session you can:

- **Tap finishing order** — click drivers in order, fastest way to enter 22 positions
- **Fill order** from another session, the championship, or team order
- drag rows or use the arrows to adjust
- enter best lap and gap for any driver (press Enter to jump to the next row)
- set DNF / DNS / DSQ in sprints and races

The fastest lap of every session is detected from the quickest lap time and highlighted purple. You can override it if you only log some times.

Points use the 2025+ rules: 25-18-15-12-10-8-6-4-2-1 for races, 8-1 for sprints, no fastest-lap point. Real seasons keep the points they were actually scored with.

## AI media sessions

Go to **Media → New media session** (or the Media button on any weekend). Pick pre-season, post-qualifying, post-race, mid-season or end-of-season. Journalists ask questions based on your results, driver type, personality, teammate battle, rival, goals and weekend notes. Answer them, then publish to get a press article, paddock reactions and a change to your media reputation.

For AI-written questions and articles, add an Anthropic API key in **Settings → AI media engine** (get one at console.anthropic.com; usage is billed to your API account). The key is stored encrypted on your computer. Without a key, media sessions still work using built-in question templates.

## Your data

Everything saves automatically to your user folder (`%APPDATA%\Pitwall\career-data.json` on Windows), with a daily backup kept for 14 days in the `backups` folder next to it. Use **Settings → Export backup** to save a copy anywhere.

## Versions and rolling back

The project is a git repository. Every release is tagged (`v1.1.0`, `v1.2.0`, …). To see them:

```
git tag
```

To go back to a release, for example 1.1.0, and rebuild it:

```
git checkout v1.1.0
npm run dist:win
```

`git checkout main` returns to the latest version. Your career data is stored outside the project, so switching versions never touches it (an older version may not understand data saved by a newer one, so export a backup first).

## Real results data

`src/history.js` (every season from 2016 and the record book before it) is generated from the [Jolpica F1 API](https://github.com/jolpica/jolpica-f1). `src/assets.js` holds circuit outlines from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT) and flags from [flag-icons](https://github.com/lipis/flag-icons) (MIT). To rebuild them:

```
node scripts/fetch-history.js
node scripts/build-history.js
node scripts/build-assets.js
```

The first downloads into `data-raw/` (about an hour, at the API's rate limit) and only fetches what's missing on later runs.

## Project layout

```
main.js            Electron main process: window, file storage, API calls
preload.js         Safe bridge between the window and main process
companion.js       Phone/tablet link
src/index.html     App shell
src/styles.css     Styling
src/data.js        Grids, calendars, points, driver types (edit to change defaults)
src/reference.js   Real-world bios, circuits, team records
src/history.js     Real seasons from 2016 (generated)
src/assets.js      Circuit maps and flags (generated)
src/pool.js        F2 and F3 drivers for the transfer pool
src/app.js         The app: career model, stats, views, media engine
scripts/           Data builders and a test server (node scripts/serve.js)
android/           The Android companion app
```

You can also run `node scripts/serve.js` and open http://localhost:5173 to try it in a browser; data then stays in that browser and AI media is unavailable.

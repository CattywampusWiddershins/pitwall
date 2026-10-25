# Pitwall â€” F1 25 Career Tracker

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

- `Pitwall-1.1.0-portable.exe` â€” a single file you can double-click from anywhere (pin it to your taskbar or put it on the desktop)
- a `.zip` with the unpacked app

On a Mac use `npm run dist:mac`; on Linux `npm run dist:linux`.

Windows may show a SmartScreen warning the first time because the app isn't code-signed. Click **More info â†’ Run anyway**.

## How seasons work

- **Season 1 (2025):** the F1 25 grid with all ten teams plus **APXGP** (Sonny Hayes and Joshua Pearce). You choose which seat you took over.
- **Season 2 (2026):** the 2026 Season Pack grid. APXGP leaves, **Audi** replaces Kick Sauber, **Cadillac** joins (PÃ©rez and Bottas), Lindblad joins Racing Bulls, Hadjar moves to Red Bull, and Madrid replaces Imola on the calendar.
- **Season 3 onwards:** carries the previous season's roster forward.

Rosters and calendars are editable under **Settings** so you can mirror driver-market moves, cancelled rounds, sprint changes or shortened seasons from your save.

## Logging a weekend

Open a round from **Season**. Each weekend has a tab per session (practice, sprint qualifying, sprint, qualifying, race; practice format is set in Settings). For each session you can:

- **Tap finishing order** â€” click drivers in order, fastest way to enter 22 positions
- **Fill order** from another session, the championship, or team order
- drag rows or use the arrows to adjust
- enter best lap and gap for any driver (press Enter to jump to the next row)
- set DNF / DNS / DSQ in sprints and races

The fastest lap of every session is detected from the quickest lap time and highlighted purple. You can override it if you only log some times.

Points use the 2025+ rules: 25-18-15-12-10-8-6-4-2-1 for races, 8-1 for sprints, no fastest-lap point.

## AI media sessions

Go to **Media â†’ New media session** (or the Media button on any weekend). Pick pre-season, post-qualifying, post-race, mid-season or end-of-season. Journalists ask questions based on your results, driver type, personality, teammate battle, rival, goals and weekend notes. Answer them, then publish to get a press article, paddock reactions and a change to your media reputation.

For AI-written questions and articles, add an Anthropic API key in **Settings â†’ AI media engine** (get one at console.anthropic.com; usage is billed to your API account). The key is stored encrypted on your computer. Without a key, media sessions still work using built-in question templates.

## Your data

Everything saves automatically to your user folder (`%APPDATA%\Pitwall\career-data.json` on Windows), with a daily backup kept for 14 days in the `backups` folder next to it. Use **Settings â†’ Export backup** to save a copy anywhere.

## Project layout

```
main.js        Electron main process: window, file storage, API calls
preload.js     Safe bridge between the window and main process
src/index.html App shell
src/styles.css Styling
src/data.js    Grids, calendars, points, driver types (edit to change defaults)
src/app.js     The app: career model, stats, views, media engine
```

You can also open `src/index.html` directly in a browser to try it; data then stays in that browser and AI media is unavailable.

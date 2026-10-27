# Pitwall — F1 25 Career Tracker

A desktop app for tracking your F1 25 driver career: every session result for every driver, fastest laps, championship standings, head-to-head stats, season goals and AI-driven media sessions.

**Window size.** The desktop app fills the window, and a window wider than 1800 (in Windows’ display-scaled pixels) also grows the text and controls, up to 160%.

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

## Racing as a real driver

A Driver Career can follow a real driver instead of one you create (F1 25 mods let a career start in 2016 as anyone). Pick the year, then **A real driver** under *Who you race as*, and choose from that year’s opening grid; setup shows their real path. You are that driver: Pitwall follows them as “you”, and the profile comes from them. Every season starts on the real grid, and real line-up changes happen as you log the races: Verstappen starts 2016 at Toro Rosso and swaps with Kvyat for round 5. Changes are found by comparing the real line-up race by race (drivers who stood in for three races or fewer count as the regular), and each goes on record as a transfer, so results stay with the team of the day. If real life dropped your driver mid-season, you keep the seat; if they didn’t start a season, the next-season window asks which seat they take. Real data runs to 2025; 2026 starts on F1 25’s grid, and after that the driver market runs itself.

## My Team

Start a My Team career from **New career**. Its dashboard is the team's home: the next race, goals, both championships, rivalries, and tabs for identity, car development, finances and sponsors. Your rival is another team.

## Goals

Every season has **team goals** (constructors' position or points, wins, podiums, finishing ahead of a named team) and **driver goals** (yours in a Driver Career, set per driver in My Team). Each new season asks for them again.

## Rivalries

- **Title rivals:** from the fifth race on, anyone within 25 points of the championship leader (43 for constructors) is a title rival. The press plays it up more the closer it gets, and it fades as the gap grows, ending at 75 points (129), or once the title is out of reach.
- **Archrivals:** title rivals for 70% of a season become archrivals. Each driver and team has one at a time, until a closer rivalry takes over or one of them retires; the retirement story looks back on it. Archrivals get a mention whenever they qualify or finish side by side, and a rematch for a title is big news.
- **Rivals aren't picked.** Your rival (and your team's, in My Team) comes from the title fights and archrivalries above.
- **Wheel to wheel:** two drivers who have a battle (see below) in two races in a row, a sprint and its Grand Prix included, become rivals on track. It lasts until they go three races in a row without one, and can start again later. They show on the dashboard, get a story when it starts and ends, a mention when they qualify side by side, and questions in interviews. Races without pass data (logged by hand, or before 1.9.5) don't count either way.
- **Your own:** start a rivalry from **Stories** after contact, a crash or hard racing. For five races the reports bring it up when the two qualify side by side or finish within five seconds.

## Results straight from F1 25

Pitwall can log sessions from the game itself, using F1 25's UDP telemetry. Turn it on in **Settings → F1 25 telemetry** and pick a port (20778 by default). In the game, under **Settings → Telemetry Settings**: UDP Telemetry On, Broadcast Mode Off, UDP Format 2025, and send it to this PC on that port (127.0.0.1 if the game runs here). If another app already receives the game's data (a wheel base's software, say), have it forward to Pitwall's port instead.

With Pitwall open on the PC, each finished session is logged by itself: the career you have open, the next round at that circuit not yet logged, and the session type the game reports. It fills the order, best laps, race times and gaps (penalties included), laps down and retirements, and keeps every lap, tyre stint, pit stop and penalty: race pace then uses each driver's clean laps, the weekend page shows a strategy table, and race reports mention penalties. A session you logged yourself is never replaced without asking, Time Trial and online sessions are ignored, and the banner after an import has Undo. My Team finances and upgrades are not part of the game's telemetry, so they stay manual.

**Three-part qualifying (Q1–Q3, SQ1–SQ3).** Each part you run is merged into one qualifying result. Drivers knocked out in a part keep their own time and place. If you're knocked out yourself, the game stops sending results, so the places above you are provisional: they get worked-out times instead of the earlier part's. Pole is 0.2–0.4 s quicker than the best time in the last timed part if you went out in Q2, 0.4–0.7 s if in Q1, and each driver's gap to the car ahead follows their season qualifying pace (a driver on average 0.04 s off a teammate ends up about 0.04 s behind). Someone ahead of a driver who is quicker on paper stays within 0.15 s, so a surprise result doesn't skew the pace tables. When the race or sprint starts, Pitwall reads the starting grid from the game, puts those drivers in order and works the times out again. A skipped qualifying session, where the game gives the order but no times, is timed the same way. A provisional driver who starts behind the knocked-out drivers has a grid penalty; their own time was never known, so they're listed at the back of the provisional places without one.

**Practice you skipped** is filled in when qualifying is logged: much the same order as qualifying, about seven tenths slower, and marked as estimated.

**Every lap.** On the weekend page, tap a driver in the strategy (or practice runs) table for all their laps, a lap-time graph and tyre wear for each stint; in practice, a dashed line shows where each run's wear was heading and roughly how many laps the tyre would last (to 70% wear).

**Incidents.** The race director's calls come in too: warnings and penalties with the reason (track limits, pit-lane speeding, causing a collision…) and every bit of contact. A collision penalty or warning says who was to blame; contact the stewards let go is minor, and the car that was behind takes the blame (or it's a racing incident if that isn't known). Race reports and stories cover them, with both drivers reacting: the one at fault apologises or denies it, the other forgives or is annoyed, more strongly when it was a big one. Your own words are never made up. Interviews ask about incidents involving you.

**Overtakes and battles.** Every pass is logged as it happens, anywhere on the lap: two cars swapping places between one lap data packet and the next (the game sends them many times a second; its own overtake event stands in if a session never shows a swap). Passes into or out of the pit lane, or of a stopped car, don't count. A pass counts once it has held for 0.25 s: retaken sooner, it was the timing flickering and both cancel out; retaken later, the two are racing wheel to wheel and both count. A battle is two drivers who swapped places at least eight times in a race, each passing the other at least twice. A battle for the lead (the two ran first and second during it) always comes first: it gets the battle story, called the battle for the win. When the winner took the lead with a pass in the last five laps, the race report leads with it, and so does the season review. The race strategy table lists the battles and who passed most; race reports describe them.

**Gaps for lapped cars.** A lapped car gets its gap to the winner from the game's own interval as it takes the flag (plus any time penalty); “+1 lap” is only used when the game sent no interval.

**Race reports and the season review.** Race reports now tell how the race unfolded: the start, safety cars and red flags, the incidents that mattered, the battles and the big climbs. Once every round of a season is in, a season review runs in Stories and on the Season Review page: what kind of season it was, then every race in chapters named after what happened in them (the winner, then the two or three things that mattered most that day: the title changing hands or being settled, contenders retiring, big incidents, battles, great drives, first podiums), then the numbers, the battles of the year and your own season. Wording is picked so the same phrase doesn't come round again until the others have been used.

**Final-race showdowns.** When the drivers’ title goes to the last race, it gets the full treatment. The preview sets the scene (the gaps, form over the last three races, the head-to-head, last year at this circuit, the last time a title went to the final race in your career) and says what each contender needs: the leader’s minimum (“only needs third, whatever happens behind”), and for a chaser the lowest place that still gives a chance plus the results that have to go their way. The title story afterwards tells it again in the past tense, then how the race played out for the contenders and how it ended, with quotes from the champion and the beaten. The season review gives the decider its own section. With laps logged from F1 25, a chart shows the title lap by lap (each contender’s points if the race had ended on that lap), and the story says who was champion on the road and when it changed hands. Any race where the title could be settled before the last one gets the chart in its race report. Every change of title holder says what caused it: an overtake (with what led to it: a gap closed down, fresher tyres, a long fight), a pass on the driver holding it, a pit stop, a car ahead retiring, a title rival retiring, or a time penalty after the flag. A late swing (in the last five laps, or the last 15% of the race), or one a rival’s retirement decided, gets the full story: who looked like champion and for how long, where everyone was, what the eventual champion still needed (“one more place, or for Norris to lose one”), and the moment it turned, with a headline to match.

**Current Weekend.** A tab for the round you're on. The qualifying forecast builds each driver's ideal lap from their best sector 1, 2 and 3 across all practice sessions. The race forecast takes the grid's long runs (as the strategy does), how each driver compared on the same tyres (their ideal-lap gap where they did no long run, marked “est.”) and their starting place, and predicts the finishing order, with teams and drivers ranked on race pace per lap like the Performance tab.

**ERS: where to boost (2.0).** In practice and the sprint (and, from 2.2, the race and qualifying) Pitwall follows your car alone (never the AI) in 20 m slices of the lap: throttle, brake, speed, the battery, the deploy mode, energy deployed and harvested, MGU-K power and where the car is. From your long runs (the laps the strategy uses, the sprint included) it measures what boost really drains against normal deployment, what you harvest a lap and how full the battery is. Only normal and boost count; laps in no deployment or hotlap are left out, and so are laps on intermediates or wets. The plan spends what you harvest a lap, less what normal deployment already uses, so the battery lasts the stint, and puts boost on the straights where it buys the most time per joule. Each zone is a stretch of a straight, usually from the corner exit, since the speed it gains carries all the way down the straight (so long straights come first); the battery has to keep enough charge to reach the end of every straight, and a boost that would leave it dry is cut short. Deployment is measured per 20 km/h speed band in each mode (shown in the panel), since the game deploys differently as speed builds (in 2026, normal deployment fades at high speed while boost holds on); the planner uses those curves, and counts extra power out of slow corners for less, where the tyres can’t put it all down. The time gained comes from a model (extra power accelerates the car, drag takes some back), scaled by your own laps where you drove the same straight with and without boost (leaving out straights within a second of the car ahead, where the slipstream flatters the speed, and before 2026 straights with DRS open; from 2026 the straight-mode wing is open on every straight for everyone, so it doesn't count). The Current Weekend tab draws your own track outline with the boost zones, braking and full throttle, or where you actually used boost (“Your laps”), plus the battery over a lap and the measured numbers. If the map comes out mirrored, **Flip map** fixes it for that track. The detailed profile is kept for the current weekend only; the track outline is kept for good.

**Positions, lap by lap.** Every race and sprint logged from F1 25 shows how all drivers moved through the order: a line per driver from the grid to the flag, in team colours (the second car of a team dashed), with retirements marked. The order on each lap comes from the lap times; the last lap is the official result, penalties included. Hover a line to pick out the driver.

**Forecasts on a sprint weekend.** The sprint race counts as long runs for the strategy and the race-pace forecast, and the sprint shootout’s laps count towards each driver’s ideal lap for the qualifying forecast.

**ERS in the race (2.2).** Pitwall now follows your car through the whole weekend, the race included. While you race, the ERS panel on the Current Weekend tab goes live: your battery, deploy mode and energy deployed update every second, and each new lap the plan is rebuilt. Your racing laps join the measurements (not the start, pit laps, or laps more than 3% off your typical pace, such as behind the safety car), and once there are a few, harvest comes from them. The plan also adapts to the battery: it takes the charge you crossed the line with, keeps 5% for the flag, and spreads the rest over the laps left on top of what you harvest. A full battery late on goes on boost instead of being wasted; a low one means boost only from what you harvest. A chart shows the battery at the line lap by lap against that path. The finished race is saved with its profile, so it counts too.

**Qualifying deployment (2.2).** A second panel plans the flying lap. Every lap in practice or qualifying that is mostly hotlap or boost on full throttle counts (qualifying’s parts add up), and out-laps and in-laps drop out on their own. Hotlap is the base and boost goes on top: the energy is what the battery starts the lap with plus what the lap harvests, up to the per-lap deploy limit. The plan may end the lap nearly empty, since the in-lap recharges it, but it never runs dry before the end of a straight. As in the race plan, deployment is measured per speed band, zones are stretches of a straight, and the time gained is checked against your own laps with and without boost.

**Wet tyres.** Long runs on intermediates or wets are ignored by the strategy, the race-pace forecast and the ERS profile: they depend too much on the conditions.

**Tyres nobody ran.** If only you or only the grid ran a compound, the other side takes its fall-off, wear and life, with the pace moved by the usual gap between you and the grid. If nobody ran it, it’s worked out from the other two: a missing hard is the medium plus the soft-to-medium step (slower, dropping off and wearing slower), a missing soft the medium minus the medium-to-hard step (quicker, dropping off and wearing faster), and a missing medium sits halfway between the soft and the hard. The tyre table says where each filled-in tyre came from. If only one compound has any data, nothing is filled in and no optimal strategy is made.

**Race strategy.** The Current Weekend tab works out the best plan for the next race from that weekend's practice: once from the whole grid's long runs, and once from yours. Each needs at least three consecutive clean laps on two dry compounds. Broken or short runs (a session you retired from) often measure no fall-off, so the two are made to agree: a compound showing +0.000 s a lap on one side takes the other side's figure, and where the grid's fall-off is more than 50% off yours, it's pulled to within a tenth of yours (yours 1 s a lap, the grid's 0.3 s: the grid's becomes 0.9 s). The tyre table notes every figure that was changed. It uses each compound's pace, how much time it loses per lap as it ages, and its wear rate (which sets how long it lasts), and times every one- and two-stop plan with about 22 s per stop. Plans are drawn as Pirelli-style bars with the pit window for each stop (every lap that keeps the plan within 2.5 s of its best), and races show each driver's strategy the same way.

`node scripts/fake-f1-session.js` sends a made-up race to a running Pitwall, to check the connection.

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

Go to **Media → New media session** (or the Media button on any weekend). Pick pre-season, post-qualifying, post-race, mid-season or end-of-season. Journalists go after the strongest stories of the moment: places made up or lost, finishing above or below what the car's pace says it should, incidents and who was to blame, penalties and strategy, a title rivalry starting or heating up, your archrival and any feud, and memory (last time out, your form over the last few races, this race a year ago, streaks and firsts), plus the teammate battle, goals and your weekend notes. In a team principal career you're interviewed as the principal: about the team and both drivers, never your own driving. Answer them, then publish to get a press article, paddock reactions and a change to your media reputation.

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

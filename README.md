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

**Debrief (3.1).** After a race (or sprint), the Live Race tab is a full debrief until the next session: the result and what it did to the championship; for each of your drivers the places made from the grid, how far off the best race on their own pace (or how far under it), race-pace rank, passes made and lost (and on lap 1), best lap and the lap their best sectors add up to, the gap to the teammate, the strategy against the quickest one in hindsight, and every stint’s pace, fall-off and wear; then the positions lap by lap with your cars highlighted, lap times against the winner and the cars either side of you, race pace by driver and by team, who stopped when around you, the fastest sectors of the race, and the whole field’s strategies and penalties. My Team careers get both drivers side by side.

**Sounds fixed (3.1).** The Live Race sounds now play: the app’s security settings blocked uploaded sounds. If a file still can’t play, a message says so.

**3.5: undercut and overcut.** Live Race now remembers who you were fighting: whenever you, or the car ahead or behind, goes into the pit lane, the running order from 10 seconds before counts (a car can be passed on the way in). Before anyone stops, the **Undercut** card (on the car ahead) and the **Overcut** card (the car behind’s undercut on you) predict where you’d come out if one of you stopped this lap and the other the next: the gap now, less what the new tyres buy over the old ones (each driver’s own race pace per tyre, fuel-corrected, the cold out-lap counted). Once one of you has stopped they go live: where you’d be if the other stopped right now. The graphic keeps the car at risk in the middle with the other car within a second either side (the real gap is always written underneath), the space between them green when the gap moves your way and red when it doesn’t, lap on lap. Every rival’s stops left are predicted from their own pace; a car that won’t stop again gets the battle forecast instead (behind: the car really behind you; ahead: the remembered car, until five laps running say you won’t catch it). After a stop the battle pace counts from the first normal lap (one lap, then two, then three). The live strategy also judges plans by where they’d finish, using every rival’s own plan and half a second for each car you’d have to pass, so a plan that finishes higher beats one that’s only quicker. **Installed fonts:** each font slot in Settings can also use a font installed on your PC.

**3.6: overtaking odds.** Every track has an **overtaking difficulty** (a slider beside the pit loss in the race strategy panel; Hungary starts at 90%, so a driver who catches the car ahead gets by one time in ten). Live Race runs the rest of the race 300 times with every car on its own plan: a car that pits is placed by its time, while one that catches the car ahead on track gets one go at passing (a failed pass leaves it stuck until one of them stops). Each plan gets its odds of every finishing position, and a plan replaces the quickest one only when it is likelier to finish ahead of it than behind; when the two are even, the one with the better best case wins. Where passing is hard, this favours track position and the undercut, and the Undercut card says so. **Rejoin fix:** lapped cars no longer count as ahead of you in the rejoin position. **Capitals:** drivers’ surnames, countries and race names show in capitals throughout.

**3.7: race replay and a steadier strategy.** **Race Replay** (its own page): every race you drive with telemetry on is recorded from the live feed, a sample a second, and kept gzipped in the data folder under replays (about half a megabyte a race, so a whole career fits). Pick a race to play it back at 1x to 20x, with a timeline to jump around: the field drawn by its gaps to the leader (cars slide as the gaps change, lapped and retired cars at the bottom), the Live Race dashboard as it was at that moment (strategy, undercut cards, rejoin; no sounds), and the position chart growing lap by lap. Only races logged in the career are listed; races from before 3.7, races without telemetry and historic seasons can't be replayed. **Strategy:** the odds are worked out again every five seconds, not once a lap, and the plan in hand is kept unless another is clearly better (10 points likelier to finish ahead than behind), so the call doesn't flip. A pass is likelier the more pace the car behind has (the track's chance is for half a second a lap), and a car that fails has another go three laps later. Each rival's next stop is varied by up to two laps either way. **Safety car:** stopping now is judged through the same odds: nobody passes behind the safety car, rivals due to stop soon take the cheap stop, and the field bunches up for the restart (within a second of each other nine times in ten), so a green-flag stop afterwards costs a lot of places. The Undercut card names every car further up that the stop would also clear. **Learned overtaking:** every fight in a live race (a car within a second of the one ahead) is counted, and once a track has enough of them the slider suggests a difficulty from your own races.

**3.9: under the hood, backups and replay links.** The app's code is split into one file per area under src/app (loaded in order; every page renders exactly as before), which makes changes quicker and safer. **Live Race** now updates only the cards that changed each second instead of redrawing the whole app: the menu, your scroll and open sections stay put, and the ERS plan is worked out once a lap. **Backups:** besides the daily one (kept 14 days), Pitwall backs up after every race logged from F1 25 and before an import, a new season or a restore (the last 20 of those); Settings lists them with Back up now, Open the folder and Restore (which backs up what you have first). **Replay housekeeping:** Race Replay can keep recordings for every season or only the last 1, 2, 3 or 5 (older ones are deleted), delete a whole season's recordings, and clear recordings that belong to no career. **Replay links:** race, sprint, contact, battle, penalty and Driver of the Day stories link to the recording; contact and battles start from the lap it happened.

**3.9.1: lap-by-lap replays of older races.** Races logged from F1 25 before recordings began (3.7) appear in Race Replay marked Lap by lap, rebuilt on the spot from every car's lap times, stints, wear and safety-car laps: the order and the gaps are exact each time the cars cross the line and smooth in between. They have no live dashboard, aren't stored anywhere, and their stories link to them too. Recorded races are unaffected and always take priority. Lapped cars are now told apart by how far round each car is, not only by the order of the gaps, so they show as laps down (in Live Race too).

**3.9.2:** Race Replay's field view no longer piles cars up at the bottom: the lead lap is scaled to leave room, lapped and retired cars get a row each under a Lapped / Out line, and the view grows taller when it needs to.

**3.9.3:** the Android app works again: its build now packs the app/ folder of the interface (it only took the top-level files, so the app had none of its code after the 3.9 split).

**3.9.4:** fonts reach the phone too. Uploaded fonts already travelled with your data; an installed font now carries a copy of its file (made when you pick it, or with Copy for your phone in Settings for one picked earlier), so a paired phone or tablet shows it even though it isn't installed there. The PC still uses the installed font.

**3.9.5:** a fuller dashboard. The tiles fill two rows: average finish and average qualifying (with your best of each), positions gained from the grid, DNFs and your form over the last five races join the rest, and Fastest laps takes the Predicted finish slot once there is no forecast to show. The banner drops the driver type and shows your team's car picture, if you have added one.

**3.4: fair pace.** Pitwall now logs every car’s fuel and ERS deployment each lap, and puts every lap used for pace on the same footing before the strategy and forecasts use it: as if the tank were empty (0.035 s a kg, from the fuel the game reports) and as if the driver had used no more energy than on their most frugal laps of the session (about 1.1 ms a kJ over that). Without this a car getting lighter hides its tyres’ fall-off, and a low-fuel run looks faster than it is. A run on a set that was already worn now counts as the new set it was: its wear says how many laps old it really was, so the pace and life it gives are a new set’s. In the race, the fall-off Live Race measures on your stint is fuel-corrected too. Sessions logged before 3.4 have no fuel data and are used as they are.

**3.3.** **Fonts:** upload your own in Settings (a display face, its bold, and a body face; TTF, OTF or WOFF), such as F1’s, which belong to Formula 1 and can’t come with the app. **Car pictures:** upload one per team on the team’s page; it shows in the team and driver banners (and will feed the undercut graphic). **ERS:** in qualifying a straight that crosses the start line is split there, since only this lap counts and nothing gained after the line helps it; in both plans each straight uses its own correction from your laps where you drove it with and without boost (the lap’s average elsewhere), so a straight where boost really pays gets more of it.

**3.2.** The career tile shows the number you race (the 1 when you run it). The dashboard shows where the title forecast has you finishing. Standings has a simple view (points only) next to the detailed one, and the Title Forecast is now a tab there. Tyre allocation keeps its session layout all weekend (practice is one column): on a normal weekend the practice and Q3 sets go back, on a sprint weekend everything but the race, Q1 and Q2 sets; the game’s tyre data now only supplies wear (its “available” flag means usable in the session running, not returned). Stories: a wheel-to-wheel rivalry takes three races running with a battle, rivalries born at one race share a story, the race report names only the most serious contact and ends with the top ten of both championships and their moves, and a contact story with several incidents is told once. Transfers shows this season’s moves, and the driver pool’s sections fold away. Career stats name drivers who are off the grid. Circuits show your own results only. The debrief charts the championship around you over the last three races. The battle forecast never blanks: green while the gap shrinks, yellow while it grows, NOW inside a second; it compares only laps both drivers have completed, without in- or out-laps.

**No more predicted transfers (3.1.1).** Past the real-history years, a new season starts with exactly what the Next Season tab shows: this season’s grid with only the transfers you confirmed, and the calendar you laid out there. The AI transfer market and the F2 rookies it brought in are gone; empty seats stay empty until you fill them. Seasons that follow real history still start on the real grid, with your moves on top, and the tab shows that grid too.

**Lapped cars (3.1).** A car a lap or more down is shown laps down again (+1 lap): the game’s gap to the leader for a lapped car isn’t a real gap. Races already logged are put right when the app opens.

**Next Season (3.0).** The Season page has a **Next season** tab: next year’s line-up as it stands (this grid with only the moves you’ve confirmed for next season; nothing is predicted), with transfers made from here taking effect next season only; and next year’s calendar, which you can reorder, cut, add to (any circuit F1 has raced, or that F1 25 has) and mark sprints on. That calendar is the one the season starts with. **Announce** puts it in the stories round by round, with each venue’s last winner and most wins in your career, and a breaking story for any venue new to the calendar (when F1 last raced there, or that it’s new). Each track has a contract (roughly the real ones to start with), shown as the seasons left after this one; change it and the press reports the new deal, the extension or the shorter one.

**Tyre allocation, reworked (3.0).** A weekend has a fixed number of dry sets for its format (8 soft, 3 medium, 2 hard on a normal weekend; 6, 4 and 2 on a sprint weekend; change them under Edit presets, for every preset of that format), and each preset decides which session every set goes to, laid out like the game’s Tyre Allocation screen. Set it once and every weekend with that preset follows it. The sets in practice go back at the end of the last practice session; tap any set to mark it returned, or to bring it back, when the game did something else.

**Story fixes (3.0).** One contact story a weekend: heavy contact first (a penalty, or a car out within a lap of it), then contact between title rivals, then any other; several heavy ones (or several between rivals) share the story, and from the rest one is picked. The defending champion line names the champion and only runs when they win. A wheel-to-wheel rivalry dies down quietly, with no story.

**Live Race (2.5).** Current Weekend has a second tab, **Live Race**: a race dashboard fed by F1 25 every second while you drive the race or the sprint. When a race starts it opens by itself (once), a red light shows on Current Weekend while it tracks, and Current Weekend opens straight on it. It shows your position, the gaps ahead and behind, your tyre (compound, age, wear) and: **a live strategy** that follows the plan you picked (or builds one from the tyre you start on), measures how the tyre is really going (fall-off from the stint’s laps, life from its wear), moves the stop to suit, switches plan when another is now 2 s or more quicker, and only uses the sets you have left; **PIT THIS LAP** when it’s time, flashing, with your own sounds (the pit sound, then the tyre’s), played once: again only if the tyre changes or the stop moves on by more than a lap; **PIT NOW** under a safety car or VSC when stopping at the cheaper loss is quicker, and, when that stop would be an extra one in your last stint, only if your pace on new tyres can win the places back (1 s a car plus 0.5 s an overtake, over the laps left); **tyre offset**: leading with time to spare, it extends the stint until the car behind is about a pit stop plus 1.6 s back; **where you’d rejoin** if you stopped now, and the gaps; **battle forecasts** (striking distance in so many laps, from the last three laps’ pace; grey within a second) or, while a stop is still to come, **the undercut** (the zone, the gap, the threat, from the last three sectors, in- and out-lap sectors left out); **the championship as it stands**, with the full tables a click away and, where the title can be decided, who would be champion if it finished like this; **the weather** now and in steps of minutes, animated; and **the ERS map**, learning from the race as it goes (the ERS panel on the Weekend tab stays on practice and the sprint). My Team careers follow your car, your teammate, or both side by side. Before the race, pick the strategy to follow on the Live Race tab; after it, the tab is a **debrief** (your strategy, the quickest one in hindsight from your race pace, how far off the best race you were, how much of your energy you deployed) until the next weekend’s first session, with a **celebration** when a title was decided (a big one if it’s yours). Sounds go in **Settings → Live Race sounds**.

**Strategy forecast (2.4).** The strategy now only learns from sessions that agree on tyre wear: if one of your compounds wore more than 1.5 points a lap differently in an earlier session (say FP1 ran on a different tyre-wear setting), that session and everything before it are left out, for you and the grid, and the panel says so. A harder tyre measured as dropping off or wearing faster than a softer one keeps its pace, but its fall-off or wear is rebuilt from the other two compounds (each changed figure says why). With two or more of your own compounds measured, a missing one is worked out from your own runs rather than the grid’s. Pit stops cost what they cost at that track, with figures for green flag, virtual safety car and safety car (typical values per track; set your own under the strategy). **Tyre allocation:** pick the preset you chose in F1 25 (Softer, Balanced, Harder) next to the race distance; like the distance, it carries over from the previous round. The Current Weekend tab shows the allocation laid out like the game’s screen: each session’s sets, the ones returned, and what’s left, with each set’s wear. Where a session sends F1 25’s own tyre-set data, that is used (every set’s wear, and whether it’s still yours); otherwise the preset stands in, each stint using a fresh set and the two most-used going back after each practice session. Your plans only use sets you still have, and a used set starts its stint already worn.

**Fixes (2.3).** Safety cars and virtual safety cars are counted as they come out (the game’s own count at the end could stay at zero), with the laps each one ran. Contact is linked to what it caused: damage registered within a second of the contact, and a retirement within a lap of a car’s last contact; a retirement no longer gets blamed on any contact earlier in the race, and the race report and incident stories say when a car was damaged or put out. A penalty the game reported but that didn’t stand (undone with a flashback, say) can be removed with the × next to it in the race’s Strategy & penalties table. A pass now counts once it has held for 2 seconds. Stories: title rivals who move together share one story (“a title battle seems to be developing between…”, “Norris and Leclerc slip back”), a chaser dropping back is said to fall beyond a race win (or two, or three) behind, and only one who is out of contention “can no longer catch” the leader; a change of leader no longer reads as the end of a fight. Battles and wheel-to-wheel rivalries are told without counting passes, except how many times the lead changed hands, and a fight for the lead that didn’t end in the win says it may have cost them. A transfer that contradicts a rumour marks it denied (one that fits confirms it; undo the transfer and it reopens), and a rumoured move before a contract ends says so. The dashboard shows only the wheel-to-wheel and bad-blood rivalries you (or your team) are part of.

**Race boost can run the battery out (2.2.2).** The race plan now uses the same lap-time search as qualifying: boost may empty the battery before the end of a straight where that is still the faster lap, such as when a big recharge zone follows and refills it for the next straight. Over a lap it still harvests what it spends, so the battery lasts the stint. Harvest is measured per unit of braking where the battery had room, since a full battery turns harvest away and practice laps run full would under-count it. The per-lap deploy limit never sits below what you actually deployed in a lap.

**Qualifying deployment (2.2).** A second panel plans the flying lap. Every lap in practice or qualifying that is mostly hotlap or boost on full throttle counts (qualifying’s parts add up), and out-laps and in-laps drop out on their own. Hotlap is the base and boost goes on top: the energy is what the battery starts the lap with plus what the lap harvests, up to the per-lap deploy limit. Charge left at the line is wasted (the in-lap recharges it), so the plan aims to cross the line empty (2.2.1): boost grows wherever it still gains time, until the battery, or the per-lap deploy limit, runs out. Running the battery dry before the end of a straight costs the deployment that can’t happen, carried down the rest of the straight, so the plan only lets it happen where that is still the faster lap, such as a straight followed by a big recharge zone; those zones are marked “runs out” (or “limit”, where the deploy limit ends it). Anything left at the line is explained: usually what the last corners harvest after the final straight, too late to use. As in the race plan, deployment is measured per speed band, zones are stretches of a straight, and the time gained is checked against your own laps with and without boost.

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
src/app/           The app, one file per area, loaded in name order (01-core … 26-boot)
replays.js         Race recordings for Race Replay
scripts/           Data builders and a test server (node scripts/serve.js)
android/           The Android companion app
```

You can also run `node scripts/serve.js` and open http://localhost:5173 to try it in a browser; data then stays in that browser and AI media is unavailable.

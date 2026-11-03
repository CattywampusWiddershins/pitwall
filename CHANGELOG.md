# Changelog

What changed in each version of Pitwall, newest first. Each version is tagged in git (`v3.13.2`) and, from 3.13.2, published as a release on [GitHub](https://github.com/CattywampusWiddershins/pitwall/releases).

## 3.25.1

- **Flashbacks rebuild the lap instead of losing it.** What you drove after the point you flashed back to is thrown away and replaced by what you drive next, in the fastest-lap traces and in your ERS profile, even when the flashback takes you back across the line into the lap before. A lap that went invalid before the flashback counts again if the game clears it (you flashed back to before the moment it was lost).
- **Flying-lap starts count**: a session started on a flying lap (no out-lap) gives a fastest lap from that first lap, and practice long runs include it instead of always skipping the first lap of a run as an out-lap. A real out-lap is still left out, because it's far off the run's pace.

## 3.25.0

- **Race Replay has two tabs: Race replays and Fastest laps.** Fastest laps lists every weekend Pitwall recorded laps from the game, kept for good: the track and circuit, how many drivers have a representative lap (recorded in full, line to line), and the quickest one. Open a weekend to compare any two drivers' quickest laps corner by corner, long after the weekend is over.

## 3.24.8

- **Fastest lap head to head**: a corner you brake for now has a band across the whole dip in speed, from where the braking starts to where the car is nearly back up to speed, instead of just the apex. Fast corners without a real dip keep a narrow band.

## 3.24.7

- **Fastest lap head to head, corners**: every apex counts, so a long sweep with two apexes is two corners and the little kink before the main straight is found too. The bands on the graphs are wider and touch where corners are close together, shaded in turn, and a run of corners at the same speed shares one label across them ("HIGH SPEED" over 11, 12, 13). Corner numbers shrink to fit narrow bands.
- **Laps are recorded twice as finely** (every 25 m instead of 50 m), so tight sequences like Baku's castle (10 and 11) come out as separate corners. Laps recorded before this still work, slightly less precisely, and give way to new ones.

## 3.24.6

- **Fastest lap head to head, corners**: corners now come from the line on the map, wherever the direction changes sharply, so fast sweeps count as well as the slow ones you brake for, and a chicane is two corners. How sharp a bend has to be is tuned to the circuit's official number of corners (Baku: 20), so the numbering follows the real one closely. Every corner is numbered on the map, outside its bend, and gets its own band on the graphs; corners that run into each other share one.

## 3.24.5

- **Fastest lap head to head**: the cars glide round the map instead of jumping from point to point, and keep their place when the page redraws. The speed and gap graphs are smooth curves, with every braking zone marked and numbered (corners straight after one another share a zone, as on TV) and labelled low, medium or high speed. The map's line is closed at the start/finish, with the timing line drawn across it.
- **Laps recorded properly**: each car's lap is now followed as it's driven and only kept if it ran from line to line on track. Before, two runs in a session could be mixed into one lap, which made cars jump and flicker. Laps saved that way are left out, and replaced by the next whole lap. A note under the graphs says only laps recorded in full are fair comparisons.
- **Flashbacks**: when you flash back, the contact, penalties, passes and damage after that moment are taken back, so a crash you undid no longer turns up in the stories. Race replays drop the part you flashed back over and play on smoothly, and recordings made before this (your Monza race) are cleaned the same way when they open. A lap with a flashback in it keeps only the part you finally drove.
- **Dashboard**: the Form chips wrap instead of clipping "DNF" in a narrow window.

## 3.24.4

- **Transfers, the grid cards**: a driver who has signed for another team next season shows "Joining Red Bull" (in that team's colour) instead of the contract with the team they are leaving; one released shows "Leaving for 2027". Drivers without a signed move keep "Final year" or "To 2028". The card's tooltip says the same ("Joins Red Bull Racing for 2027, until the end of 2028").

## 3.24.3

- **A season preview for round 1**: Formula 1 returns, how last year's title was won (a three-way fight at the death, a final-round showdown, or sealed with rounds to spare), the champion's defence (or a new champion to come, if they've gone), who came closest and the other champions on the grid. Its graphic leads with the defending champion, then home drivers and other champions.
- **Team standings graphic**: with eleven or more teams the rows get a little shorter, so the last one never runs into the "Points after the … GP" line.

## 3.24.2

- **Head to Head graphic**: the figures at each end stay inside the image.
- **Performance, teammate comparison**: each team in a block in the middle, a driver either side, and the bar between them split in two: qualifying on top, race pace below, each growing towards the quicker driver by how much quicker. The quali wins, gaps and how many sessions and races counted are all still there.
- **Race previews stay** in Stories for every round, each told as things stood going into that weekend, and their graphics keep the drivers picked from that weekend’s field.

## 3.24.1

- **Constructors’ standings, Simple**: the two drivers on each team card are larger, cropped at the waist, and stand apart: the lead driver in front, the teammate a step behind and to the right, both clear of the team’s name.

## 3.24.0

- **New story graphics**: pole (team colour, two white bars, "POLE" across the driver), race winner (two white lines at the top, the name spread over "WINNER", "FIRST WIN" for a first), race preview (home drivers, then title rivals, the champion and other champions, in front of the host's flag with the Grand Prix's name glowing in gold), the calendar (new venues outlined in yellow, the round-by-round text folded away), breaking news for signings, extensions, exits and retirements ("BREAKING · X to retire at the end of the 2026 season"), framed in the new team's colour (or the current one's) with diagonal texture and the team's logo in the triangle, records and milestones, and quotes: contact, battles and wheel-to-wheel rivals put both drivers' words on one graphic; your interview and the media pen show the headline quote.
- **Points graphs**, landscape and flat, names and points only: the title decider (everyone still in it), the season review (the top five, or everyone still in it three rounds from the end) and title-rivalry stories (the gap to the leader over the last five races).
- **Permutations**: the finishes that win it whatever happens fold into one row ("P3 or higher") with "NORRIS IS CHAMPION" across the rivals in the team's colour; "+FL" in fastest-lap seasons. A team's pair stands lead driver in front, teammate a step behind.
- **The story logo recolours itself**: red on most graphics, white on the winner graphic, one upload for all.
- The constructors' standings graphic shows every team.
- **Default drivers**: each team page takes a full-body "default driver" in its kit, and Settings → Story graphics a default driver for anyone else. A driver without a picture uses their team's, then the default. Full-body pictures also give drivers without a photo their headshot, so one upload covers both. The constructors' Simple standings cards stand both drivers in full body.
- **Live Race**: F1's lap counter with the safety car / VSC box under it; the championship as it stands in F1's style, always five rows with team logos, the points gained this race and the gap to the leader. On a title weekend it shows the top five with the driver who'd be champion and the verdict ("As it stands: X will be world champion" or "The fight goes on to …"), and scrolls down to your car for five seconds when it changes place. Rows slide past each other as places change. A gold champion card at the flag. Projected finish is its own block. Overtaking difficulty can adjust itself from the passes in your races at each track.
- **Fastest lap head to head** on Current Weekend: any two drivers' quickest laps of the weekend, the map coloured by who was quicker where, both cars starting together on it, the speed trace and the gap through the lap, and full throttle / braking / cornering shares. Pitwall now records every car's speed, throttle, brake and line through the lap while it's connected to the game.
- **Dashboard**: the standings in the Simple look (no cards), the constructors' standings, the teammate battle as Head to Head bars, and the last five graphics from Stories in place of "Latest from the paddock".
- **Season**: the next race across the top of the page. **Starting a new season** no longer asks where you drive when a move is already signed; it has tabs for the grid (make transfers for any driver, as on the Transfers page), the calendar and your goals. A calendar never announced, or changed since it was, is announced when the season starts.
- **Standings, Detailed**, and the **Forecast**, in the live championship's look, with all the same columns. Before a weekend that can decide the title, "On current form" says whether it predicts the title there or the fight going on.
- **Current Weekend and Performance** use the practice results' look: team-colour rows with logos and photos, the bars inside, each opening the driver or team. Race and qualifying pace by round stay as they were.
- **Stories**: a filter for each race weekend.
- **Transfers**: the grid and contracts as F1's team cards (yellow: final year; black: retiring).
- **Career stats**: the leaderboard in the Simple look with every stat in red and drivers off the grid in grey; export the top 10 as an image, by the column you sort on, with the stats you pick.
- **Head to Head** draws an F1-style graphic of the comparison above the numbers.
- Fixed: removing a trophy picture in Settings did nothing.

## 3.23.0

- **Phones**: the Media page no longer runs off the side of the screen (the reputation meter and the quick answers wrap), and names on the Simple standings cards shrink to fit, whatever font you've uploaded.
- **Title permutations, fastest-lap seasons** (2019–24): the point for fastest lap is now counted, so a finish can need the fastest lap ("P2 with the fastest lap") and a rival's condition can be "P4 or lower, or P3 without the fastest lap". Constructors' tables count it too.
- **Permutations in words** fold the finishes that win it outright into one line ("Verstappen finishes P3 or higher: Verstappen is champion") instead of listing every place. Two contenders who can both be champion "can both" leave as champion, not "can all".
- **Records set by two drivers at the same race**: matching a record someone set earlier that weekend now shares it ("Hamilton and Vettel share a new record") instead of a second story saying one equalled the other; going past it the same weekend takes the story over.
- **Media**: no question is asked twice in a season (the defending-champion question comes once). New questions when a driver closes in or moves past you in the championship, when you take or lose the lead, when the title is won, and when it can be won tomorrow. **Post-sprint** interviews are a new session type. An interview story no longer repeats its opening line.
- **Driver type and media personality** are gone from new careers and Settings: they did nothing.
- **New careers** start on this year by default.
- **Race reports**: a winner who leads the championship, or is a world champion, can get a line saying so ("This is why Verstappen is a four-time world champion"). A champion comes first for the opening four rounds, the leader from round five. The old "showing why the title is theirs" line is gone.
- **Rivalries** are told without the workings showing: archrivals "just cannot be separated this season" rather than "title rivals for 9 of 12 rounds", and wheel-to-wheel rivals "keep finding each other on track" rather than "a third race running".

## 3.22.3

- **Standings open in Simple** by default; Detailed is one click away.
- The standings cards (drivers and constructors) use the drivers' headshots; the full-body pictures are for the story graphics.

## 3.22.2

- **You're quoted in stories too**: until you do a media session for a weekend, stories give you a line like everyone else's. After a session, your own answers replace them (the race report uses one of your answers, as before).
- The top driver's white outline in Fan Voice and the ratings graphic is no longer hidden under their photo.

## 3.22.1

- **The trophy fills the empty side** of a title graphic: when the drivers stand to one side (two looking the same way, or both straight ahead, as with a constructors' pair), the trophy fills the other, half cut off by the edge. When they stand across the middle, it stays in the middle, in front or behind them.
- **Standings, Simple**: once a title is settled, the champion's points on their card turn gold, as in the graphics.
- Two drivers with one looking straight ahead: the other stands on the side they look to, the pair centred.

## 3.22.0

- **Drivers are never mirrored** in the graphics any more: the way each one faces in their picture decides where they stand instead.
  - One driver looking left stands on the right, with the trophy on the left.
  - Two looking apart stand back to back; two looking the same way (straight ahead counts) overlap, the leader in front and larger.
  - With three, the leader stands in front and the others take the side they look to; more stand in a row as before.
  - Ratings, permutations and the Driver of the Day and Season cards keep the driver on the left, as uploaded.

## 3.21.3

- **Constructors' standings, Simple**: the top three teams' cards show both their drivers (full-body pictures cropped to the upper body, else their photos), with the logo over them.

## 3.21.2

- The title wording only calls out age for the youngest first-time world champion (and the oldest champion); the youngest-to-win-their-nth wording is gone, so a driver's title count and streak lead again.

## 3.21.1

- **Age** in the title wording: the youngest world champion (*Youngest world champion*, *History at 20*, *The youngest ever?*), the youngest to win their second to seventh, and the oldest (*Oldest world champion*, *Age is just a number*), against the record book and the career's champions.
- **A long wait of their own**: a title five years or more after a driver's last (*First title since 2006*, *Twenty years on*). A nation's long wait no longer counts the driver's own titles.

## 3.21.0

**3.21.0: titles that know their history.**

- **Drivers' title graphics and stories** now lead with what makes a title remarkable, worked out from every champion since 1950 (the Hall of Fame) and your career's:
  - records broken (*First eight-time champion*, *A record six in a row*) and equalled (*Record-equalling seven-time champion*);
  - a nation's firsts (*First Monégasque world champion*, *Carrying Monégasque hopes*), its second champion (*Second South African world champion*: counted by people, so Max's titles still leave the Netherlands one) and long waits (*First Spanish champion since 2006*);
  - the most successful driver of a nation, and a team's first champion or first in a long time (*McLaren's first champion since 2008*);
  - titles in a row (*Back-to-back champion*, *Four in a row*).
- The most remarkable fact leads, the next sits underneath; a title with nothing remarkable keeps the plain words (*Five-time world champion*). The champion's and the contenders' stories say the same in a sentence.

## 3.20.3

- **Constructors' title graphics**: the team's logo, huge and faded, behind its two drivers; in a two-team decider each pair stands together, back to back with the other (no logos there, to keep it clean). They use the constructors' trophy with the same versions as the drivers' graphics.
- **Constructors' permutations** show the team's two drivers standing beside the table, when they have full-body pictures.
- **Your logo in the app**: the logo uploaded in Settings → Story graphics (F1's, say) takes the place of Pitwall's mark in the sidebar and top bar.

## 3.20.2

- **Single-driver title graphics** (title weekends, contenders and champions) have two trophy versions as well: filling the right side, or even larger with its right half cut off by the edge.

## 3.20.1

- **Title showdown graphics** have two trophy versions, picked per graphic for variety: huge and half in frame, rising out of the bottom in front of the drivers, or massive and towering behind them.

## 3.20.0

**3.20.0: title showdowns, full-body pictures and trophies.**

- **Full-body driver pictures** (Settings → Story graphics, or a driver's profile): a cut-out, head to toe, with the way the driver faces in it. The graphics mirror them to face where they need.
- **Trophies**: upload the drivers' and constructors' championship trophies in Settings → Story graphics.
- **Title showdown graphics**: the contenders under their teams' glow with the trophy in front. Two stand back to back; with three, the leader stands in front, a little larger; more go left to right in championship order. It sits at the top of the decider's story, in place of the points list, with the standings along the bottom. *Two drivers. One champion.*
- **The contenders**: each contender in a decider gets a story of their season so far (wins, poles, recent form, what they're chasing) with a graphic of their own: *A fifth title awaits*, *History awaits*, *An historic eighth awaits*.
- **Title weekend graphics**: when one driver or team can clinch, the same graphic with them alone and the trophy filling the right side.
- **Champion graphics** in gold: *Lando Norris, World Champion*, *Four-time world champion*, *First eight-time champion*; the constructors' version shows both drivers.
- **Ratings, permutations, Driver of the Day and Driver of the Season** show the driver standing beside the graphic when they have a full-body picture.
- **Standings, Simple** looks like the standings graphic: the top three as cards (points on red), then team-colour bars with red points and the places moved. **Detailed** is the full table again.
- **On phones**: long names no longer push the Dashboard standings' points off screen, the Recent results table fits, and the Stories filters wrap instead of running off the side.

## 3.19.1

- A perfect rating shows as **10**, not 10.0, in the graphics and on the Fan Voice page, so it fits its box.
- Half points (2021's Belgian Grand Prix) fit their boxes in the standings and results graphics.

## 3.19.0

**3.19.0: every session gets its story.**

- **Practice**: a story for each practice session (*Leclerc fastest in Practice 2*) with the classification as a graphic, like F1's: every driver, their team, the gap to the fastest and, when logged, laps run.
- **Sprint qualifying** gets a story and graphic in the qualifying format (*Norris takes sprint pole in the Netherlands*).
- On sprint weekends, qualifying's story now follows the sprint's, the order they run in.

## 3.18.3

- **Story graphics for the real seasons** (2016 to 2024) too: results, standings, ratings, permutations and the Driver of the Day cards, as in your own seasons.

## 3.18.2

**3.18.2: Driver of the Day, shown in the story.**

- The Driver of the Day and Driver of the Season cards appear under their stories, like the other graphics; click one to save it.
- Driver of the Day headlines say the driver was voted Driver of the Day (*Verstappen voted Driver of the Day*, *Fans vote Verstappen Driver of the Day*), and call it their drive of the season only when it beats every rating they've had that year.

## 3.18.1

**3.18.1: F1 Fan Voice gets its own tab.**

- **Performance → Fan Voice**, next to Teams and Drivers. Drivers now shows only pace measured from your times.
- Fan Voice is drawn like the story graphics (team-colour bars, logo, photo, name and a green score): every driver for the Grand Prix you pick, and the top ten over the last 5 races and the season, side by side. Each list saves as an image; the race's has every driver, so it runs taller than the usual 1080 × 1350.
- The logo uploaded in Settings → Story graphics stands in for the F1 in *F1 Fan Voice*; without one, it says F1.

## 3.18.0

**3.18.0: looks, and permutations for every title.**

- **Looks** (Settings → Look): **Classic** (Pitwall as it has always been), **Broadcast** (F1's TV graphics: near-black, red stripes, bold capitals, angled buttons, the banner as a team-colour slab), **Paddock** (light and editorial: white cards, black and red) and **Livery** (your team's colour is the whole look, with its livery stripes in the second colour). Each takes the team colours from the theme and uses your fonts. In the new looks the standings open with the top three as podium cards, as in the results graphics.
- **Constructors' permutations** get their graphic too: a table by the points both cars score (*If McLaren score 43 points (1-2)*) against the most each rival may score.
- **Sprint weekends**: a title that can be won in the sprint gets its own preview and graphic before the sprint (by sprint finish); after the sprint, the race's permutations come with the sprint's points in, and a title settled in the sprint is told as one ("sealed the title in the Qatar sprint, with the Grand Prix still to come"). They used to fall back to text, as the sprint and race together can only compare points totals.
- **Permutations leave out drivers who can't be champion**: a driver who could finish ahead but can't win the title no longer appears in a contender's table.
- **Season ratings**: the Fan Voice story has a second graphic, the season's average ratings so far. Stories show the old tables only where a graphic can't be made.
- The permutation, Driver of the Day and Driver of the Season cards no longer have the driver's photo faded behind (it can come back later).

## 3.17.1

**3.17.1:** the **Driver of the Day** and **Driver of the Season** cards are in the story-graphics style: portrait 1080 × 1350 with your logo, the driver faded in behind in their team's colour, their name, the rating in its green box (the number of awards in gold for the season), their figures (grid, finish, car pace and qualifying; or average rating, last five and races rated), why they won it, and the runners-up below.

## 3.17.0

**3.17.0: story graphics.** Stories now carry F1-style graphics, drawn as images you can save (click one, then **Save image**; 1080 × 1350, sized for social posts):

- **Driver and team standings** in the race report: the top ten in team colours with logos (and each driver's photo and their move since the last round), the points in red. Once a title is settled, the champion's points are gold from that round on; a title won at the final race is gold only in the final standings.
- **Results** for the race, the sprint and qualifying: the podium (or the front three) with photos, flags and points (lap times and gaps for qualifying), then fourth to tenth with team logos.
- **Driver ratings** in the Fan Voice story: the race's top ten with their ratings, ties marked.
- **Title permutations** in the title previews: one graphic for each driver who can be champion that weekend, with their picture faded behind and a table: *If VERSTAPPEN finishes* P1, P2… against where each rival must finish (*P3 or lower*, *out of the points*, or *anywhere*). At the final round every contender gets one; before that, only those who could clinch it there. A weekend with a sprint, or the constructors' title, can only compare points totals, so those keep the written version, which is also there under each graphic.

The logo slot at the top of each graphic takes an image you upload in **Settings → Story graphics** (F1's logo belongs to Formula 1, so it can't come with Pitwall); until then it shows Pitwall's name. The graphics use your display font.

## 3.16.0

**3.16.0: the strategy learns from your race (the Monza debrief).** At Monza a one-stop would have won and the strategy showed it, then on lap 18, while you led, it switched to two stops and you finished third, and after the first stop it wanted used hards over new mediums. The reasons, and what changed:

- **Each tyre's pace comes from your race laps.** The hard's practice pace came from three low-fuel laps and was 1.9 s a lap too slow; in the race your hards and mediums ran the same pace. Every compound you run in the race is now set by your laps on it, weighted by how many there are, and remembered after you change tyres.
- **Laps in a fight don't count as wear.** Laps 15 and 16, fighting for the lead, were a second slower and read as the hards falling off 0.27 s a lap. A lap spent within a second of the car ahead is now left out of the fall-off (yours and every rival's), and the fall-off is the typical lap-to-lap trend, not a line that a slow lap or two can tip. For pace, those laps are used only when there's nothing cleaner (a cautious figure).
- **No tyre is assumed never to slow down.** With no fall-off measured in practice, the hard had none at all, which is why 24 laps on a used hard looked as good as new mediums. It now takes the next compound's fall-off, scaled by how much slower it wears.
- **A short practice run is weighed against the grid's.** Your 5-lap medium run said 141 ms a lap of fall-off; it now counts with the grid's figure as five laps (about 100; your race mediums lost about 95).
- **Rivals stop as the AI does.** The odds had Verstappen stopping on lap 24 for softs to last 29 laps; he ran his hards to lap 31. Rivals now plan on the grid's tyres and, when they have to stop, go as long as their tyres allow (Leclerc's mediums to lap 22, Verstappen's hards to 31).
- **Passing costs time.** In the odds, a car that gets past now loses time doing it (half a second where passing is easy, a second where it's hard): the price of rejoining behind cars after a stop.

Replayed through Monza, the strategy holds the one-stop (pit on lap 31 for mediums, P1) from lap 12 until your stop, and after it plans the last stint on softs, not old hards. The Netherlands race still comes out as before (the safety-car call on lap 30, 15 changes of plan).

## 3.15.0

**3.15.0: the phone app updates itself.** When Pitwall on the computer has a newer version, the Android app downloads the matching app from it by itself (with progress), then one tap on **Install** puts it in. The first time, Android asks you to allow installs from Pitwall and to confirm; once Pitwall has installed itself, Android 12 and later let it update without asking. This needs the 3.15 app: getting there from an older one is the download link one last time. **Connection status:** the "offline" note on the phone shows for three seconds and then slides up out of the way, once each time the computer goes away (it kept coming back while the computer was off); a thin line along the top of the screen stays all the time, yellow while the computer is away and green when it's connected.

## 3.14.2

**3.14.2: fair pace, fixed.** At Monza the strategy had the hard at 1:24.1, two seconds slower than any lap driven on it. Two things were wrong. **Boost:** each lap is put on the same footing for the ERS energy it deployed, at 1.1 ms a kJ; measured on the 2026 season's practice laps it's 0.35 ms (your own laps; 0.07 across the grid), so a lap with a big deployment was made a second and a half slower than it was. It's 0.35 ms now, against your usual deployment over the whole weekend (each session used to have its own reference, and laps below it weren't corrected at all). **Runs that get quicker:** a run whose laps got faster had its pace taken from the line through them followed back to its first lap, which made it slower than any lap driven; it's the run's average now. Monza on a new set and an empty tank: soft 1:20.08, medium 1:20.51, hard 1:21.84 (it was 1:20.92, 1:20.86 and 1:24.10), and the plan is soft then hard.

**Race pace in Live Race.** The undercut, the overcut and the finishing odds now take every car as it's really lapping, not only as practice said. Each car runs on one model (your own practice for your car; the grid's for the rest, since one AI driver's practice is too noisy, with its figure for each tyre set by how the whole field is lapping on it), plus the car's own offset from its last three clean laps (at Zandvoort early on, everyone was 0.5 to 1.5 s a lap quicker than practice), which carries onto its next set. A rival's set falls off as its own laps show, a rival only stops again when it has to (its set won't reach the flag, or it still has a second compound to run: the AI doesn't stop just because new tyres would be quicker), and every car's own fuel is in its laps. On lap 3 of the Netherlands race the undercut on Verstappen now says you'd come out 0.85 s ahead (it said 0.21 s behind). **The prediction, checked:** replaying the Netherlands race and predicting the finishing order of the whole field at points through it, your predicted place is now right from lap 5 to lap 35 and P2–P3 from lap 45 to 60 (you won; it used to say P4–P9 for most of the race), and the strategy changes its call 16 times instead of 18.

## 3.14.1

**3.14.1: faster updates.** A version just published downloads slowly from GitHub until its servers have a copy (175 KB/s against 12 MB/s once they do), and the first person to update got the slow one. Pitwall now downloads an update in four pieces at once, so even then it's about four times quicker, and checks the whole file is the size GitHub lists before installing it. Publishing a release also fetches the installer once straight away, so GitHub's servers have it before anyone updates.

## 3.14.0

**3.14.0: fuel to carry.** Current Weekend, and Live Race before the start, show how much fuel to put in: your burn a lap from this weekend's practice (and the sprint) times the laps, plus half a lap to spare, for the race and for the sprint when it's still to come (My Team: each of your drivers). Only proper laps count, within 7% of your typical lap, so out-laps, in-laps and slow laps don't pull the average down; checked against your Hungary and Netherlands races, practice gave 1.039 and 0.990 kg a lap where the races burnt 1.036 and 0.986, and you'd have carried about 2 kg less in each. **Fuel at the flag:** during the race a Fuel card projects what will be left when the chequered flag falls (what's in the tank, less the burn times the laps to go), from this race's own burn after three laps and practice before that: a green box with the laps spare, or a flashing red one with how much a lap to save.

## 3.13.2

**3.13.2:** updates come from the Pitwall repository on GitHub ([CattywampusWiddershins/pitwall](https://github.com/CattywampusWiddershins/pitwall)): from this version on, Pitwall checks its releases when it starts.

## 3.13.1

**3.13.1:** Pitwall updates itself without being asked. A new version downloads in the background as soon as Pitwall sees it; then **Restart now** puts it in, or **Later** leaves it to install by itself when you close Pitwall. No installer to click through, and the download's progress is in **Settings → Updates**.

## 3.13.0

**3.13.0: an installer, and updates that install themselves.** Pitwall for Windows is now an installer (`Pitwall-Setup-<version>.exe`) instead of a portable .exe: it installs for your user with no administrator prompt, adds Start menu and desktop shortcuts, and uninstalls from Windows Settings. Your careers and settings were already in your user folder, so they carry straight over (install, then delete the old portable file). A new version on GitHub now shows **Update now**: Pitwall downloads the installer (with progress), closes, installs it quietly and opens again on the new version. Copies that weren't installed get a **Download** button instead.

## 3.12.0

**3.12.0: pictures included, and updates.** Pitwall now comes with photos for 36 real drivers, logos for 15 teams and pictures of 11 cars, so a new install has them from the start. Your own uploads take their place, and removing one that came with Pitwall keeps it removed (a **Default** button brings it back). Your own driver and My Team are still yours to add. **Updates:** Pitwall checks GitHub for a newer release a few seconds after it opens and shows it at the top of the page with the notes and a download; **Settings → Updates** shows your version and checks on demand. See *Publishing an update* above to set it up.

## 3.11.2

**3.11.2:** the green numbers beside drivers' and teams' totals (Drivers, Teams, their pages, Career Stats) can count what was **added in the career** or **added this season**: a toggle on each of those pages, kept as a setting. **Banners:** the car picture on the dashboard, driver and team banners is cropped to the car, so it shows bigger. **Dashboard:** the form results shrink to fit their tile, so nothing is cut off on a narrow window or a phone.

## 3.11.1

**3.11.1:** lapped cars are counted from the lap counts. Laps down came from how far round the lap each car was, measured against the furthest any car had got on the lap, which early in a lap is tiny: at the start half the field flickered in and out of "lapped", and when the gaps bunched behind a safety car cars were shown two laps down. This shows in Race Replay's field and in Live Race (rejoin, odds). **The field** has bigger names and cars (the car pictures cropped to the car), and every tyre is a round icon. **The track map's filter** lists the drivers in running order.

## 3.11.0

**3.11.0: strategy and undercut, checked against the 2026 Netherlands race.** Run through the race second by second, the old strategy changed its call 49 times; it now keeps one plan, moving only the lap of the stop. **Tyre wear limit 75%** (was 70%). **Tyre life** counts only the wear a set has put on in green-flag laps: a used set no longer looks worn out (its wear when fitted was counted as this stint's, so the used softs got 6–8 laps of life and lasted 16), and laps behind the safety car no longer make new tyres look good for 300 laps. The first laps on a set lean on the practice rate. **Fall-off** from the stint's laps leaves out laps behind a safety car or VSC (they made the hards look 5 s a lap slower every lap, so staying out looked hopeless) and waits for five clean laps. **Plans:** when nothing fits on one or two more stops, a third is tried, so stopping under a safety car is always on the table (on lap 30 it was ruled out by a lap, and the call didn't come); a plan in hand isn't dropped because the tyre life moved by a lap, and a new plan has to win at two odds updates running before it's shown, so one lucky run can't call you in. **Undercut:** the cards follow the order on track unless a stop has a car out of place (Hamilton takes over from Verstappen once he's passed him), you're no longer listed among the cars you'd clear, the safety car's cheaper stop is used, one car can't fill both cards, and the cards hold steady in the pit lane and the few seconds after it, until the game has a gap for you again. **Pit loss learned in the race:** every stop is measured (in-lap and out-lap against the car's laps before it) and the race's figure takes over from the first one; stops behind a safety car, and any more than 3 s over the track's figure (a new front wing, a penalty), are left out. When the race ends, its figure is saved for the track, so next season starts from it; you can still change it in the race strategy panel.

## 3.10.4

**3.10.4:** a race recorded while Pitwall was open shows as recorded straight away. The list of recordings was read once per run, so a race finished after Race Replay or a story link had been opened was listed as rebuilt lap by lap until Pitwall was restarted; it's now read again a few seconds after each race ends.

## 3.10.3

**3.10.3:** on the track map, cars in a race rebuilt lap by lap no longer jump back to the line a while after crossing it. Those races measure each lap as 5000 m, so on a track with your own (shorter) outline the cars ran on past the line and snapped back when the next lap began; the lap is now stretched to the outline.

## 3.10.2

**3.10.2:** smoother replays. The recording has a sample a second; the replay now draws every frame, sliding each car between the samples either side of the moment shown, on the gap view (the gaps count along too) and on the track map (over the line as well), at any speed. A window left in the background doesn't skip ahead when you come back.

## 3.10.1

**3.10.1:** a story about contact or a battle opens its replay with only those two drivers on the track map, from the lap it happened. Everyone (or a tap on any driver) brings the rest back.

## 3.10.0

**3.10.0:** a track map in Race Replay. Every car is drawn where it is round the lap, in its team colour, with your car outlined and on top. The outline is your own car's path from a weekend session at that track (kept from the first session logged there with telemetry, and replaced by later ones), so the cars sit exactly where they were; at a track you haven't driven yet it's the circuit drawing, with the cars placed by how far round the lap they are. Under the map you choose who's shown: everyone to start with, a tap on a driver hides them (greyed out) and another tap brings them back, and two presets, Top 10 and Around me (you and the two cars either side; the four behind when you lead, the four ahead when you're last), follow the order as it changes.

## 3.9.6

**3.9.6:** the live strategy stops flipping every lap when the tyres only just last. The wear rate was the wear over the tyre age, and the age only goes up at the line while the wear climbs all through the lap, so the tyres looked a little worse every second until the line: a no-stop plan that just fits was ruled out mid-lap (over the 70% limit) and came back at the line. The rate now counts the part of the lap driven, and a tyre age the game reports a moment late is put right when the car crosses the line. Checked against the 2026 Netherlands sprint recording: one call (no stop) for all 24 laps, where it used to change about 50 times.

## 3.9.5

**3.9.5:** a fuller dashboard. The tiles fill two rows: average finish and average qualifying (with your best of each), positions gained from the grid, DNFs and your form over the last five races join the rest, and Fastest laps takes the Predicted finish slot once there is no forecast to show. The banner drops the driver type and shows your team's car picture, if you have added one.

## 3.9.4

**3.9.4:** fonts reach the phone too. Uploaded fonts already travelled with your data; an installed font now carries a copy of its file (made when you pick it, or with Copy for your phone in Settings for one picked earlier), so a paired phone or tablet shows it even though it isn't installed there. The PC still uses the installed font.

## 3.9.3

**3.9.3:** the Android app works again: its build now packs the app/ folder of the interface (it only took the top-level files, so the app had none of its code after the 3.9 split).

## 3.9.2

**3.9.2:** Race Replay's field view no longer piles cars up at the bottom: the lead lap is scaled to leave room, lapped and retired cars get a row each under a Lapped / Out line, and the view grows taller when it needs to.

## 3.9.1

**3.9.1: lap-by-lap replays of older races.** Races logged from F1 25 before recordings began (3.7) appear in Race Replay marked Lap by lap, rebuilt on the spot from every car's lap times, stints, wear and safety-car laps: the order and the gaps are exact each time the cars cross the line and smooth in between. They have no live dashboard, aren't stored anywhere, and their stories link to them too. Recorded races are unaffected and always take priority. Lapped cars are now told apart by how far round each car is, not only by the order of the gaps, so they show as laps down (in Live Race too).

## 3.9

**3.9: under the hood, backups and replay links.** The app's code is split into one file per area under src/app (loaded in order; every page renders exactly as before), which makes changes quicker and safer. **Live Race** now updates only the cards that changed each second instead of redrawing the whole app: the menu, your scroll and open sections stay put, and the ERS plan is worked out once a lap. **Backups:** besides the daily one (kept 14 days), Pitwall backs up after every race logged from F1 25 and before an import, a new season or a restore (the last 20 of those); Settings lists them with Back up now, Open the folder and Restore (which backs up what you have first). **Replay housekeeping:** Race Replay can keep recordings for every season or only the last 1, 2, 3 or 5 (older ones are deleted), delete a whole season's recordings, and clear recordings that belong to no career. **Replay links:** race, sprint, contact, battle, penalty and Driver of the Day stories link to the recording; contact and battles start from the lap it happened.

## 3.7

**3.7: race replay and a steadier strategy.** **Race Replay** (its own page): every race you drive with telemetry on is recorded from the live feed, a sample a second, and kept gzipped in the data folder under replays (about half a megabyte a race, so a whole career fits). Pick a race to play it back at 1x to 20x, with a timeline to jump around: the field drawn by its gaps to the leader (cars slide as the gaps change, lapped and retired cars at the bottom), the Live Race dashboard as it was at that moment (strategy, undercut cards, rejoin; no sounds), and the position chart growing lap by lap. Only races logged in the career are listed; races from before 3.7, races without telemetry and historic seasons can't be replayed. **Strategy:** the odds are worked out again every five seconds, not once a lap, and the plan in hand is kept unless another is clearly better (10 points likelier to finish ahead than behind), so the call doesn't flip. A pass is likelier the more pace the car behind has (the track's chance is for half a second a lap), and a car that fails has another go three laps later. Each rival's next stop is varied by up to two laps either way. **Safety car:** stopping now is judged through the same odds: nobody passes behind the safety car, rivals due to stop soon take the cheap stop, and the field bunches up for the restart (within a second of each other nine times in ten), so a green-flag stop afterwards costs a lot of places. The Undercut card names every car further up that the stop would also clear. **Learned overtaking:** every fight in a live race (a car within a second of the one ahead) is counted, and once a track has enough of them the slider suggests a difficulty from your own races.

## 3.6

**3.6: overtaking odds.** Every track has an **overtaking difficulty** (a slider beside the pit loss in the race strategy panel; Hungary starts at 90%, so a driver who catches the car ahead gets by one time in ten). Live Race runs the rest of the race 300 times with every car on its own plan: a car that pits is placed by its time, while one that catches the car ahead on track gets one go at passing (a failed pass leaves it stuck until one of them stops). Each plan gets its odds of every finishing position, and a plan replaces the quickest one only when it is likelier to finish ahead of it than behind; when the two are even, the one with the better best case wins. Where passing is hard, this favours track position and the undercut, and the Undercut card says so. **Rejoin fix:** lapped cars no longer count as ahead of you in the rejoin position. **Capitals:** drivers’ surnames, countries and race names show in capitals throughout.

## 3.5

**3.5: undercut and overcut.** Live Race now remembers who you were fighting: whenever you, or the car ahead or behind, goes into the pit lane, the running order from 10 seconds before counts (a car can be passed on the way in). Before anyone stops, the **Undercut** card (on the car ahead) and the **Overcut** card (the car behind’s undercut on you) predict where you’d come out if one of you stopped this lap and the other the next: the gap now, less what the new tyres buy over the old ones (each driver’s own race pace per tyre, fuel-corrected, the cold out-lap counted). Once one of you has stopped they go live: where you’d be if the other stopped right now. The graphic keeps the car at risk in the middle with the other car within a second either side (the real gap is always written underneath), the space between them green when the gap moves your way and red when it doesn’t, lap on lap. Every rival’s stops left are predicted from their own pace; a car that won’t stop again gets the battle forecast instead (behind: the car really behind you; ahead: the remembered car, until five laps running say you won’t catch it). After a stop the battle pace counts from the first normal lap (one lap, then two, then three). The live strategy also judges plans by where they’d finish, using every rival’s own plan and half a second for each car you’d have to pass, so a plan that finishes higher beats one that’s only quicker. **Installed fonts:** each font slot in Settings can also use a font installed on your PC.

## 3.4

**3.4: fair pace.** Pitwall now logs every car’s fuel and ERS deployment each lap, and puts every lap used for pace on the same footing before the strategy and forecasts use it: as if the tank were empty (0.035 s a kg, from the fuel the game reports) and as if the driver had used no more energy than on their most frugal laps of the session (about 1.1 ms a kJ over that). Without this a car getting lighter hides its tyres’ fall-off, and a low-fuel run looks faster than it is. A run on a set that was already worn now counts as the new set it was: its wear says how many laps old it really was, so the pace and life it gives are a new set’s. In the race, the fall-off Live Race measures on your stint is fuel-corrected too. Sessions logged before 3.4 have no fuel data and are used as they are.

## 3.3

**3.3.** **Fonts:** upload your own in Settings (a display face, its bold, and a body face; TTF, OTF or WOFF), such as F1’s, which belong to Formula 1 and can’t come with the app. **Car pictures:** upload one per team on the team’s page; it shows in the team and driver banners (and will feed the undercut graphic). **ERS:** in qualifying a straight that crosses the start line is split there, since only this lap counts and nothing gained after the line helps it; in both plans each straight uses its own correction from your laps where you drove it with and without boost (the lap’s average elsewhere), so a straight where boost really pays gets more of it.

## 3.2

**3.2.** The career tile shows the number you race (the 1 when you run it). The dashboard shows where the title forecast has you finishing. Standings has a simple view (points only) next to the detailed one, and the Title Forecast is now a tab there. Tyre allocation keeps its session layout all weekend (practice is one column): on a normal weekend the practice and Q3 sets go back, on a sprint weekend everything but the race, Q1 and Q2 sets; the game’s tyre data now only supplies wear (its “available” flag means usable in the session running, not returned). Stories: a wheel-to-wheel rivalry takes three races running with a battle, rivalries born at one race share a story, the race report names only the most serious contact and ends with the top ten of both championships and their moves, and a contact story with several incidents is told once. Transfers shows this season’s moves, and the driver pool’s sections fold away. Career stats name drivers who are off the grid. Circuits show your own results only. The debrief charts the championship around you over the last three races. The battle forecast never blanks: green while the gap shrinks, yellow while it grows, NOW inside a second; it compares only laps both drivers have completed, without in- or out-laps.

## 3.1.1

**No more predicted transfers (3.1.1).** Past the real-history years, a new season starts with exactly what the Next Season tab shows: this season’s grid with only the transfers you confirmed, and the calendar you laid out there. The AI transfer market and the F2 rookies it brought in are gone; empty seats stay empty until you fill them. Seasons that follow real history still start on the real grid, with your moves on top, and the tab shows that grid too.

## 3.1

**Debrief (3.1).** After a race (or sprint), the Live Race tab is a full debrief until the next session: the result and what it did to the championship; for each of your drivers the places made from the grid, how far off the best race on their own pace (or how far under it), race-pace rank, passes made and lost (and on lap 1), best lap and the lap their best sectors add up to, the gap to the teammate, the strategy against the quickest one in hindsight, and every stint’s pace, fall-off and wear; then the positions lap by lap with your cars highlighted, lap times against the winner and the cars either side of you, race pace by driver and by team, who stopped when around you, the fastest sectors of the race, and the whole field’s strategies and penalties. My Team careers get both drivers side by side.

**Sounds fixed (3.1).** The Live Race sounds now play: the app’s security settings blocked uploaded sounds. If a file still can’t play, a message says so.

**Lapped cars (3.1).** A car a lap or more down is shown laps down again (+1 lap): the game’s gap to the leader for a lapped car isn’t a real gap. Races already logged are put right when the app opens.

## 3.0

**Next Season (3.0).** The Season page has a **Next season** tab: next year’s line-up as it stands (this grid with only the moves you’ve confirmed for next season; nothing is predicted), with transfers made from here taking effect next season only; and next year’s calendar, which you can reorder, cut, add to (any circuit F1 has raced, or that F1 25 has) and mark sprints on. That calendar is the one the season starts with. **Announce** puts it in the stories round by round, with each venue’s last winner and most wins in your career, and a breaking story for any venue new to the calendar (when F1 last raced there, or that it’s new). Each track has a contract (roughly the real ones to start with), shown as the seasons left after this one; change it and the press reports the new deal, the extension or the shorter one.

**Tyre allocation, reworked (3.0).** A weekend has a fixed number of dry sets for its format (8 soft, 3 medium, 2 hard on a normal weekend; 6, 4 and 2 on a sprint weekend; change them under Edit presets, for every preset of that format), and each preset decides which session every set goes to, laid out like the game’s Tyre Allocation screen. Set it once and every weekend with that preset follows it. The sets in practice go back at the end of the last practice session; tap any set to mark it returned, or to bring it back, when the game did something else.

**Story fixes (3.0).** One contact story a weekend: heavy contact first (a penalty, or a car out within a lap of it), then contact between title rivals, then any other; several heavy ones (or several between rivals) share the story, and from the rest one is picked. The defending champion line names the champion and only runs when they win. A wheel-to-wheel rivalry dies down quietly, with no story.

## 2.5

**Live Race (2.5).** Current Weekend has a second tab, **Live Race**: a race dashboard fed by F1 25 every second while you drive the race or the sprint. When a race starts it opens by itself (once), a red light shows on Current Weekend while it tracks, and Current Weekend opens straight on it. It shows your position, the gaps ahead and behind, your tyre (compound, age, wear) and: **a live strategy** that follows the plan you picked (or builds one from the tyre you start on), measures how the tyre is really going (fall-off from the stint’s laps, life from its wear), moves the stop to suit, switches plan when another is now 2 s or more quicker, and only uses the sets you have left; **PIT THIS LAP** when it’s time, flashing, with your own sounds (the pit sound, then the tyre’s), played once: again only if the tyre changes or the stop moves on by more than a lap; **PIT NOW** under a safety car or VSC when stopping at the cheaper loss is quicker, and, when that stop would be an extra one in your last stint, only if your pace on new tyres can win the places back (1 s a car plus 0.5 s an overtake, over the laps left); **tyre offset**: leading with time to spare, it extends the stint until the car behind is about a pit stop plus 1.6 s back; **where you’d rejoin** if you stopped now, and the gaps; **battle forecasts** (striking distance in so many laps, from the last three laps’ pace; grey within a second) or, while a stop is still to come, **the undercut** (the zone, the gap, the threat, from the last three sectors, in- and out-lap sectors left out); **the championship as it stands**, with the full tables a click away and, where the title can be decided, who would be champion if it finished like this; **the weather** now and in steps of minutes, animated; and **the ERS map**, learning from the race as it goes (the ERS panel on the Weekend tab stays on practice and the sprint). My Team careers follow your car, your teammate, or both side by side. Before the race, pick the strategy to follow on the Live Race tab; after it, the tab is a **debrief** (your strategy, the quickest one in hindsight from your race pace, how far off the best race you were, how much of your energy you deployed) until the next weekend’s first session, with a **celebration** when a title was decided (a big one if it’s yours). Sounds go in **Settings → Live Race sounds**.

## 2.4

**Strategy forecast (2.4).** The strategy now only learns from sessions that agree on tyre wear: if one of your compounds wore more than 1.5 points a lap differently in an earlier session (say FP1 ran on a different tyre-wear setting), that session and everything before it are left out, for you and the grid, and the panel says so. A harder tyre measured as dropping off or wearing faster than a softer one keeps its pace, but its fall-off or wear is rebuilt from the other two compounds (each changed figure says why). With two or more of your own compounds measured, a missing one is worked out from your own runs rather than the grid’s. Pit stops cost what they cost at that track, with figures for green flag, virtual safety car and safety car (typical values per track; set your own under the strategy). **Tyre allocation:** pick the preset you chose in F1 25 (Softer, Balanced, Harder) next to the race distance; like the distance, it carries over from the previous round. The Current Weekend tab shows the allocation laid out like the game’s screen: each session’s sets, the ones returned, and what’s left, with each set’s wear. Where a session sends F1 25’s own tyre-set data, that is used (every set’s wear, and whether it’s still yours); otherwise the preset stands in, each stint using a fresh set and the two most-used going back after each practice session. Your plans only use sets you still have, and a used set starts its stint already worn.

## 2.3

**Fixes (2.3).** Safety cars and virtual safety cars are counted as they come out (the game’s own count at the end could stay at zero), with the laps each one ran. Contact is linked to what it caused: damage registered within a second of the contact, and a retirement within a lap of a car’s last contact; a retirement no longer gets blamed on any contact earlier in the race, and the race report and incident stories say when a car was damaged or put out. A penalty the game reported but that didn’t stand (undone with a flashback, say) can be removed with the × next to it in the race’s Strategy & penalties table. A pass now counts once it has held for 2 seconds. Stories: title rivals who move together share one story (“a title battle seems to be developing between…”, “Norris and Leclerc slip back”), a chaser dropping back is said to fall beyond a race win (or two, or three) behind, and only one who is out of contention “can no longer catch” the leader; a change of leader no longer reads as the end of a fight. Battles and wheel-to-wheel rivalries are told without counting passes, except how many times the lead changed hands, and a fight for the lead that didn’t end in the win says it may have cost them. A transfer that contradicts a rumour marks it denied (one that fits confirms it; undo the transfer and it reopens), and a rumoured move before a contract ends says so. The dashboard shows only the wheel-to-wheel and bad-blood rivalries you (or your team) are part of.

## 2.2.2

**Race boost can run the battery out (2.2.2).** The race plan now uses the same lap-time search as qualifying: boost may empty the battery before the end of a straight where that is still the faster lap, such as when a big recharge zone follows and refills it for the next straight. Over a lap it still harvests what it spends, so the battery lasts the stint. Harvest is measured per unit of braking where the battery had room, since a full battery turns harvest away and practice laps run full would under-count it. The per-lap deploy limit never sits below what you actually deployed in a lap.

## 2.2

**ERS in the race (2.2).** Pitwall now follows your car through the whole weekend, the race included. While you race, the ERS panel on the Current Weekend tab goes live: your battery, deploy mode and energy deployed update every second, and each new lap the plan is rebuilt. Your racing laps join the measurements (not the start, pit laps, or laps more than 3% off your typical pace, such as behind the safety car), and once there are a few, harvest comes from them. The plan also adapts to the battery: it takes the charge you crossed the line with, keeps 5% for the flag, and spreads the rest over the laps left on top of what you harvest. A full battery late on goes on boost instead of being wasted; a low one means boost only from what you harvest. A chart shows the battery at the line lap by lap against that path. The finished race is saved with its profile, so it counts too.

**Qualifying deployment (2.2).** A second panel plans the flying lap. Every lap in practice or qualifying that is mostly hotlap or boost on full throttle counts (qualifying’s parts add up), and out-laps and in-laps drop out on their own. Hotlap is the base and boost goes on top: the energy is what the battery starts the lap with plus what the lap harvests, up to the per-lap deploy limit. Charge left at the line is wasted (the in-lap recharges it), so the plan aims to cross the line empty (2.2.1): boost grows wherever it still gains time, until the battery, or the per-lap deploy limit, runs out. Running the battery dry before the end of a straight costs the deployment that can’t happen, carried down the rest of the straight, so the plan only lets it happen where that is still the faster lap, such as a straight followed by a big recharge zone; those zones are marked “runs out” (or “limit”, where the deploy limit ends it). Anything left at the line is explained: usually what the last corners harvest after the final straight, too late to use. As in the race plan, deployment is measured per speed band, zones are stretches of a straight, and the time gained is checked against your own laps with and without boost.

## 2.0

**ERS: where to boost (2.0).** In practice and the sprint (and, from 2.2, the race and qualifying) Pitwall follows your car alone (never the AI) in 20 m slices of the lap: throttle, brake, speed, the battery, the deploy mode, energy deployed and harvested, MGU-K power and where the car is. From your long runs (the laps the strategy uses, the sprint included) it measures what boost really drains against normal deployment, what you harvest a lap and how full the battery is. Only normal and boost count; laps in no deployment or hotlap are left out, and so are laps on intermediates or wets. The plan spends what you harvest a lap, less what normal deployment already uses, so the battery lasts the stint, and puts boost on the straights where it buys the most time per joule. Each zone is a stretch of a straight, usually from the corner exit, since the speed it gains carries all the way down the straight (so long straights come first); the battery has to keep enough charge to reach the end of every straight, and a boost that would leave it dry is cut short. Deployment is measured per 20 km/h speed band in each mode (shown in the panel), since the game deploys differently as speed builds (in 2026, normal deployment fades at high speed while boost holds on); the planner uses those curves, and counts extra power out of slow corners for less, where the tyres can’t put it all down. The time gained comes from a model (extra power accelerates the car, drag takes some back), scaled by your own laps where you drove the same straight with and without boost (leaving out straights within a second of the car ahead, where the slipstream flatters the speed, and before 2026 straights with DRS open; from 2026 the straight-mode wing is open on every straight for everyone, so it doesn't count). The Current Weekend tab draws your own track outline with the boost zones, braking and full throttle, or where you actually used boost (“Your laps”), plus the battery over a lap and the measured numbers. If the map comes out mirrored, **Flip map** fixes it for that track. The detailed profile is kept for the current weekend only; the track outline is kept for good.

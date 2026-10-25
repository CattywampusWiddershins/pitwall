// Real-world reference data, frozen at the start of the 2025 season (end of 2024).
// Driver totals are Grand Prix figures: race wins/podiums/fastest laps only, points include sprints.
// Pole = the driver who started the race first (2021 sprint winners and grid-penalty inheritors count).
// Career results logged in Pitwall are added on top of these at runtime, nothing here is mutated.

const DRIVER_BIO = {
  VER: { nat: 'Dutch', born: '1997-09-30', debut: '2015 Australian GP', firstWin: '2016 Spanish GP', starts: 209, wins: 63, podiums: 112, poles: 40, fls: 32, pts: 3023.5, titles: [2021, 2022, 2023, 2024], bestChamp: 1, bestFinish: 1, teams: 'Toro Rosso (2015–16), Red Bull (2016–)' },
  HAM: { nat: 'British', born: '1985-01-07', debut: '2007 Australian GP', firstWin: '2007 Canadian GP', starts: 356, wins: 105, podiums: 202, poles: 104, fls: 67, pts: 4862.5, titles: [2008, 2014, 2015, 2017, 2018, 2019, 2020], bestChamp: 1, bestFinish: 1, teams: 'McLaren (2007–12), Mercedes (2013–24), Ferrari (2025–)', note: 'All-time record holder for wins, poles and podiums.' },
  ALO: { nat: 'Spanish', born: '1981-07-29', debut: '2001 Australian GP', firstWin: '2003 Hungarian GP', starts: 401, wins: 32, podiums: 106, poles: 22, fls: 26, pts: 2337, titles: [2005, 2006], bestChamp: 1, bestFinish: 1, teams: 'Minardi (2001), Renault (2003–06, 2008–09), McLaren (2007, 2015–18), Ferrari (2010–14), Alpine (2021–22), Aston Martin (2023–)', note: 'Most Grand Prix starts in F1 history.' },
  LEC: { nat: 'Monégasque', born: '1997-10-16', debut: '2018 Australian GP', firstWin: '2019 Belgian GP', starts: 148, wins: 8, podiums: 43, poles: 26, fls: 10, pts: 1430, titles: [], bestChamp: 2, bestFinish: 1, teams: 'Sauber (2018), Ferrari (2019–)', note: '2017 F2 champion, 2016 GP3 champion.' },
  NOR: { nat: 'British', born: '1999-11-13', debut: '2019 Australian GP', firstWin: '2024 Miami GP', starts: 128, wins: 4, podiums: 26, poles: 9, fls: 12, pts: 1007, titles: [], bestChamp: 2, bestFinish: 1, teams: 'McLaren (2019–)', note: '2024 championship runner-up.' },
  PIA: { nat: 'Australian', born: '2001-04-06', debut: '2023 Bahrain GP', firstWin: '2024 Hungarian GP', starts: 46, wins: 2, podiums: 9, poles: 0, fls: 2, pts: 389, titles: [], bestChamp: 4, bestFinish: 1, teams: 'McLaren (2023–)', note: 'Won F3 (2020) and F2 (2021) as a rookie in each.' },
  RUS: { nat: 'British', born: '1998-02-15', debut: '2019 Australian GP', firstWin: '2022 São Paulo GP', starts: 128, wins: 3, podiums: 15, poles: 5, fls: 7, pts: 714, titles: [], bestChamp: 4, bestFinish: 1, teams: 'Williams (2019–21), Mercedes (2020 Sakhir, 2022–)', note: '2018 F2 champion, 2017 GP3 champion.' },
  ANT: { nat: 'Italian', born: '2006-08-25', debut: '2025 Australian GP', starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], teams: 'Mercedes (2025–)', note: 'Rookie. 2024 F2: 6th with two wins, skipped F3 entirely.' },
  TSU: { nat: 'Japanese', born: '2000-05-11', debut: '2021 Bahrain GP', starts: 90, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 91, titles: [], bestChamp: 12, bestFinish: 4, teams: 'AlphaTauri / RB (2021–24)', note: 'Best result: 4th at Abu Dhabi 2021.' },
  STR: { nat: 'Canadian', born: '1998-10-29', debut: '2017 Australian GP', starts: 167, wins: 0, podiums: 3, poles: 1, fls: 0, pts: 292, titles: [], bestChamp: 10, bestFinish: 3, teams: 'Williams (2017–18), Racing Point / Aston Martin (2019–)', note: 'Pole at Turkey 2020 in the wet.' },
  GAS: { nat: 'French', born: '1996-02-07', debut: '2017 Malaysian GP', firstWin: '2020 Italian GP', starts: 154, wins: 1, podiums: 5, poles: 0, fls: 3, pts: 436, titles: [], bestChamp: 7, bestFinish: 1, teams: 'Toro Rosso / AlphaTauri (2017–19, 2019–22), Red Bull (2019), Alpine (2023–)', note: '2016 GP2 champion.' },
  COL: { nat: 'Argentine', born: '2003-05-27', debut: '2024 Italian GP', starts: 9, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 5, titles: [], bestChamp: 19, bestFinish: 8, teams: 'Williams (2024), Alpine (2025–)', note: 'First Argentine in F1 since 2001.' },
  DOO: { nat: 'Australian', born: '2003-01-20', debut: '2024 Abu Dhabi GP', starts: 1, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], bestFinish: 15, teams: 'Alpine (2024–)', note: 'Son of five-time 500cc motorcycle champion Mick Doohan.' },
  ALB: { nat: 'Thai', born: '1996-03-23', debut: '2019 Australian GP', starts: 104, wins: 0, podiums: 2, poles: 0, fls: 0, pts: 240, titles: [], bestChamp: 7, bestFinish: 3, teams: 'Toro Rosso (2019), Red Bull (2019–20), Williams (2022–)' },
  SAI: { nat: 'Spanish', born: '1994-09-01', debut: '2015 Australian GP', firstWin: '2022 British GP', starts: 206, wins: 4, podiums: 27, poles: 6, fls: 4, pts: 1272.5, titles: [], bestChamp: 5, bestFinish: 1, teams: 'Toro Rosso (2015–17), Renault (2017–18), McLaren (2019–20), Ferrari (2021–24), Williams (2025–)', note: 'Only non-Red Bull winner of 2023 (Singapore).' },
  HAD: { nat: 'French', born: '2004-09-28', debut: '2025 Australian GP', starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], teams: 'Racing Bulls (2025–)', note: 'Rookie. 2024 F2 runner-up.' },
  LAW: { nat: 'New Zealander', born: '2002-02-11', debut: '2023 Dutch GP', starts: 11, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 6, titles: [], bestFinish: 9, teams: 'AlphaTauri (2023), RB (2024–)', note: 'Five races as a stand-in in 2023, six more at the end of 2024.' },
  OCO: { nat: 'French', born: '1996-09-17', debut: '2016 Belgian GP', firstWin: '2021 Hungarian GP', starts: 156, wins: 1, podiums: 4, poles: 0, fls: 0, pts: 445, titles: [], bestChamp: 8, bestFinish: 1, teams: 'Manor (2016), Force India (2017–18), Renault / Alpine (2020–24), Haas (2025–)', note: '2015 GP3 champion, 2014 European F3 champion.' },
  BEA: { nat: 'British', born: '2005-05-08', debut: '2024 Saudi Arabian GP', starts: 3, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 7, titles: [], bestFinish: 7, teams: 'Ferrari (2024, stand-in), Haas (2024 stand-in, 2025–)', note: 'Scored points on debut for Ferrari in Jeddah aged 18.' },
  HUL: { nat: 'German', born: '1987-08-19', debut: '2010 Bahrain GP', starts: 227, wins: 0, podiums: 0, poles: 1, fls: 2, pts: 571, titles: [], bestChamp: 7, bestFinish: 4, teams: 'Williams (2010), Force India (2012, 2014–16), Sauber (2013, 2025–), Renault (2017–19), Racing Point / Aston Martin (2020, 2022 stand-in), Haas (2023–24)', note: 'Pole at Brazil 2010. Won Le Mans in 2015.' },
  BOR: { nat: 'Brazilian', born: '2004-10-14', debut: '2025 Australian GP', starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], teams: 'Kick Sauber (2025–)', note: 'Rookie. 2024 F2 champion and 2023 F3 champion.' },
  HAY: { nat: 'American', fictional: true, starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], teams: 'APXGP', note: 'Fictional driver from the F1 film: a 1990s prodigy returning to the grid decades later.' },
  PEA: { nat: 'British', fictional: true, starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], teams: 'APXGP', note: 'Fictional driver from the F1 film: APXGP’s hot-headed rookie.' },
  LIN: { nat: 'British', born: '2007-08-08', starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], teams: 'Racing Bulls (2026–)', note: 'Red Bull junior, racing in F2 during 2025.' },
  PER: { nat: 'Mexican', born: '1990-01-26', debut: '2011 Australian GP', firstWin: '2020 Sakhir GP', starts: 281, wins: 6, podiums: 39, poles: 3, fls: 11, pts: 1638, titles: [], bestChamp: 2, bestFinish: 1, teams: 'Sauber (2011–12), McLaren (2013), Force India / Racing Point (2014–20), Red Bull (2021–24)', note: '2023 championship runner-up.' },
  BOT: { nat: 'Finnish', born: '1989-08-28', debut: '2013 Australian GP', firstWin: '2017 Russian GP', starts: 246, wins: 10, podiums: 67, poles: 20, fls: 19, pts: 1797, titles: [], bestChamp: 2, bestFinish: 1, teams: 'Williams (2013–16), Mercedes (2017–21), Alfa Romeo / Sauber (2022–24)', note: 'Championship runner-up in 2019 and 2020.' },
};

// Drivers who only appear in circuit history
const HIST_DRIVERS = { VET: 'Sebastian Vettel', RAI: 'Kimi Räikkönen', RIC: 'Daniel Ricciardo', ROS: 'Nico Rosberg', KVY: 'Daniil Kvyat', MAG: 'Kevin Magnussen' };

const HIST_TEAM_COLORS = { 'Red Bull': '#3671C6', Mercedes: '#27F4D2', Ferrari: '#E8002D', McLaren: '#FF8000', Alpine: '#FF87BC', AlphaTauri: '#6692FF' };

// history rows, newest first: [year, pole, winner, 2nd, 3rd, winning team]
const TRACKS = {
  aus: { circuit: 'Albert Park Circuit', city: 'Melbourne', country: 'Australia', km: 5.278, laps: 58, corners: 14, firstGP: 1996, record: ['1:19.813', 'Charles Leclerc', 2024],
    about: 'Fast, flowing park-road circuit around a lake. Walls punish small mistakes and safety cars are common.',
    history: [[2024, 'VER', 'SAI', 'LEC', 'NOR', 'Ferrari'], [2023, 'VER', 'VER', 'HAM', 'ALO', 'Red Bull'], [2022, 'LEC', 'LEC', 'PER', 'RUS', 'Ferrari'], [2019, 'HAM', 'BOT', 'HAM', 'VER', 'Mercedes'], [2018, 'HAM', 'VET', 'HAM', 'RAI', 'Ferrari']] },
  chn: { circuit: 'Shanghai International Circuit', city: 'Shanghai', country: 'China', km: 5.451, laps: 56, corners: 16, firstGP: 2004, record: ['1:32.238', 'Michael Schumacher', 2004],
    about: 'Long, tightening snail-shell opening corners and one of the longest back straights on the calendar. Hard on the front-left.',
    history: [[2024, 'VER', 'VER', 'NOR', 'PER', 'Red Bull'], [2019, 'BOT', 'HAM', 'BOT', 'VET', 'Mercedes'], [2018, 'VET', 'RIC', 'BOT', 'RAI', 'Red Bull'], [2017, 'HAM', 'HAM', 'VET', 'VER', 'Mercedes'], [2016, 'ROS', 'ROS', 'VET', 'KVY', 'Mercedes']] },
  jpn: { circuit: 'Suzuka International Racing Course', city: 'Suzuka', country: 'Japan', km: 5.807, laps: 53, corners: 18, firstGP: 1987, record: ['1:30.983', 'Lewis Hamilton', 2019],
    about: 'Figure-of-eight driver’s favourite. The S-curves and 130R reward a stable, high-downforce car. Overtaking is tough.',
    history: [[2024, 'VER', 'VER', 'PER', 'SAI', 'Red Bull'], [2023, 'VER', 'VER', 'NOR', 'PIA', 'Red Bull'], [2022, 'VER', 'VER', 'PER', 'LEC', 'Red Bull'], [2019, 'VET', 'BOT', 'VET', 'HAM', 'Mercedes'], [2018, 'HAM', 'HAM', 'BOT', 'VER', 'Mercedes']] },
  bhr: { circuit: 'Bahrain International Circuit', city: 'Sakhir', country: 'Bahrain', km: 5.412, laps: 57, corners: 15, firstGP: 2004, record: ['1:31.447', 'Pedro de la Rosa', 2005],
    about: 'Stop-start desert layout under lights. Abrasive surface, high rear tyre wear and plenty of DRS overtaking.',
    history: [[2024, 'VER', 'VER', 'PER', 'SAI', 'Red Bull'], [2023, 'VER', 'VER', 'PER', 'ALO', 'Red Bull'], [2022, 'LEC', 'LEC', 'SAI', 'HAM', 'Ferrari'], [2021, 'VER', 'HAM', 'VER', 'BOT', 'Mercedes'], [2020, 'HAM', 'HAM', 'VER', 'ALB', 'Mercedes']] },
  sau: { circuit: 'Jeddah Corniche Circuit', city: 'Jeddah', country: 'Saudi Arabia', km: 6.174, laps: 50, corners: 27, firstGP: 2021, record: ['1:30.734', 'Lewis Hamilton', 2021],
    about: 'Fastest street circuit in F1. Blind, walled high-speed sweepers with very little room for error.',
    history: [[2024, 'VER', 'VER', 'PER', 'LEC', 'Red Bull'], [2023, 'PER', 'PER', 'VER', 'ALO', 'Red Bull'], [2022, 'PER', 'VER', 'LEC', 'SAI', 'Red Bull'], [2021, 'HAM', 'HAM', 'VER', 'BOT', 'Mercedes']] },
  mia: { circuit: 'Miami International Autodrome', city: 'Miami Gardens', country: 'United States', km: 5.412, laps: 57, corners: 19, firstGP: 2022, record: ['1:29.708', 'Max Verstappen', 2023],
    about: 'Temporary layout around the Hard Rock Stadium. Long straights, a tight chicane at turns 14–15 and a slippery surface off-line.',
    history: [[2024, 'VER', 'NOR', 'VER', 'LEC', 'McLaren'], [2023, 'PER', 'VER', 'PER', 'ALO', 'Red Bull'], [2022, 'LEC', 'VER', 'LEC', 'SAI', 'Red Bull']] },
  emi: { circuit: 'Autodromo Enzo e Dino Ferrari', city: 'Imola', country: 'Italy', km: 4.909, laps: 63, corners: 19, firstGP: 1980, record: ['1:15.484', 'Lewis Hamilton', 2020],
    about: 'Old-school, narrow and anti-clockwise with kerb-hopping chicanes. Track position is everything.',
    history: [[2024, 'VER', 'VER', 'NOR', 'LEC', 'Red Bull'], [2022, 'VER', 'VER', 'PER', 'NOR', 'Red Bull'], [2021, 'HAM', 'VER', 'HAM', 'NOR', 'Red Bull'], [2020, 'BOT', 'HAM', 'BOT', 'RIC', 'Mercedes']] },
  mon: { circuit: 'Circuit de Monaco', city: 'Monte Carlo', country: 'Monaco', km: 3.337, laps: 78, corners: 19, firstGP: 1950, record: ['1:12.909', 'Lewis Hamilton', 2021],
    about: 'Slowest, tightest track of the year. Qualifying decides the race almost every time.',
    history: [[2024, 'LEC', 'LEC', 'PIA', 'SAI', 'Ferrari'], [2023, 'VER', 'VER', 'ALO', 'OCO', 'Red Bull'], [2022, 'LEC', 'PER', 'SAI', 'VER', 'Red Bull'], [2021, 'LEC', 'VER', 'SAI', 'NOR', 'Red Bull'], [2019, 'HAM', 'HAM', 'VET', 'BOT', 'Mercedes']] },
  esp: { circuit: 'Circuit de Barcelona-Catalunya', city: 'Montmeló', country: 'Spain', km: 4.657, laps: 66, corners: 14, firstGP: 1991, record: ['1:16.330', 'Max Verstappen', 2023],
    about: 'The benchmark test track: a mix of every corner type. A good car here is a good car everywhere.',
    history: [[2024, 'NOR', 'VER', 'NOR', 'HAM', 'Red Bull'], [2023, 'VER', 'VER', 'HAM', 'RUS', 'Red Bull'], [2022, 'LEC', 'VER', 'PER', 'RUS', 'Red Bull'], [2021, 'HAM', 'HAM', 'VER', 'BOT', 'Mercedes'], [2020, 'HAM', 'HAM', 'VER', 'BOT', 'Mercedes']] },
  can: { circuit: 'Circuit Gilles Villeneuve', city: 'Montréal', country: 'Canada', km: 4.361, laps: 70, corners: 14, firstGP: 1978, record: ['1:13.078', 'Valtteri Bottas', 2019],
    about: 'Island circuit of straights and chicanes. Heavy braking, kerb riding and the famous Wall of Champions.',
    history: [[2024, 'RUS', 'VER', 'NOR', 'RUS', 'Red Bull'], [2023, 'VER', 'VER', 'ALO', 'HAM', 'Red Bull'], [2022, 'VER', 'VER', 'SAI', 'HAM', 'Red Bull'], [2019, 'VET', 'HAM', 'VET', 'LEC', 'Mercedes'], [2018, 'VET', 'VET', 'BOT', 'VER', 'Ferrari']] },
  aut: { circuit: 'Red Bull Ring', city: 'Spielberg', country: 'Austria', km: 4.318, laps: 71, corners: 10, firstGP: 1970, record: ['1:05.619', 'Carlos Sainz', 2020],
    about: 'Short, hilly lap with three big braking zones. Track limits at the final two corners decide many laps.',
    history: [[2024, 'VER', 'RUS', 'PIA', 'SAI', 'Mercedes'], [2023, 'VER', 'VER', 'LEC', 'PER', 'Red Bull'], [2022, 'VER', 'LEC', 'VER', 'HAM', 'Ferrari'], [2021, 'VER', 'VER', 'BOT', 'NOR', 'Red Bull'], [2020, 'BOT', 'BOT', 'LEC', 'NOR', 'Mercedes']] },
  gbr: { circuit: 'Silverstone Circuit', city: 'Silverstone', country: 'Great Britain', km: 5.891, laps: 52, corners: 18, firstGP: 1950, record: ['1:27.097', 'Max Verstappen', 2020],
    about: 'Home of the first ever world championship race. Maggotts–Becketts–Chapel is one of the great high-speed sequences.',
    history: [[2024, 'RUS', 'HAM', 'VER', 'NOR', 'Mercedes'], [2023, 'VER', 'VER', 'NOR', 'HAM', 'Red Bull'], [2022, 'SAI', 'SAI', 'PER', 'HAM', 'Ferrari'], [2021, 'VER', 'HAM', 'LEC', 'BOT', 'Mercedes'], [2020, 'HAM', 'HAM', 'VER', 'LEC', 'Mercedes']] },
  bel: { circuit: 'Circuit de Spa-Francorchamps', city: 'Stavelot', country: 'Belgium', km: 7.004, laps: 44, corners: 19, firstGP: 1950, record: ['1:44.701', 'Sergio Pérez', 2024],
    about: 'Longest lap on the calendar: Eau Rouge, Raidillon and Pouhon through the Ardennes forest. The weather can differ from one end to the other.',
    history: [[2024, 'LEC', 'HAM', 'PIA', 'LEC', 'Mercedes'], [2023, 'LEC', 'VER', 'PER', 'LEC', 'Red Bull'], [2022, 'SAI', 'VER', 'PER', 'SAI', 'Red Bull'], [2021, 'VER', 'VER', 'RUS', 'HAM', 'Red Bull'], [2020, 'HAM', 'HAM', 'BOT', 'VER', 'Mercedes']] },
  hun: { circuit: 'Hungaroring', city: 'Mogyoród', country: 'Hungary', km: 4.381, laps: 70, corners: 14, firstGP: 1986, record: ['1:16.627', 'Lewis Hamilton', 2020],
    about: 'Twisty, dusty and hot, often called Monaco without the walls. Strategy and undercuts decide position.',
    history: [[2024, 'NOR', 'PIA', 'NOR', 'HAM', 'McLaren'], [2023, 'HAM', 'VER', 'NOR', 'PER', 'Red Bull'], [2022, 'RUS', 'VER', 'HAM', 'RUS', 'Red Bull'], [2021, 'HAM', 'OCO', 'HAM', 'SAI', 'Alpine'], [2020, 'HAM', 'HAM', 'VER', 'BOT', 'Mercedes']] },
  ned: { circuit: 'Circuit Zandvoort', city: 'Zandvoort', country: 'Netherlands', km: 4.259, laps: 72, corners: 14, firstGP: 1952, record: ['1:11.097', 'Lewis Hamilton', 2021],
    about: 'Narrow dune circuit with steeply banked Hugenholtz and Arie Luyendyk corners. Sand blows onto the track.',
    history: [[2024, 'NOR', 'NOR', 'VER', 'LEC', 'McLaren'], [2023, 'VER', 'VER', 'ALO', 'GAS', 'Red Bull'], [2022, 'VER', 'VER', 'RUS', 'LEC', 'Red Bull'], [2021, 'VER', 'VER', 'HAM', 'BOT', 'Red Bull']] },
  ita: { circuit: 'Autodromo Nazionale Monza', city: 'Monza', country: 'Italy', km: 5.793, laps: 53, corners: 11, firstGP: 1950, record: ['1:21.046', 'Rubens Barrichello', 2004],
    about: 'The Temple of Speed. Lowest downforce of the season, slipstream battles and big stops into the chicanes.',
    history: [[2024, 'NOR', 'LEC', 'PIA', 'NOR', 'Ferrari'], [2023, 'SAI', 'VER', 'PER', 'SAI', 'Red Bull'], [2022, 'LEC', 'VER', 'LEC', 'RUS', 'Red Bull'], [2021, 'BOT', 'RIC', 'NOR', 'BOT', 'McLaren'], [2020, 'HAM', 'GAS', 'SAI', 'STR', 'AlphaTauri']] },
  aze: { circuit: 'Baku City Circuit', city: 'Baku', country: 'Azerbaijan', km: 6.003, laps: 51, corners: 20, firstGP: 2016, record: ['1:43.009', 'Charles Leclerc', 2019],
    about: 'Extremes in one lap: a 2 km flat-out run to turn one and a castle section barely wider than a car.',
    history: [[2024, 'LEC', 'PIA', 'LEC', 'RUS', 'McLaren'], [2023, 'LEC', 'PER', 'VER', 'LEC', 'Red Bull'], [2022, 'LEC', 'VER', 'PER', 'RUS', 'Red Bull'], [2021, 'LEC', 'PER', 'VET', 'GAS', 'Red Bull'], [2019, 'BOT', 'BOT', 'HAM', 'VET', 'Mercedes']] },
  sgp: { circuit: 'Marina Bay Street Circuit', city: 'Singapore', country: 'Singapore', km: 4.940, laps: 62, corners: 19, firstGP: 2008, record: ['1:34.486', 'Daniel Ricciardo', 2024],
    about: 'Hot, humid night race on bumpy streets. Physically the hardest race of the year, and a safety car is almost guaranteed.',
    history: [[2024, 'NOR', 'NOR', 'VER', 'PIA', 'McLaren'], [2023, 'SAI', 'SAI', 'NOR', 'HAM', 'Ferrari'], [2022, 'LEC', 'PER', 'LEC', 'SAI', 'Red Bull'], [2019, 'LEC', 'VET', 'LEC', 'VER', 'Ferrari'], [2018, 'HAM', 'HAM', 'VER', 'VET', 'Mercedes']] },
  usa: { circuit: 'Circuit of the Americas', city: 'Austin', country: 'United States', km: 5.513, laps: 56, corners: 20, firstGP: 2012, record: ['1:36.169', 'Charles Leclerc', 2019],
    about: 'Steep climb to turn one, a Becketts-style esses section and a bumpy surface. Lots of overtaking lines.',
    history: [[2024, 'NOR', 'LEC', 'SAI', 'VER', 'Ferrari'], [2023, 'LEC', 'VER', 'NOR', 'SAI', 'Red Bull'], [2022, 'SAI', 'VER', 'HAM', 'LEC', 'Red Bull'], [2021, 'VER', 'VER', 'HAM', 'PER', 'Red Bull'], [2019, 'BOT', 'BOT', 'HAM', 'VER', 'Mercedes']] },
  mex: { circuit: 'Autódromo Hermanos Rodríguez', city: 'Mexico City', country: 'Mexico', km: 4.304, laps: 71, corners: 17, firstGP: 1963, record: ['1:17.774', 'Valtteri Bottas', 2021],
    about: '2,200 m altitude means thin air: maximum wings, little downforce, hot brakes and engines. Ends through the stadium section.',
    history: [[2024, 'SAI', 'SAI', 'NOR', 'LEC', 'Ferrari'], [2023, 'LEC', 'VER', 'HAM', 'LEC', 'Red Bull'], [2022, 'VER', 'VER', 'HAM', 'PER', 'Red Bull'], [2021, 'BOT', 'VER', 'HAM', 'PER', 'Red Bull'], [2019, 'LEC', 'HAM', 'VET', 'BOT', 'Mercedes']] },
  bra: { circuit: 'Autódromo José Carlos Pace', city: 'São Paulo', country: 'Brazil', km: 4.309, laps: 71, corners: 15, firstGP: 1973, record: ['1:10.540', 'Valtteri Bottas', 2018],
    about: 'Short anti-clockwise lap at Interlagos with big elevation changes. Rain and chaos are part of the tradition.',
    history: [[2024, 'NOR', 'VER', 'OCO', 'GAS', 'Red Bull'], [2023, 'VER', 'VER', 'NOR', 'ALO', 'Red Bull'], [2022, 'MAG', 'RUS', 'HAM', 'SAI', 'Mercedes'], [2021, 'BOT', 'HAM', 'VER', 'BOT', 'Mercedes'], [2019, 'VER', 'VER', 'GAS', 'SAI', 'Red Bull']] },
  lvg: { circuit: 'Las Vegas Strip Circuit', city: 'Las Vegas', country: 'United States', km: 6.201, laps: 50, corners: 17, firstGP: 2023, record: ['1:34.876', 'Lando Norris', 2024],
    about: 'Late-night race down the Strip. Cold track, long straights and a struggle to get tyres up to temperature.',
    history: [[2024, 'RUS', 'RUS', 'HAM', 'SAI', 'Mercedes'], [2023, 'LEC', 'VER', 'LEC', 'PER', 'Red Bull']] },
  qat: { circuit: 'Lusail International Circuit', city: 'Lusail', country: 'Qatar', km: 5.419, laps: 57, corners: 16, firstGP: 2021, record: ['1:22.384', 'Lando Norris', 2024],
    about: 'MotoGP-style layout of long medium and high-speed corners. Brutal on tyres and on the drivers’ necks.',
    history: [[2024, 'RUS', 'VER', 'LEC', 'PIA', 'Red Bull'], [2023, 'VER', 'VER', 'PIA', 'NOR', 'Red Bull'], [2021, 'HAM', 'HAM', 'VER', 'ALO', 'Mercedes']] },
  abu: { circuit: 'Yas Marina Circuit', city: 'Abu Dhabi', country: 'United Arab Emirates', km: 5.281, laps: 58, corners: 16, firstGP: 2009, record: ['1:25.637', 'Kevin Magnussen', 2024],
    about: 'Twilight season finale. Two long straights then a slow, technical final sector around the hotel.',
    history: [[2024, 'NOR', 'NOR', 'SAI', 'LEC', 'McLaren'], [2023, 'VER', 'VER', 'LEC', 'RUS', 'Red Bull'], [2022, 'VER', 'VER', 'LEC', 'PER', 'Red Bull'], [2021, 'VER', 'VER', 'HAM', 'SAI', 'Red Bull'], [2020, 'VER', 'VER', 'BOT', 'HAM', 'Red Bull']] },
  mad: { circuit: 'Madring', city: 'Madrid', country: 'Spain', km: 5.474, laps: 57, corners: 22, firstGP: 2026, record: null, provisional: true,
    about: 'New for 2026: a hybrid street and purpose-built layout around the IFEMA exhibition centre, with the steeply banked La Monumental corner.',
    history: [] },
};

// World Drivers' Champions, 1950–2024: [year, driver key, team]
const CHAMPIONS = [
  [1950, 'FAR', 'Alfa Romeo'], [1951, 'FAN', 'Alfa Romeo'], [1952, 'ASC', 'Ferrari'], [1953, 'ASC', 'Ferrari'], [1954, 'FAN', 'Maserati / Mercedes'],
  [1955, 'FAN', 'Mercedes'], [1956, 'FAN', 'Ferrari'], [1957, 'FAN', 'Maserati'], [1958, 'HAW', 'Ferrari'], [1959, 'BRA', 'Cooper'],
  [1960, 'BRA', 'Cooper'], [1961, 'PHI', 'Ferrari'], [1962, 'HIL', 'BRM'], [1963, 'CLA', 'Lotus'], [1964, 'SUR', 'Ferrari'],
  [1965, 'CLA', 'Lotus'], [1966, 'BRA', 'Brabham'], [1967, 'HME', 'Brabham'], [1968, 'HIL', 'Lotus'], [1969, 'STE', 'Matra'],
  [1970, 'RIN', 'Lotus'], [1971, 'STE', 'Tyrrell'], [1972, 'FIT', 'Lotus'], [1973, 'STE', 'Tyrrell'], [1974, 'FIT', 'McLaren'],
  [1975, 'LAU', 'Ferrari'], [1976, 'HUN', 'McLaren'], [1977, 'LAU', 'Ferrari'], [1978, 'AND', 'Lotus'], [1979, 'SCH', 'Ferrari'],
  [1980, 'JON', 'Williams'], [1981, 'PIQ', 'Brabham'], [1982, 'KRO', 'Williams'], [1983, 'PIQ', 'Brabham'], [1984, 'LAU', 'McLaren'],
  [1985, 'PRO', 'McLaren'], [1986, 'PRO', 'McLaren'], [1987, 'PIQ', 'Williams'], [1988, 'SEN', 'McLaren'], [1989, 'PRO', 'McLaren'],
  [1990, 'SEN', 'McLaren'], [1991, 'SEN', 'McLaren'], [1992, 'MAN', 'Williams'], [1993, 'PRO', 'Williams'], [1994, 'MSC', 'Benetton'],
  [1995, 'MSC', 'Benetton'], [1996, 'DHI', 'Williams'], [1997, 'VIL', 'Williams'], [1998, 'HAK', 'McLaren'], [1999, 'HAK', 'McLaren'],
  [2000, 'MSC', 'Ferrari'], [2001, 'MSC', 'Ferrari'], [2002, 'MSC', 'Ferrari'], [2003, 'MSC', 'Ferrari'], [2004, 'MSC', 'Ferrari'],
  [2005, 'ALO', 'Renault'], [2006, 'ALO', 'Renault'], [2007, 'RAI', 'Ferrari'], [2008, 'HAM', 'McLaren'], [2009, 'BUT', 'Brawn'],
  [2010, 'VET', 'Red Bull'], [2011, 'VET', 'Red Bull'], [2012, 'VET', 'Red Bull'], [2013, 'VET', 'Red Bull'], [2014, 'HAM', 'Mercedes'],
  [2015, 'HAM', 'Mercedes'], [2016, 'ROS', 'Mercedes'], [2017, 'HAM', 'Mercedes'], [2018, 'HAM', 'Mercedes'], [2019, 'HAM', 'Mercedes'],
  [2020, 'HAM', 'Mercedes'], [2021, 'VER', 'Red Bull'], [2022, 'VER', 'Red Bull'], [2023, 'VER', 'Red Bull'], [2024, 'VER', 'Red Bull'],
];

// Final career totals for retired champions. Active champions (ALO, HAM, VER) take live figures from DRIVER_BIO + your career.
const CHAMP_BIO = {
  FAR: { name: 'Giuseppe Farina', nat: 'Italian', life: '1906–1966', starts: 33, wins: 5, poles: 5, podiums: 20, fls: 5, about: 'Won the first ever World Championship race at Silverstone in 1950 and the first title, for Alfa Romeo. Pioneered the straight-arm driving style.' },
  FAN: { name: 'Juan Manuel Fangio', nat: 'Argentine', life: '1911–1995', starts: 51, wins: 24, poles: 29, podiums: 35, fls: 23, about: 'Five titles with four different manufacturers in the 1950s. His win rate of almost one in two is still the best of any champion.' },
  ASC: { name: 'Alberto Ascari', nat: 'Italian', life: '1918–1955', starts: 32, wins: 13, poles: 14, podiums: 17, fls: 12, about: 'Ferrari’s first champion, winning nine championship races in a row across 1952 and 1953. Killed testing a sports car at Monza in 1955.' },
  HAW: { name: 'Mike Hawthorn', nat: 'British', life: '1929–1959', starts: 45, wins: 3, poles: 4, podiums: 18, fls: 6, about: 'Britain’s first world champion, beating Stirling Moss by a single point in 1958. Retired immediately and died in a road accident months later.' },
  BRA: { name: 'Jack Brabham', nat: 'Australian', life: '1926–2014', starts: 126, wins: 14, poles: 13, podiums: 31, fls: 12, about: 'Three titles, the last in 1966 in a car carrying his own name. Still the only driver to win the championship with a team he founded.' },
  PHI: { name: 'Phil Hill', nat: 'American', life: '1927–2008', starts: 48, wins: 3, poles: 6, podiums: 16, fls: 6, about: 'America’s first world champion, crowned in the "sharknose" Ferrari in 1961 after the death of teammate Wolfgang von Trips at Monza.' },
  HIL: { name: 'Graham Hill', nat: 'British', life: '1929–1975', starts: 176, wins: 14, poles: 13, podiums: 36, fls: 10, about: 'Two-time champion, five-time Monaco winner and the only driver to win the Triple Crown of Monaco, the Indy 500 and Le Mans.' },
  CLA: { name: 'Jim Clark', nat: 'British', life: '1936–1968', starts: 72, wins: 25, poles: 33, podiums: 32, fls: 28, about: 'A natural who took two titles with Lotus and dominated races like nobody of his era. Killed in a Formula 2 race at Hockenheim in 1968.' },
  SUR: { name: 'John Surtees', nat: 'British', life: '1934–2017', starts: 111, wins: 6, poles: 8, podiums: 24, fls: 11, about: 'The only world champion on two wheels and four: seven motorcycle titles, then the 1964 F1 crown with Ferrari.' },
  HME: { name: 'Denny Hulme', nat: 'New Zealander', life: '1936–1992', starts: 112, wins: 8, poles: 1, podiums: 33, fls: 9, about: '"The Bear" beat his own team boss Jack Brabham to the 1967 title through relentless consistency, then won races for McLaren.' },
  STE: { name: 'Jackie Stewart', nat: 'British', life: 'b. 1939', starts: 99, wins: 27, poles: 17, podiums: 43, fls: 15, about: 'Three titles and a then-record 27 wins. His campaign for safer circuits and proper medical care changed the sport for good.' },
  RIN: { name: 'Jochen Rindt', nat: 'Austrian', life: '1942–1970', starts: 60, wins: 6, poles: 10, podiums: 13, fls: 3, about: 'The only posthumous champion: killed in practice at Monza in 1970, his points lead was never overtaken.' },
  FIT: { name: 'Emerson Fittipaldi', nat: 'Brazilian', life: 'b. 1946', starts: 144, wins: 14, poles: 6, podiums: 35, fls: 6, about: 'Youngest champion of his time at 25 with Lotus in 1972, then champion again with McLaren in 1974. Later won the Indy 500 twice.' },
  LAU: { name: 'Niki Lauda', nat: 'Austrian', life: '1949–2019', starts: 171, wins: 25, poles: 24, podiums: 54, fls: 24, about: 'Survived a fiery crash at the Nürburgring in 1976 and raced again six weeks later. Three titles across Ferrari and McLaren.' },
  HUN: { name: 'James Hunt', nat: 'British', life: '1947–1993', starts: 92, wins: 10, poles: 14, podiums: 23, fls: 8, about: 'Charismatic McLaren driver who won the 1976 title by one point over Lauda after a rain-soaked finale at Fuji.' },
  AND: { name: 'Mario Andretti', nat: 'American', life: 'b. 1940', starts: 128, wins: 12, poles: 18, podiums: 19, fls: 10, about: 'Took the 1978 title in the ground-effect Lotus 79. One of the few to win in F1, IndyCar, NASCAR and sports cars.' },
  SCH: { name: 'Jody Scheckter', nat: 'South African', life: 'b. 1950', starts: 112, wins: 10, poles: 3, podiums: 33, fls: 5, about: 'South Africa’s only world champion, winning the 1979 title for Ferrari. Ferrari did not win another drivers’ title until 2000.' },
  JON: { name: 'Alan Jones', nat: 'Australian', life: 'b. 1946', starts: 116, wins: 12, poles: 6, podiums: 24, fls: 13, about: 'Gave Williams its first drivers’ title in 1980. A tough, no-nonsense racer.' },
  PIQ: { name: 'Nelson Piquet', nat: 'Brazilian', life: 'b. 1952', starts: 204, wins: 23, poles: 24, podiums: 60, fls: 23, about: 'Three-time champion with Brabham and Williams, famous for his technical feel and mind games with rivals.' },
  KRO: { name: 'Keke Rosberg', nat: 'Finnish', life: 'b. 1948', starts: 114, wins: 5, poles: 5, podiums: 17, fls: 3, about: 'Won the chaotic 1982 title with just one victory. Known for spectacular car control and on-the-edge qualifying laps.' },
  PRO: { name: 'Alain Prost', nat: 'French', life: 'b. 1955', starts: 199, wins: 51, poles: 33, podiums: 106, fls: 41, about: '"The Professor": four titles and 51 wins built on precision and racecraft. His rivalry with Senna defined an era.' },
  SEN: { name: 'Ayrton Senna', nat: 'Brazilian', life: '1960–1994', starts: 161, wins: 41, poles: 65, podiums: 80, fls: 19, about: 'Three titles and 65 poles, a qualifying record that stood for years. Revered for his speed in the wet. Killed at Imola in 1994.' },
  MAN: { name: 'Nigel Mansell', nat: 'British', life: 'b. 1953', starts: 187, wins: 31, poles: 32, podiums: 59, fls: 30, about: 'Fearless and hugely popular, he finally won the 1992 title in the dominant Williams FW14B after years of near misses.' },
  MSC: { name: 'Michael Schumacher', nat: 'German', life: 'b. 1969', starts: 306, wins: 91, poles: 68, podiums: 155, fls: 77, about: 'Seven titles including five in a row with Ferrari, whom he rebuilt into a winning machine. Set the benchmark for fitness and work ethic.' },
  DHI: { name: 'Damon Hill', nat: 'British', life: 'b. 1960', starts: 115, wins: 22, poles: 20, podiums: 42, fls: 19, about: 'Won the 1996 title with Williams. With father Graham, the first father and son both to be world champion.' },
  VIL: { name: 'Jacques Villeneuve', nat: 'Canadian', life: 'b. 1971', starts: 163, wins: 11, poles: 13, podiums: 23, fls: 9, about: 'Champion in only his second season after a tense 1997 decider against Schumacher at Jerez. Also an Indy 500 winner.' },
  HAK: { name: 'Mika Häkkinen', nat: 'Finnish', life: 'b. 1968', starts: 161, wins: 20, poles: 26, podiums: 51, fls: 25, about: '"The Flying Finn" won back-to-back titles with McLaren in 1998 and 1999 and was Schumacher’s most respected rival.' },
  ALO: { name: 'Fernando Alonso', about: 'Ended Schumacher’s reign with back-to-back titles for Renault in 2005 and 2006. Still on the grid more than two decades after his debut.' },
  RAI: { name: 'Kimi Räikkönen', nat: 'Finnish', life: 'b. 1979', starts: 349, wins: 21, poles: 18, podiums: 103, fls: 46, about: '"The Iceman" snatched the 2007 title by one point at the final race. Ferrari’s most recent drivers’ champion as of 2024.' },
  HAM: { name: 'Lewis Hamilton', about: 'Seven titles, level with Schumacher, and the record holder for wins, poles and podiums. Moved from Mercedes to Ferrari for 2025.' },
  BUT: { name: 'Jenson Button', nat: 'British', life: 'b. 1980', starts: 306, wins: 15, poles: 8, podiums: 50, fls: 8, about: 'Won the 2009 title with Brawn GP, the team rescued from Honda’s exit. A smooth driver at his best in changing conditions.' },
  VET: { name: 'Sebastian Vettel', nat: 'German', life: 'b. 1987', starts: 299, wins: 53, poles: 57, podiums: 122, fls: 38, about: 'Four straight titles with Red Bull from 2010, the youngest champion at 23. Later raced for Ferrari and Aston Martin.' },
  ROS: { name: 'Nico Rosberg', nat: 'German', life: 'b. 1985', starts: 206, wins: 23, poles: 30, podiums: 57, fls: 20, about: 'Beat teammate Hamilton to the 2016 title and retired five days later. Son of 1982 champion Keke Rosberg.' },
  VER: { name: 'Max Verstappen', about: 'Four straight titles from 2021, including a record 19 wins in 2023. Became the youngest F1 starter at 17.' },
};

const TITLE_TEAM_COLORS = { ...HIST_TEAM_COLORS, 'Alfa Romeo': '#9B0000', Maserati: '#1E4FA3', 'Maserati / Mercedes': '#1E4FA3', Cooper: '#1F6B3A', BRM: '#2F6B47', Lotus: '#C9A227', Brabham: '#2C7DB8', Matra: '#2F5EA8', Tyrrell: '#1F3E8C', Williams: '#64C4FF', Benetton: '#28A745', Renault: '#FFD100', Brawn: '#D6F03C' };

// Team records up to the end of 2024. `scope` says which names the figures cover; `lineage` folds an
// earlier entry's record and career seasons into a renamed one (Kick Sauber becomes Audi in 2026).
// starts = Grands Prix entered, podiums count every podium finish, drvTitles = drivers' titles won with the team.
const TEAM_BIO = {
  mclaren: { full: 'McLaren Formula 1 Team', short: 'MCL', color2: '#47C7FC', base: 'Woking, United Kingdom', since: 1966, principal: 'Andrea Stella', engine: 'Mercedes', starts: 984, wins: 189, poles: 164, podiums: 524, fls: 172, conTitles: [1974, 1984, 1985, 1988, 1989, 1990, 1991, 1998, 2024], drvTitles: 12, firstWin: '1968 Belgian GP', scope: 'McLaren since its 1966 debut', about: 'Founded by New Zealander Bruce McLaren. The Senna–Prost years made it the team to beat, and a rebuild under Zak Brown and Andrea Stella brought a first constructors’ title in 26 years in 2024.' },
  ferrari: { full: 'Scuderia Ferrari HP', short: 'FER', color2: '#FFEB00', base: 'Maranello, Italy', since: 1950, principal: 'Frédéric Vasseur', engine: 'Ferrari', starts: 1098, wins: 248, poles: 253, podiums: 830, fls: 263, conTitles: [1961, 1964, 1975, 1976, 1977, 1979, 1982, 1983, 1999, 2000, 2001, 2002, 2003, 2004, 2007, 2008], drvTitles: 15, firstWin: '1951 British GP', scope: 'Ferrari since the first World Championship season in 1950', about: 'The only team to race in every season of the World Championship and the most successful in its history. Its 2000–2004 run with Michael Schumacher brought five straight doubles.' },
  redbull: { full: 'Oracle Red Bull Racing', short: 'RBR', color2: '#FFCC00', base: 'Milton Keynes, United Kingdom', since: 2005, principal: 'Christian Horner', engine: 'Honda RBPT', starts: 394, wins: 122, poles: 103, podiums: 287, fls: 99, conTitles: [2010, 2011, 2012, 2013, 2022, 2023], drvTitles: 8, firstWin: '2009 Chinese GP', scope: 'Red Bull Racing since 2005 (the factory raced as Stewart and Jaguar before that)', about: 'Bought Jaguar’s team in 2005 and turned it into a champion within five years. Won four doubles with Vettel, then 21 of 22 races in 2023 with Verstappen.' },
  mercedes: { full: 'Mercedes-AMG Petronas F1 Team', short: 'MER', color2: '#C7CED9', base: 'Brackley, United Kingdom', since: 1954, principal: 'Toto Wolff', engine: 'Mercedes', starts: 317, wins: 129, poles: 140, podiums: 296, fls: 104, conTitles: [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021], drvTitles: 9, firstWin: '1954 French GP', scope: 'Mercedes in 1954–55 and as a works team since 2010', about: 'Fangio’s silver arrows of the 1950s, then a record eight constructors’ titles in a row from 2014 as the hybrid era’s benchmark.' },
  aston: { full: 'Aston Martin Aramco F1 Team', short: 'AMR', color2: '#CEDC00', base: 'Silverstone, United Kingdom', since: 2021, principal: 'Andy Cowell', engine: 'Mercedes', starts: 90, wins: 0, poles: 0, podiums: 9, fls: 1, conTitles: [], drvTitles: 0, bestFinish: 2, scope: 'The Aston Martin name since 2021. The Silverstone team began as Jordan in 1991 and won races as Jordan and Racing Point.', about: 'Lawrence Stroll’s project, backed by a new factory and wind tunnel. Fernando Alonso’s eight podiums in 2023 are its best season so far.' },
  alpine: { full: 'BWT Alpine F1 Team', short: 'ALP', color2: '#2173B8', base: 'Enstone, United Kingdom', since: 2021, principal: 'Oliver Oakes', engine: 'Renault', starts: 90, wins: 1, poles: 0, podiums: 6, fls: 0, conTitles: [], drvTitles: 0, firstWin: '2021 Hungarian GP', scope: 'The Alpine name since 2021. The Enstone team won titles as Benetton (1995) and Renault (2005, 2006).', about: 'Renault’s works team under its sports-car brand. Esteban Ocon’s Hungary win in 2021 and a double podium in Brazil 2024 are the highlights.' },
  williams: { full: 'Atlassian Williams Racing', short: 'WIL', color2: '#1E5BC6', base: 'Grove, United Kingdom', since: 1977, principal: 'James Vowles', engine: 'Mercedes', starts: 839, wins: 114, poles: 128, podiums: 313, fls: 133, conTitles: [1980, 1981, 1986, 1987, 1992, 1993, 1994, 1996, 1997], drvTitles: 7, firstWin: '1979 British GP', scope: 'Williams Grand Prix Engineering since 1977', about: 'Sir Frank Williams and Patrick Head built the team of the 1980s and 1990s. Sold to Dorilton Capital in 2020 and rebuilding under James Vowles.' },
  rb: { full: 'Visa Cash App Racing Bulls', short: 'RB', color2: '#FFFFFF', base: 'Faenza, Italy', since: 2006, principal: 'Laurent Mekies', engine: 'Honda RBPT', starts: 375, wins: 2, poles: 1, podiums: 5, fls: 4, conTitles: [], drvTitles: 0, firstWin: '2008 Italian GP', scope: 'The Faenza team since 2006, as Toro Rosso (2006–19), AlphaTauri (2020–23), RB (2024) and Racing Bulls (2025–)', about: 'Red Bull’s second team and talent school. Vettel’s wet Monza win in 2008 and Gasly’s in 2020 both came at Monza.' },
  haas: { full: 'MoneyGram Haas F1 Team', short: 'HAA', color2: '#E6002B', base: 'Kannapolis, USA', since: 2016, principal: 'Ayao Komatsu', engine: 'Ferrari', starts: 190, wins: 0, poles: 1, podiums: 0, fls: 2, conTitles: [], drvTitles: 0, bestFinish: 4, scope: 'Haas since its 2016 debut', about: 'Gene Haas’s American team, run on a close technical partnership with Ferrari. Scored points on debut and took pole in Brazil 2022 with Kevin Magnussen.' },
  sauber: { full: 'Stake F1 Team Kick Sauber', short: 'SAU', color2: '#FFFFFF', base: 'Hinwil, Switzerland', since: 1993, principal: 'Jonathan Wheatley', engine: 'Ferrari', starts: 593, wins: 1, poles: 1, podiums: 27, fls: 5, conTitles: [], drvTitles: 0, firstWin: '2008 Canadian GP', scope: 'The Hinwil team since 1993, as Sauber, BMW Sauber (2006–09) and Alfa Romeo (2019–23)', about: 'Peter Sauber’s team gave debuts to Räikkönen, Massa and Leclerc. Robert Kubica won in Canada 2008 as BMW Sauber. Becomes Audi’s works team in 2026.' },
  apxgp: { full: 'APXGP', short: 'APX', color2: '#FFFFFF', base: 'Fictional', since: 2025, principal: 'Ruben Cervantes', engine: 'Mercedes', starts: 0, wins: 0, poles: 0, podiums: 0, fls: 0, conTitles: [], drvTitles: 0, fictional: true, scope: 'Fictional team from the F1 film, added to F1 25', about: 'The struggling underdog from the F1 film, rescued by veteran Sonny Hayes and rookie Joshua Pearce.' },
  audi: { full: 'Audi F1 Team', short: 'AUD', color2: '#C0C0C0', base: 'Hinwil, Switzerland', since: 2026, principal: 'Jonathan Wheatley', engine: 'Audi', lineage: ['sauber'], scope: 'Audi’s works team from 2026, taking over the Sauber entry. Figures include the Hinwil team’s record.', about: 'Audi bought Sauber to enter F1 with its own power unit under the 2026 rules.' },
  cadillac: { full: 'Cadillac Formula 1 Team', short: 'CAD', color2: '#B8A26A', base: 'Fishers, Indiana and Silverstone', since: 2026, principal: 'Graeme Lowdon', engine: 'Ferrari', starts: 0, wins: 0, poles: 0, podiums: 0, fls: 0, conTitles: [], drvTitles: 0, scope: 'New team for 2026', about: 'General Motors and TWG Global’s new 11th team, using Ferrari engines until GM’s own power unit is ready.' },
};

// All-time F1 records at the start of 2025, limited to ones a career can change.
// Age records give the holder's birth date and the day it was set; the app works out the age.
// `key` links a holder to a driver or team id so their career results keep counting.
const RECORDS = [
  { id: 'youngStart', group: 'age', label: 'youngest race starter', holders: [{ key: 'VER', name: 'Max Verstappen', born: '1997-09-30', date: '2015-03-15', when: '2015 Australian GP' }] },
  { id: 'youngPoints', group: 'age', label: 'youngest points scorer', holders: [{ key: 'VER', name: 'Max Verstappen', born: '1997-09-30', date: '2015-03-29', when: '2015 Malaysian GP' }] },
  { id: 'youngPodium', group: 'age', label: 'youngest podium finisher', holders: [{ key: 'VER', name: 'Max Verstappen', born: '1997-09-30', date: '2016-05-15', when: '2016 Spanish GP' }] },
  { id: 'youngPole', group: 'age', label: 'youngest pole-sitter', holders: [{ key: 'VET', name: 'Sebastian Vettel', born: '1987-07-03', date: '2008-09-13', when: '2008 Italian GP' }] },
  { id: 'youngWin', group: 'age', label: 'youngest race winner', holders: [{ key: 'VER', name: 'Max Verstappen', born: '1997-09-30', date: '2016-05-15', when: '2016 Spanish GP' }] },
  { id: 'youngTitle1', group: 'age', label: 'youngest world champion', holders: [{ key: 'VET', name: 'Sebastian Vettel', born: '1987-07-03', date: '2010-11-14', when: '2010' }] },
  { id: 'youngTitle2', group: 'age', label: 'youngest two-time world champion', holders: [{ key: 'VET', name: 'Sebastian Vettel', born: '1987-07-03', date: '2011-10-09', when: '2011' }] },
  { id: 'youngTitle3', group: 'age', label: 'youngest three-time world champion', holders: [{ key: 'VET', name: 'Sebastian Vettel', born: '1987-07-03', date: '2012-11-25', when: '2012' }] },
  { id: 'youngTitle4', group: 'age', label: 'youngest four-time world champion', holders: [{ key: 'VET', name: 'Sebastian Vettel', born: '1987-07-03', date: '2013-10-27', when: '2013' }] },
  { id: 'youngTitle5', group: 'age', label: 'youngest five-time world champion', holders: [{ key: 'MSC', name: 'Michael Schumacher', born: '1969-01-03', date: '2002-07-21', when: '2002' }] },
  { id: 'youngTitle6', group: 'age', label: 'youngest six-time world champion', holders: [{ key: 'MSC', name: 'Michael Schumacher', born: '1969-01-03', date: '2003-10-12', when: '2003' }] },
  { id: 'youngTitle7', group: 'age', label: 'youngest seven-time world champion', holders: [{ key: 'MSC', name: 'Michael Schumacher', born: '1969-01-03', date: '2004-08-29', when: '2004' }] },
  { id: 'youngTitle8', group: 'age', label: 'first eight-time world champion', holders: [] },
  { id: 'oldWin', group: 'age', max: true, label: 'oldest race winner', holders: [{ key: 'FAG', name: 'Luigi Fagioli', born: '1898-06-09', date: '1951-07-01', when: '1951 French GP' }] },
  { id: 'oldTitle', group: 'age', max: true, label: 'oldest world champion', holders: [{ key: 'FAN', name: 'Juan Manuel Fangio', born: '1911-06-24', date: '1957-08-04', when: '1957' }] },

  { id: 'titles', group: 'total', label: 'most world titles', value: 7, holders: [{ key: 'MSC', name: 'Michael Schumacher', when: '1994–2004' }, { key: 'HAM', name: 'Lewis Hamilton', when: '2008–2020' }] },
  { id: 'titleStreak', group: 'total', label: 'most consecutive world titles', value: 5, holders: [{ key: 'MSC', name: 'Michael Schumacher', when: '2000–2004' }] },
  { id: 'wins', group: 'total', label: 'most race wins', value: 105, holders: [{ key: 'HAM', name: 'Lewis Hamilton', when: '2007–2024' }] },
  { id: 'poles', group: 'total', label: 'most pole positions', value: 104, holders: [{ key: 'HAM', name: 'Lewis Hamilton', when: '2007–2024' }] },
  { id: 'podiums', group: 'total', label: 'most podiums', value: 202, holders: [{ key: 'HAM', name: 'Lewis Hamilton', when: '2007–2024' }] },
  { id: 'starts', group: 'total', label: 'most race starts', value: 401, holders: [{ key: 'ALO', name: 'Fernando Alonso', when: '2001–2024' }] },
  { id: 'pts', group: 'total', label: 'most career points', value: 4862.5, holders: [{ key: 'HAM', name: 'Lewis Hamilton', when: '2007–2024' }] },
  { id: 'fls', group: 'total', label: 'most fastest laps', value: 77, holders: [{ key: 'MSC', name: 'Michael Schumacher', when: '1991–2012' }] },
  { id: 'winless', group: 'total', label: 'most starts without a win', value: 227, holders: [{ key: 'HUL', name: 'Nico Hülkenberg', when: '2010–2024' }] },

  { id: 'winStreak', group: 'streak', label: 'most consecutive wins', value: 10, holders: [{ key: 'VER', name: 'Max Verstappen', when: '2023, Miami to Italy' }] },
  { id: 'podStreak', group: 'streak', label: 'most consecutive podiums', value: 19, holders: [{ key: 'MSC', name: 'Michael Schumacher', when: '2001–2002' }] },
  { id: 'poleStreak', group: 'streak', label: 'most consecutive pole positions', value: 8, holders: [{ key: 'SEN', name: 'Ayrton Senna', when: '1988–1989' }] },
  { id: 'ptsStreak', group: 'streak', label: 'most consecutive points finishes', value: 48, holders: [{ key: 'HAM', name: 'Lewis Hamilton', when: '2018–2020' }] },

  { id: 'seasonWins', group: 'season', label: 'most wins in a season', value: 19, holders: [{ key: 'VER', name: 'Max Verstappen', when: '2023' }] },
  { id: 'seasonPods', group: 'season', label: 'most podiums in a season', value: 21, holders: [{ key: 'VER', name: 'Max Verstappen', when: '2023' }] },
  { id: 'seasonPoles', group: 'season', label: 'most poles in a season', value: 15, holders: [{ key: 'VET', name: 'Sebastian Vettel', when: '2011' }] },
  { id: 'seasonPts', group: 'season', label: 'most points in a season', value: 575, holders: [{ key: 'VER', name: 'Max Verstappen', when: '2023' }] },
  { id: 'seasonWinPct', group: 'season', pct: true, label: 'highest win rate in a season', value: 86.4, holders: [{ key: 'VER', name: 'Max Verstappen', when: '2023, 19 of 22' }] },
  { id: 'titleMargin', group: 'season', label: 'biggest title-winning margin', value: 290, holders: [{ key: 'VER', name: 'Max Verstappen', when: '2023' }] },

  { id: 'teamTitles', group: 'team', label: 'most constructors’ titles', value: 16, holders: [{ key: 'ferrari', name: 'Ferrari', when: '1961–2008' }] },
  { id: 'teamStreak', group: 'team', label: 'most consecutive constructors’ titles', value: 8, holders: [{ key: 'mercedes', name: 'Mercedes', when: '2014–2021' }] },
  { id: 'teamWins', group: 'team', label: 'most wins by a team', value: 248, holders: [{ key: 'ferrari', name: 'Ferrari', when: '1951–2024' }] },
  { id: 'teamSeasonWins', group: 'team', label: 'most wins by a team in a season', value: 21, holders: [{ key: 'redbull', name: 'Red Bull Racing', when: '2023' }] },
];
// Runs still going at the start of 2025
const STREAKS_2025 = { titleStreak: { VER: 4 }, teamStreak: { mclaren: 1 } };

// The last season each driver's contract covered going into that year, as publicly reported (approximate:
// options and extensions were not always disclosed). Contracts in Pitwall are for show and never block a move.
const CONTRACTS = {
  2025: { VER: 2028, TSU: 2025, NOR: 2027, PIA: 2026, LEC: 2029, HAM: 2026, RUS: 2025, ANT: 2025, ALO: 2026, STR: 2026, GAS: 2026, COL: 2025, DOO: 2025,
    ALB: 2027, SAI: 2026, HAD: 2025, LAW: 2025, OCO: 2026, BEA: 2026, HUL: 2026, BOR: 2026, HAY: 2026, PEA: 2026, LIN: 2025, BOT: 2025 },
  2026: { VER: 2028, HAD: 2026, NOR: 2027, PIA: 2027, LEC: 2029, HAM: 2026, RUS: 2026, ANT: 2026, ALO: 2026, STR: 2026, GAS: 2028, COL: 2026,
    ALB: 2027, SAI: 2026, LAW: 2026, LIN: 2026, OCO: 2026, BEA: 2026, HUL: 2026, BOR: 2026, PER: 2027, BOT: 2026 },
};

// Rough qualifying pace of each car in F1 25 (seconds per lap off the fastest), used to spread out auto-filled lap
// times before a season has its own data. Once sessions are logged, the season's measured pace takes over.
const BASE_PACE = { mclaren: 0, ferrari: 0.2, redbull: 0.25, mercedes: 0.25, williams: 0.55, rb: 0.6, aston: 0.7, haas: 0.7, alpine: 0.75, sauber: 0.8, audi: 0.8, apxgp: 0.9, cadillac: 1.0, myteam: 0.8 };

Object.assign(window.F1DATA, { DRIVER_BIO, HIST_DRIVERS, HIST_TEAM_COLORS, TRACKS, CHAMPIONS, CHAMP_BIO, TITLE_TEAM_COLORS, TEAM_BIO, RECORDS, STREAKS_2025, CONTRACTS, BASE_PACE });

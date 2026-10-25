// Hand-kept facts the history build needs on top of the raw results: Pitwall's ids for teams, circuits and
// drivers, team names and colours by year, and details for circuits and teams that left the calendar.

// Ergast constructor id -> Pitwall team id. Renamed entries share an id where Pitwall treats them as one team.
const TEAM_IDS = {
  mercedes: 'mercedes', red_bull: 'redbull', ferrari: 'ferrari', mclaren: 'mclaren', williams: 'williams', haas: 'haas',
  force_india: 'forceindia', racing_point: 'racingpoint', aston_martin: 'aston', renault: 'renault', alpine: 'alpine',
  toro_rosso: 'rb', alphatauri: 'rb', rb: 'rb', sauber: 'sauber', alfa: 'sauber', manor: 'manor',
};
// what each Pitwall team's record covers before 2016 (Ergast ids, and the first year that counts)
const TEAM_LINEAGE = {
  mercedes: [['mercedes', 1950]], redbull: [['red_bull', 1950]], ferrari: [['ferrari', 1950]], mclaren: [['mclaren', 1950]],
  williams: [['williams', 1950]], haas: [['haas', 1950]], forceindia: [['force_india', 1950]], racingpoint: [['racing_point', 1950]],
  aston: [['aston_martin', 2021]], renault: [['renault', 1950]], alpine: [['alpine', 1950]],
  rb: [['toro_rosso', 1950], ['alphatauri', 1950], ['rb', 1950]], sauber: [['sauber', 1950], ['bmw_sauber', 1950], ['alfa', 2019]],
  manor: [['manor', 1950], ['marussia', 1950], ['virgin', 1950]],
};
// [first year, name, colour]: the entry that applies is the last one starting at or before the season
const TEAM_LOOK = {
  mercedes: [[2016, 'Mercedes', '#00D2BE'], [2022, 'Mercedes', '#6CD3BF'], [2024, 'Mercedes', '#27F4D2']],
  ferrari: [[2016, 'Ferrari', '#DC0000'], [2022, 'Ferrari', '#F91536'], [2024, 'Ferrari', '#E8002D']],
  redbull: [[2016, 'Red Bull Racing', '#1E41FF'], [2018, 'Red Bull Racing', '#0600EF'], [2022, 'Red Bull Racing', '#3671C6']],
  mclaren: [[2016, 'McLaren', '#FF8700'], [2024, 'McLaren', '#FF8000']],
  williams: [[2016, 'Williams', '#E6E6E6'], [2021, 'Williams', '#005AFF'], [2023, 'Williams', '#37BEDD'], [2024, 'Williams', '#64C4FF']],
  forceindia: [[2016, 'Force India', '#F596C8']],
  racingpoint: [[2018, 'Racing Point Force India', '#F596C8'], [2019, 'Racing Point', '#F596C8']],
  aston: [[2021, 'Aston Martin', '#006F62'], [2023, 'Aston Martin', '#358C75'], [2024, 'Aston Martin', '#229971']],
  renault: [[2016, 'Renault', '#FFF500']],
  alpine: [[2021, 'Alpine', '#0090FF'], [2022, 'Alpine', '#2293D1'], [2024, 'Alpine', '#FF87BC']],
  rb: [[2016, 'Toro Rosso', '#469BFF'], [2020, 'AlphaTauri', '#4E7C9B'], [2022, 'AlphaTauri', '#5E8FAA'], [2024, 'RB', '#6692FF'], [2025, 'Racing Bulls', '#6692FF']],
  sauber: [[2016, 'Sauber', '#006EFF'], [2018, 'Sauber', '#9B0000'], [2019, 'Alfa Romeo', '#9B0000'], [2022, 'Alfa Romeo', '#C92D4B'], [2024, 'Kick Sauber', '#52E252']],
  haas: [[2016, 'Haas', '#787878'], [2021, 'Haas', '#B6BABD']],
  manor: [[2016, 'Manor', '#C8102E']],
};

// Ergast circuit id -> Pitwall track id
const TRACK_IDS = {
  albert_park: 'aus', shanghai: 'chn', suzuka: 'jpn', bahrain: 'bhr', jeddah: 'sau', miami: 'mia', imola: 'emi', monaco: 'mon',
  catalunya: 'esp', villeneuve: 'can', red_bull_ring: 'aut', silverstone: 'gbr', spa: 'bel', hungaroring: 'hun', zandvoort: 'ned',
  monza: 'ita', baku: 'aze', marina_bay: 'sgp', americas: 'usa', rodriguez: 'mex', interlagos: 'bra', vegas: 'lvg', losail: 'qat',
  yas_marina: 'abu', sochi: 'rus', ricard: 'fra', hockenheimring: 'ger', sepang: 'mal', portimao: 'por', mugello: 'tus',
  nurburgring: 'eif', istanbul: 'tur',
};
// Grands Prix that weren't the usual race at their circuit: their own round id and name
const SPECIAL_RACES = {
  'Styrian Grand Prix': ['sty', 'Styria'], '70th Anniversary Grand Prix': ['ann', '70th Anniversary'], 'Sakhir Grand Prix': ['skh', 'Sakhir'],
  'European Grand Prix': ['aze', 'Europe'],
};
// Pitwall's name and venue for each circuit's usual race
const TRACK_NAMES = {
  aus: ['Australia', 'Melbourne'], chn: ['China', 'Shanghai'], jpn: ['Japan', 'Suzuka'], bhr: ['Bahrain', 'Sakhir'], sau: ['Saudi Arabia', 'Jeddah'],
  mia: ['Miami', 'Miami'], emi: ['Emilia-Romagna', 'Imola'], mon: ['Monaco', 'Monte Carlo'], esp: ['Spain', 'Barcelona'], can: ['Canada', 'Montréal'],
  aut: ['Austria', 'Spielberg'], gbr: ['Great Britain', 'Silverstone'], bel: ['Belgium', 'Spa-Francorchamps'], hun: ['Hungary', 'Budapest'],
  ned: ['Netherlands', 'Zandvoort'], ita: ['Italy', 'Monza'], aze: ['Azerbaijan', 'Baku'], sgp: ['Singapore', 'Marina Bay'], usa: ['United States', 'Austin'],
  mex: ['Mexico', 'Mexico City'], bra: ['Brazil', 'São Paulo'], lvg: ['Las Vegas', 'Las Vegas'], qat: ['Qatar', 'Lusail'], abu: ['Abu Dhabi', 'Yas Marina'],
  rus: ['Russia', 'Sochi'], fra: ['France', 'Le Castellet'], ger: ['Germany', 'Hockenheim'], mal: ['Malaysia', 'Sepang'], por: ['Portugal', 'Portimão'],
  tus: ['Tuscany', 'Mugello'], eif: ['Eifel', 'Nürburgring'], tur: ['Turkey', 'Istanbul'], sty: ['Styria', 'Spielberg'], ann: ['70th Anniversary', 'Silverstone'],
  skh: ['Sakhir', 'Sakhir'],
};
const ROUND_TRACK = { sty: 'aut', ann: 'gbr', skh: 'bhr' };

// Circuits no longer on the calendar, in the same shape as reference.js TRACKS (history comes from the seasons)
const OLD_TRACKS = {
  rus: { circuit: 'Sochi Autodrom', city: 'Sochi', country: 'Russia', km: 5.848, laps: 53, corners: 18, firstGP: 2014, record: ['1:35.761', 'Lewis Hamilton', 2019],
    about: 'Laid out around the 2014 Winter Olympics park. A long run to the first braking zone and many 90-degree corners; dropped after 2021.' },
  fra: { circuit: 'Circuit Paul Ricard', city: 'Le Castellet', country: 'France', km: 5.842, laps: 53, corners: 15, firstGP: 1971, record: ['1:32.740', 'Sebastian Vettel', 2019],
    about: 'Wide test track with blue-and-red run-off stripes and the long Mistral straight, broken by a chicane. Hosted the French GP from 2018 to 2022.' },
  ger: { circuit: 'Hockenheimring', city: 'Hockenheim', country: 'Germany', km: 4.574, laps: 67, corners: 17, firstGP: 1970, record: ['1:13.780', 'Kimi Räikkönen', 2004],
    about: 'Shortened in 2002 from the old forest blast to a stadium circuit with a hairpin overtaking spot. Last hosted F1 in 2019.' },
  mal: { circuit: 'Sepang International Circuit', city: 'Sepang', country: 'Malaysia', km: 5.543, laps: 56, corners: 15, firstGP: 1999, record: ['1:34.080', 'Sebastian Vettel', 2017],
    about: 'Hot, humid and prone to tropical storms. Two long straights joined by a tight hairpin; the race left the calendar after 2017.' },
  por: { circuit: 'Autódromo Internacional do Algarve', city: 'Portimão', country: 'Portugal', km: 4.653, laps: 66, corners: 15, firstGP: 2020, record: ['1:18.750', 'Lewis Hamilton', 2020],
    about: 'A rollercoaster of blind crests and dips in southern Portugal, brought in during the 2020 season and raced again in 2021.' },
  tus: { circuit: 'Autodromo Internazionale del Mugello', city: 'Scarperia', country: 'Italy', km: 5.245, laps: 59, corners: 15, firstGP: 2020, record: ['1:18.833', 'Lewis Hamilton', 2020],
    about: 'Ferrari’s fast, sweeping test track in the Tuscan hills. Its one Grand Prix, in 2020, marked Ferrari’s 1000th race.' },
  eif: { circuit: 'Nürburgring', city: 'Nürburg', country: 'Germany', km: 5.148, laps: 60, corners: 15, firstGP: 1984, record: ['1:28.139', 'Max Verstappen', 2020],
    about: 'The modern GP circuit next to the old Nordschleife. Returned once, as the 2020 Eifel GP, in cold October weather.' },
  tur: { circuit: 'Istanbul Park', city: 'Istanbul', country: 'Turkey', km: 5.338, laps: 58, corners: 14, firstGP: 2005, record: ['1:24.770', 'Juan Pablo Montoya', 2005],
    about: 'Famous for the four-apex Turn 8. Came back in 2020 and 2021, on a slippery new surface the first time.' },
};

// Teams that raced between 2016 and 2025 but aren't on today's grid, in the shape of reference.js TEAM_BIO
const OLD_TEAMS = {
  renault: { full: 'Renault F1 Team', short: 'REN', color2: '#000000', base: 'Enstone, United Kingdom', since: 1977, principal: 'Cyril Abiteboul', engine: 'Renault',
    scope: 'Renault as a constructor: 1977–85, 2002–11 and 2016–20. The Enstone team raced as Alpine from 2021.', about: 'Brought turbo power to F1 in 1977 and won back-to-back doubles with Fernando Alonso in 2005 and 2006. Returned as a works team in 2016 before becoming Alpine.' },
  forceindia: { full: 'Sahara Force India F1 Team', short: 'FOR', color2: '#FF6600', base: 'Silverstone, United Kingdom', since: 2008, principal: 'Vijay Mallya', engine: 'Mercedes',
    scope: 'Force India, 2008 to mid-2018. The Silverstone team began as Jordan and became Racing Point, then Aston Martin.', about: 'Punched far above its budget, finishing fourth in 2016 and 2017. Went into administration in 2018 and was rescued by a consortium led by Lawrence Stroll.' },
  racingpoint: { full: 'BWT Racing Point F1 Team', short: 'RPT', color2: '#0A79D6', base: 'Silverstone, United Kingdom', since: 2018, principal: 'Otmar Szafnauer', engine: 'Mercedes',
    scope: 'Racing Point, from the 2018 Belgian GP to 2020. Became Aston Martin in 2021.', about: 'Lawrence Stroll’s rescue of Force India. Its 2020 car earned the nickname “pink Mercedes”, and Sergio Pérez won the Sakhir GP with it.' },
  manor: { full: 'Manor Racing MRT', short: 'MAN', color2: '#1B3D8F', base: 'Banbury, United Kingdom', since: 2010, principal: 'Dave Ryan', engine: 'Mercedes',
    scope: 'Virgin (2010–11), Marussia (2012–15) and Manor (2016).', about: 'The last survivor of the 2010 newcomers. Pascal Wehrlein’s point in Austria 2016 was its best result before the team folded that winter.' },
};

// Ergast driver id -> Pitwall id, where the three-letter code is taken or clashes with a champion's key
const DRIVER_IDS = { mick_schumacher: 'MIC', haryanto: 'HRY', pietro_fittipaldi: 'PFI' };
// Names shown family name first
const FAMILY_FIRST = { zhou: true };

module.exports = { TEAM_IDS, TEAM_LINEAGE, TEAM_LOOK, TRACK_IDS, SPECIAL_RACES, TRACK_NAMES, ROUND_TRACK, OLD_TRACKS, OLD_TEAMS, DRIVER_IDS, FAMILY_FIRST };

// Reference data: grids and calendars as they appear in F1 25 (2025 base game + APXGP)
// and the F1 25 2026 Season Pack (Audi + Cadillac). Everything here is only a template:
// each career copies it into its own season and every roster/calendar is editable in-app.

const DRIVERS = {
  NOR: { id: 'NOR', name: 'Lando Norris', abbr: 'NOR', number: 4 },
  PIA: { id: 'PIA', name: 'Oscar Piastri', abbr: 'PIA', number: 81 },
  LEC: { id: 'LEC', name: 'Charles Leclerc', abbr: 'LEC', number: 16 },
  HAM: { id: 'HAM', name: 'Lewis Hamilton', abbr: 'HAM', number: 44 },
  VER: { id: 'VER', name: 'Max Verstappen', abbr: 'VER', number: 1 },
  TSU: { id: 'TSU', name: 'Yuki Tsunoda', abbr: 'TSU', number: 22 },
  RUS: { id: 'RUS', name: 'George Russell', abbr: 'RUS', number: 63 },
  ANT: { id: 'ANT', name: 'Andrea Kimi Antonelli', abbr: 'ANT', number: 12 },
  ALO: { id: 'ALO', name: 'Fernando Alonso', abbr: 'ALO', number: 14 },
  STR: { id: 'STR', name: 'Lance Stroll', abbr: 'STR', number: 18 },
  GAS: { id: 'GAS', name: 'Pierre Gasly', abbr: 'GAS', number: 10 },
  COL: { id: 'COL', name: 'Franco Colapinto', abbr: 'COL', number: 43 },
  DOO: { id: 'DOO', name: 'Jack Doohan', abbr: 'DOO', number: 7 },
  ALB: { id: 'ALB', name: 'Alexander Albon', abbr: 'ALB', number: 23 },
  SAI: { id: 'SAI', name: 'Carlos Sainz', abbr: 'SAI', number: 55 },
  HAD: { id: 'HAD', name: 'Isack Hadjar', abbr: 'HAD', number: 6 },
  LAW: { id: 'LAW', name: 'Liam Lawson', abbr: 'LAW', number: 30 },
  OCO: { id: 'OCO', name: 'Esteban Ocon', abbr: 'OCO', number: 31 },
  BEA: { id: 'BEA', name: 'Oliver Bearman', abbr: 'BEA', number: 87 },
  HUL: { id: 'HUL', name: 'Nico Hülkenberg', abbr: 'HUL', number: 27 },
  BOR: { id: 'BOR', name: 'Gabriel Bortoleto', abbr: 'BOR', number: 5 },
  HAY: { id: 'HAY', name: 'Sonny Hayes', abbr: 'HAY', number: 7 },
  PEA: { id: 'PEA', name: 'Joshua Pearce', abbr: 'PEA', number: 9 },
  LIN: { id: 'LIN', name: 'Arvid Lindblad', abbr: 'LIN', number: 41 },
  PER: { id: 'PER', name: 'Sergio Pérez', abbr: 'PER', number: 11 },
  BOT: { id: 'BOT', name: 'Valtteri Bottas', abbr: 'BOT', number: 77 },
};

const GRID_2025 = [
  { id: 'mclaren', name: 'McLaren', color: '#FF8000', drivers: ['NOR', 'PIA'] },
  { id: 'ferrari', name: 'Ferrari', color: '#E8002D', drivers: ['LEC', 'HAM'] },
  { id: 'redbull', name: 'Red Bull Racing', color: '#3671C6', drivers: ['VER', 'TSU'] },
  { id: 'mercedes', name: 'Mercedes', color: '#27F4D2', drivers: ['RUS', 'ANT'] },
  { id: 'aston', name: 'Aston Martin', color: '#229971', drivers: ['ALO', 'STR'] },
  { id: 'alpine', name: 'Alpine', color: '#FF87BC', drivers: ['GAS', 'COL'] },
  { id: 'williams', name: 'Williams', color: '#64C4FF', drivers: ['ALB', 'SAI'] },
  { id: 'rb', name: 'Racing Bulls', color: '#6692FF', drivers: ['HAD', 'LAW'] },
  { id: 'haas', name: 'Haas', color: '#B6BABD', drivers: ['OCO', 'BEA'] },
  { id: 'sauber', name: 'Kick Sauber', color: '#52E252', drivers: ['HUL', 'BOR'] },
  { id: 'apxgp', name: 'APXGP', color: '#D4A72C', drivers: ['HAY', 'PEA'] },
];

const GRID_2026 = [
  { id: 'mclaren', name: 'McLaren', color: '#FF8000', drivers: ['NOR', 'PIA'] },
  { id: 'ferrari', name: 'Ferrari', color: '#E8002D', drivers: ['LEC', 'HAM'] },
  { id: 'redbull', name: 'Red Bull Racing', color: '#3671C6', drivers: ['VER', 'HAD'] },
  { id: 'mercedes', name: 'Mercedes', color: '#27F4D2', drivers: ['RUS', 'ANT'] },
  { id: 'aston', name: 'Aston Martin', color: '#229971', drivers: ['ALO', 'STR'] },
  { id: 'alpine', name: 'Alpine', color: '#FF87BC', drivers: ['GAS', 'COL'] },
  { id: 'williams', name: 'Williams', color: '#64C4FF', drivers: ['ALB', 'SAI'] },
  { id: 'rb', name: 'Racing Bulls', color: '#6692FF', drivers: ['LAW', 'LIN'] },
  { id: 'haas', name: 'Haas', color: '#B6BABD', drivers: ['OCO', 'BEA'] },
  { id: 'audi', name: 'Audi', color: '#F50537', drivers: ['HUL', 'BOR'] },
  { id: 'cadillac', name: 'Cadillac', color: '#E9E4D8', drivers: ['PER', 'BOT'] },
];

// 2026 driver numbers that changed from 2025 (Verstappen's choice once he no longer had the number 1).
// The number 1 itself is not here: it goes to whoever won the title in your career (see syncNumbers in app.js).
const NUMBERS_2026 = { VER: 3 };

const CAL_2025 = [
  ['aus', 'Australia', 'Melbourne', false],
  ['chn', 'China', 'Shanghai', true],
  ['jpn', 'Japan', 'Suzuka', false],
  ['bhr', 'Bahrain', 'Sakhir', false],
  ['sau', 'Saudi Arabia', 'Jeddah', false],
  ['mia', 'Miami', 'Miami', true],
  ['emi', 'Emilia-Romagna', 'Imola', false],
  ['mon', 'Monaco', 'Monte Carlo', false],
  ['esp', 'Spain', 'Barcelona', false],
  ['can', 'Canada', 'Montréal', false],
  ['aut', 'Austria', 'Spielberg', false],
  ['gbr', 'Great Britain', 'Silverstone', false],
  ['bel', 'Belgium', 'Spa-Francorchamps', true],
  ['hun', 'Hungary', 'Budapest', false],
  ['ned', 'Netherlands', 'Zandvoort', false],
  ['ita', 'Italy', 'Monza', false],
  ['aze', 'Azerbaijan', 'Baku', false],
  ['sgp', 'Singapore', 'Marina Bay', false],
  ['usa', 'United States', 'Austin', true],
  ['mex', 'Mexico', 'Mexico City', false],
  ['bra', 'Brazil', 'São Paulo', true],
  ['lvg', 'Las Vegas', 'Las Vegas', false],
  ['qat', 'Qatar', 'Lusail', true],
  ['abu', 'Abu Dhabi', 'Yas Marina', false],
];

const CAL_2026 = [
  ['aus', 'Australia', 'Melbourne', false],
  ['chn', 'China', 'Shanghai', true],
  ['jpn', 'Japan', 'Suzuka', false],
  ['bhr', 'Bahrain', 'Sakhir', false],
  ['sau', 'Saudi Arabia', 'Jeddah', false],
  ['mia', 'Miami', 'Miami', true],
  ['can', 'Canada', 'Montréal', true],
  ['mon', 'Monaco', 'Monte Carlo', false],
  ['esp', 'Barcelona-Catalunya', 'Barcelona', false],
  ['aut', 'Austria', 'Spielberg', false],
  ['gbr', 'Great Britain', 'Silverstone', true],
  ['bel', 'Belgium', 'Spa-Francorchamps', false],
  ['hun', 'Hungary', 'Budapest', false],
  ['ned', 'Netherlands', 'Zandvoort', true],
  ['ita', 'Italy', 'Monza', false],
  ['mad', 'Spain', 'Madring, Madrid', false],
  ['aze', 'Azerbaijan', 'Baku', false],
  ['sgp', 'Singapore', 'Marina Bay', true],
  ['usa', 'United States', 'Austin', false],
  ['mex', 'Mexico', 'Mexico City', false],
  ['bra', 'Brazil', 'São Paulo', false],
  ['lvg', 'Las Vegas', 'Las Vegas', false],
  ['qat', 'Qatar', 'Lusail', false],
  ['abu', 'Abu Dhabi', 'Yas Marina', false],
];

// Grand Prix days (MM-DD) from the real calendars. Most are Sundays; Las Vegas and Baku 2026 race on a Saturday.
// Later seasons move each race to the same weekend of their year (see raceDate in app.js).
const RACE_DATES = {
  2025: { aus: '03-16', chn: '03-23', jpn: '04-06', bhr: '04-13', sau: '04-20', mia: '05-04', emi: '05-18', mon: '05-25', esp: '06-01', can: '06-15', aut: '06-29', gbr: '07-06', bel: '07-27', hun: '08-03', ned: '08-31', ita: '09-07', aze: '09-21', sgp: '10-05', usa: '10-19', mex: '10-26', bra: '11-09', lvg: '11-22', qat: '11-30', abu: '12-07' },
  2026: { aus: '03-08', chn: '03-15', jpn: '03-29', bhr: '04-12', sau: '04-19', mia: '05-03', can: '05-24', mon: '06-07', esp: '06-14', aut: '06-28', gbr: '07-05', bel: '07-19', hun: '07-26', ned: '08-23', ita: '09-06', mad: '09-13', aze: '09-26', sgp: '10-11', usa: '10-25', mex: '11-01', bra: '11-08', lvg: '11-21', qat: '11-29', abu: '12-06' },
};
const SATURDAY_RACES = ['lvg'];

const RACE_POINTS =[25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

const ARCHETYPES = [
  { id: 'prodigy', name: 'The Prodigy', blurb: 'Young, raw speed, expected to be a future champion.' },
  { id: 'veteran', name: 'The Veteran', blurb: 'Experience over everything. Reads races, protects the car.' },
  { id: 'charger', name: 'The Charger', blurb: 'Late brakers, bold moves, never settles for a position.' },
  { id: 'strategist', name: 'The Strategist', blurb: 'Tyre whisperer who wins races from the pit wall.' },
  { id: 'qualifier', name: 'Saturday Specialist', blurb: 'One-lap pace merchant who lives for pole.' },
  { id: 'rain', name: 'Rain Master', blurb: 'Comes alive when the track gets wet.' },
  { id: 'underdog', name: 'The Underdog', blurb: 'Dragging a midfield car to places it should not be.' },
  { id: 'comeback', name: 'The Comeback', blurb: 'Back on the grid with something to prove.' },
];

const PERSONALITIES = [
  { id: 'humble', name: 'Humble', blurb: 'Credits the team, keeps expectations low.' },
  { id: 'confident', name: 'Confident', blurb: 'Backs themselves publicly, every time.' },
  { id: 'outspoken', name: 'Outspoken', blurb: 'Says what they think, headlines follow.' },
  { id: 'diplomatic', name: 'Diplomatic', blurb: 'Media-trained, measured, rarely gives anything away.' },
  { id: 'fiery', name: 'Fiery', blurb: 'Emotional, passionate, occasionally regrets it.' },
];

const GOAL_TYPES = [
  { id: 'champ_pos', label: 'Finish championship in top', unit: 'position', needsTarget: true },
  { id: 'beat_teammate', label: 'Beat teammate in the championship', needsTarget: false },
  { id: 'wins', label: 'Race wins', unit: 'wins', needsTarget: true },
  { id: 'podiums', label: 'Podiums', unit: 'podiums', needsTarget: true },
  { id: 'poles', label: 'Pole positions', unit: 'poles', needsTarget: true },
  { id: 'points', label: 'Championship points', unit: 'points', needsTarget: true },
  { id: 'quali_h2h', label: 'Win qualifying head-to-head vs teammate', needsTarget: false },
  { id: 'constructor_pos', label: 'Team finishes constructors’ championship in top', unit: 'position', needsTarget: true },
  { id: 'custom', label: 'Custom goal', needsTarget: false },
];

const OUTLETS = ['Grid Line Weekly', 'The Apex Report', 'Paddock Pass', 'Pit Lane Radio', 'Motorsport Daily', 'Chequered Times', 'Slipstream Magazine', 'The Paddock Club'];

// App themes. accent drives buttons/highlights, accent2 the stripes, base the background the panels are lifted from.
const THEMES = {
  classic: { name: 'Pitwall classic', accent: '#E10600', accent2: '#FFFFFF', base: null },
  mclaren: { name: 'McLaren', accent: '#FF8000', accent2: '#47C7FC', base: '#120E0B' },
  ferrari: { name: 'Ferrari', accent: '#E8002D', accent2: '#FFEB00', base: '#140A0C' },
  redbull: { name: 'Red Bull Racing', accent: '#3671C6', accent2: '#FFCC00', base: '#0A0E1C' },
  mercedes: { name: 'Mercedes', accent: '#27F4D2', accent2: '#C7CED9', base: '#091212' },
  aston: { name: 'Aston Martin', accent: '#229971', accent2: '#CEDC00', base: '#08120E' },
  alpine: { name: 'Alpine', accent: '#FF87BC', accent2: '#2173B8', base: '#0B0E1A' },
  williams: { name: 'Williams', accent: '#64C4FF', accent2: '#1E5BC6', base: '#08101C' },
  rb: { name: 'Racing Bulls', accent: '#6692FF', accent2: '#FFFFFF', base: '#0C0F1D' },
  haas: { name: 'Haas', accent: '#B6BABD', accent2: '#E6002B', base: '#101113' },
  sauber: { name: 'Kick Sauber', accent: '#52E252', accent2: '#FFFFFF', base: '#09110A' },
  apxgp: { name: 'APXGP', accent: '#D4A72C', accent2: '#FFFFFF', base: '#110F0A' },
  audi: { name: 'Audi', accent: '#F50537', accent2: '#C0C0C0', base: '#121112' },
  cadillac: { name: 'Cadillac', accent: '#E9E4D8', accent2: '#B8A26A', base: '#0F1011' },
};

// My Team
const ENGINES = ['Mercedes', 'Ferrari', 'Honda RBPT', 'Renault'];
const DEPARTMENTS = [
  { id: 'aero', name: 'Aerodynamics' },
  { id: 'chassis', name: 'Chassis' },
  { id: 'powertrain', name: 'Powertrain' },
  { id: 'durability', name: 'Durability' },
];
const LEDGER_CATS = ['Sponsorship', 'Prize money', 'Race bonus', 'R&D', 'Facilities', 'Staff', 'Driver salary', 'Penalty', 'Other'];
const SPONSOR_TIERS = ['Title', 'Primary', 'Secondary', 'Technical'];

window.F1DATA = { DRIVERS, GRID_2025, GRID_2026, NUMBERS_2026, CAL_2025, CAL_2026, RACE_DATES, SATURDAY_RACES, RACE_POINTS, SPRINT_POINTS, ARCHETYPES, PERSONALITIES, GOAL_TYPES, OUTLETS, THEMES, ENGINES, DEPARTMENTS, LEDGER_CATS, SPONSOR_TIERS };

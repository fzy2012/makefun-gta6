// Solmar Heat — every tuning number in one place.
// The city is a fixed 3200x3200 world; the renderer shows a 1280x720 window of it
// through a camera that follows the player.

export const STEP = 1 / 60; // fixed simulation step, seconds

export const WORLD = {
  size: 3200,
  roadGap: 400, // distance between road centrelines
  roadWidth: 96,
  sidewalk: 16,
  firstRoad: 200, // centreline of the first road
  beachY: 2960, // south strip: sand, then water
  waterY: 3080,
  harbourY: 120, // north strip: docks and water
};

export const PLAYER = {
  walkSpeed: 175,
  radius: 13,
  health: 100,
  punchRange: 30,
  punchDamage: 12,
  punchCooldown: 0.35,
  gunRange: 420,
  gunDamage: 34,
  gunCooldown: 0.22,
  startAmmo: 24,
  maxAmmo: 120,
};

export const CAR = {
  length: 48,
  width: 24,
  radius: 24,
  accel: 340,
  brake: 520,
  reverseAccel: 200,
  maxSpeed: 430,
  maxReverse: 140,
  turnRate: 2.6, // radians per second at full lock, scaled by speed
  grip: 0.92, // lateral velocity kept per step (arcade drift)
  trafficSpeed: 150,
  policeSpeed: 470,
  stealTime: 0.0, // stealing is instant on E, the risk is the wanted star
};

export const WANTED = {
  max: 5,
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 2,
  decaySeconds: 18, // quiet seconds before one star drops
  bustSeconds: 1.6, // a cop holding the player this long busts them
  fineShare: 0.2, // cash lost when busted or wasted
};

export const MISSIONS = {
  reward: [200, 400, 600, 500, 1000],
};

export const SAVE_KEY = 'solmar-heat.save.v1';

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#74a253',
  sand: '#e8d29a',
  water: '#2f9db8',
  waterDeep: '#1f7f9e',
  road: '#3c414d',
  roadEdge: '#565d6d',
  lane: '#e8e3c8',
  sidewalk: '#b9b3a4',
  park: '#5d9b4a',
  buildingRoof: ['#c96f4a', '#d9a05b', '#b85c5c', '#7d8ba0', '#a08b62', '#8fa98f', '#c98d5f', '#6f7f95'],
  buildingEdge: '#00000033',
  player: '#ffd23e',
  playerCar: '#e8452c',
  police: '#e8e8e8',
  policeLight: '#ff3b30',
  policeLight2: '#2f7bff',
  pedShirt: ['#e86a6a', '#6a9fe8', '#e8c86a', '#7fd08a', '#c97fd0', '#e8e8e8'],
  text: '#f4f1e6',
  muted: '#c9c2ae',
  hudBg: 'rgba(12, 16, 24, 0.72)',
  hudLine: 'rgba(244, 241, 230, 0.25)',
  star: '#ffd23e',
  starEmpty: 'rgba(244, 241, 230, 0.35)',
  cash: '#7fe08a',
  danger: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

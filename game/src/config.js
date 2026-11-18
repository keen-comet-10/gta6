// config.js — one place for the tuning of Solmaris: world size, physics, heat, palette.
// Everything else imports from here so the game's feel can be adjusted in one pass.

export const VIEW_W = 1280;
export const VIEW_H = 720;

// The city is a square grid of avenues and streets. pitch is the distance between
// road centrelines; road is the asphalt width; the rest of each block is pavement
// and buildings. The harbour takes the east edge.
export const CITY = {
  size: 3600,
  pitch: 300,
  road: 92,
  waterX: 3180, // east of this line is harbour water, cut by piers
};

export const PLAYER = {
  walkSpeed: 138,
  runSpeed: 238,
  radius: 13,
  health: 100,
  punchRange: 40,
  punchHeat: 34,
};

export const CAR = {
  radius: 17,
  accel: 265,
  brake: 420,
  reverse: 120,
  drag: 0.55,
  gripTurn: 2.45, // rad/s at full lock, scaled by speed
  wreckHealth: 100,
};

export const HEAT = {
  max: 500,
  perStar: 100,
  pedKill: 90,
  pedHit: 45,
  carWreck: 55,
  carRam: 16,
  policeRam: 30,
  decayPerSec: 3.2, // only while no cop has eyes on the player
  decayHiddenBonus: 6,
};

export const POLICE = {
  maxCars: 6,
  sightRange: 760,
  bustRange: 105,
  bustFillPerSec: 0.42,
  bustDrainPerSec: 0.8,
};

// Dusk over Solmaris: deep violet shadows, hot neon. Buildings pick from NEON.
export const PALETTE = {
  sky: '#1b1035',
  pavement: '#2c2f45',
  pavementEdge: '#3a3e5c',
  road: '#22222f',
  roadLine: '#8f8fb0',
  crosswalk: '#c9c9de',
  sand: '#8a6f4d',
  water: '#123a5e',
  waterGlow: '#1d5f8a',
  grass: '#274a38',
};

export const NEON = ['#ff2e88', '#22d3ee', '#ffb02e', '#7c5cff', '#3dff9e', '#ff5c39', '#4dc9ff', '#ff3df0'];

export const CAR_COLORS = ['#d94f30', '#3f7fbf', '#c9a227', '#4caf7d', '#8e5cc9', '#bfbfc9', '#37505e', '#e0e0e8', '#a02c4f', '#2e8f86'];

export const DISTRICTS = [
  { name: 'Velvet Row', x: 450, y: 450 },
  { name: 'The Docks', x: 3050, y: 900 },
  { name: 'Palm Heights', x: 450, y: 1650 },
  { name: 'Mercado Nuevo', x: 1650, y: 450 },
  { name: 'Centro Solmaris', x: 1650, y: 1650 },
  { name: 'Bahia Flats', x: 450, y: 2850 },
  { name: 'Portside', x: 2850, y: 2250 },
  { name: 'Old Cannery', x: 1650, y: 2850 },
];

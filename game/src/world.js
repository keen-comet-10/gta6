// world.js — builds Solmaris: a grid of avenues and streets, neon-fronted blocks,
// parks, parking lots and a harbour with piers on the east edge. Also answers the
// spatial questions every other system asks: collision, water, roads, districts.

import { CITY, NEON, DISTRICTS } from './config.js';
import { clamp } from './random.js';

// Road centrelines: 150, 450, 750, ... across the city.
export const LINES = [];
for (let c = CITY.pitch / 2; c < CITY.size; c += CITY.pitch) LINES.push(c);

const SIGNS = [
  'VELVET ANCHOR', 'HOTEL BRISA', 'NEON NOODLE', 'BANCO SOL', 'CLUB ECLIPSE',
  'TALLER RUIZ', 'FARMACIA LUZ', 'RADIO SOLMARIS', 'CAFE DUENDE', 'GYM TITAN',
  'LICORES MAR', 'PIER NINE', 'HOTEL CORAL', 'SUSHI LUNA', 'BANCO DEL MAR',
  'CINE ESTRELLA', 'TATTOO SOL', 'BAR LA OLA', 'MERCADO 24H', 'DISCO FARO',
];
const ROOF_TONES = ['#4a4460', '#54455a', '#3e4a5e', '#5c4a3e', '#46455e', '#52405e'];
const WALL_TONES = ['#332e4a', '#3a2f47', '#2e3549', '#40334a', '#35424a', '#413a52'];

export function buildWorld(rng) {
  const buildings = [];
  const parks = [];
  const palms = [];
  const lamps = [];
  const parkingSpots = [];
  const half = CITY.road / 2;

  // Blocks sit between neighbouring centrelines.
  for (let i = 0; i < LINES.length - 1; i++) {
    for (let j = 0; j < LINES.length - 1; j++) {
      const x0 = LINES[i] + half, x1 = LINES[i + 1] - half;
      const y0 = LINES[j] + half, y1 = LINES[j + 1] - half;
      const bw = x1 - x0, bh = y1 - y0;
      const roll = rng.next();

      if (x0 > CITY.waterX - CITY.pitch) {
        // Harbour-front blocks become open dockyard: crates and lamps, no towers.
        for (let k = 0; k < 5; k++) {
          buildings.push(crate(rng, x0 + rng.range(8, bw - 46), y0 + rng.range(8, bh - 30)));
        }
        continue;
      }
      if (roll < 0.14) {
        parks.push({ x: x0, y: y0, w: bw, h: bh });
        for (let k = 0; k < 7; k++) palms.push({ x: x0 + rng.range(16, bw - 16), y: y0 + rng.range(16, bh - 16) });
        continue;
      }
      if (roll < 0.26) {
        // Parking lot: marked bays along both long edges.
        parks.push({ x: x0, y: y0, w: bw, h: bh, lot: true });
        for (let x = x0 + 26; x < x1 - 20; x += 46) {
          parkingSpots.push({ x, y: y0 + 20, angle: Math.PI / 2 });
          parkingSpots.push({ x, y: y1 - 20, angle: -Math.PI / 2 });
        }
        continue;
      }
      // Built block: one tower, or a 2x2 of smaller fronts, with a pavement margin.
      const m = 15;
      const split = rng.chance(0.55);
      const cells = split
        ? [
            { x: x0 + m, y: y0 + m, w: bw / 2 - m - 5, h: bh / 2 - m - 5 },
            { x: x0 + bw / 2 + 5, y: y0 + m, w: bw / 2 - m - 5, h: bh / 2 - m - 5 },
            { x: x0 + m, y: y0 + bh / 2 + 5, w: bw / 2 - m - 5, h: bh / 2 - m - 5 },
            { x: x0 + bw / 2 + 5, y: y0 + bh / 2 + 5, w: bw / 2 - m - 5, h: bh / 2 - m - 5 },
          ]
        : [{ x: x0 + m, y: y0 + m, w: bw - m * 2, h: bh - m * 2 }];
      for (const c of cells) buildings.push(tower(rng, c));
    }
  }

  // Street lamps on intersection corners.
  for (const lx of LINES) for (const ly of LINES) {
    lamps.push({ x: lx - half - 6, y: ly - half - 6 });
    lamps.push({ x: lx + half + 6, y: ly + half + 6 });
  }

  // Piers reach into the harbour from the portside avenue.
  const piers = [750, 1650, 2550].map((y) => ({ x: CITY.waterX - 10, y: y - 42, w: 360, h: 84 }));

  return {
    buildings, parks, palms, lamps, parkingSpots, piers,
    club: { x: 450, y: 380 },          // The Velvet Anchor, Velvet Row
    safehouse: { x: 450, y: 2580 },    // Bahia Flats lockup
    dockPoint: { x: CITY.waterX + 265, y: 1650 },
    market: { x: 1650, y: 380 },
  };
}

function tower(rng, c) {
  return {
    ...c,
    wall: rng.pick(WALL_TONES),
    roof: rng.pick(ROOF_TONES),
    neon: rng.pick(NEON),
    sign: rng.chance(0.62) ? rng.pick(SIGNS) : null,
    floors: rng.int(3, 9),
    seed: rng.int(1, 99999),
  };
}

function crate(rng, x, y) {
  return {
    x, y, w: rng.range(30, 44), h: rng.range(20, 28),
    wall: '#4d4436', roof: '#5d5340', neon: null, sign: null, floors: 1, seed: rng.int(1, 9999),
  };
}

// Push a circle (entity position object with x/y) out of every building it
// overlaps. Returns true when it hit something, so cars can take damage.
export function collideCircle(world, p, r) {
  let hit = false;
  for (const b of world.buildings) {
    const nx = clamp(p.x, b.x, b.x + b.w), ny = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - nx, dy = p.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r; p.y = ny + (dy / d) * r;
    } else {
      // Centre inside the box: leave by the shallowest side.
      const left = p.x - b.x, right = b.x + b.w - p.x, top = p.y - b.y, bot = b.y + b.h - p.y;
      const min = Math.min(left, right, top, bot);
      if (min === left) p.x = b.x - r; else if (min === right) p.x = b.x + b.w + r;
      else if (min === top) p.y = b.y - r; else p.y = b.y + b.h + r;
    }
  }
  p.x = clamp(p.x, r, CITY.size - r);
  p.y = clamp(p.y, r, CITY.size - r);
  return hit;
}

export function onPier(world, x, y) {
  return world.piers.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

export function inWater(world, x, y) {
  return x > CITY.waterX && !onPier(world, x, y);
}

// Roads are the bands around centrelines; piers count as drivable deck.
export function onRoad(world, x, y) {
  if (onPier(world, x, y)) return true;
  const half = CITY.road / 2 + 4;
  for (const c of LINES) {
    if (Math.abs(x - c) < half || Math.abs(y - c) < half) return true;
  }
  return false;
}

export function districtAt(x, y) {
  let best = DISTRICTS[0], bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best.name;
}

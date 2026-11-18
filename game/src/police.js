// police.js — Solmaris PD. Maintains a pursuit fleet sized by the wanted level,
// steers each unit at the player's predicted position, and reports how much
// pressure the player is under (for the bust meter and the siren mix).

import { POLICE, HEAT } from './config.js';
import { clamp, angleDelta } from './random.js';
import { LINES } from './world.js';
import { makeCar, driveCar } from './vehicles.js';

export function starsFor(heat) {
  return heat <= 0 ? 0 : Math.min(5, Math.ceil(heat / HEAT.perStar));
}

function spawnPoint(rng, player) {
  // On a road, off-screen but not far: pick a centreline point in a ring.
  for (let tries = 0; tries < 12; tries++) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(LINES);
    const along = (vertical ? player.y : player.x) + rng.range(-640, 640) * rng.sign();
    const x = vertical ? line : clamp(along, 80, 3520);
    const y = vertical ? clamp(along, 80, 3520) : line;
    const d = Math.hypot(x - player.x, y - player.y);
    if (d > 430 && d < 900) return { x, y };
  }
  return { x: player.x + 520, y: player.y };
}

// Keep the fleet matched to the wanted level. Returns the live cop list.
export function maintainPolice(world, cops, rng, heat, playerPos, now) {
  const want = heat <= 0 ? 0 : Math.min(POLICE.maxCars, starsFor(heat) + 1);
  // Retire units that are wrecked, drowned or left far behind.
  for (let i = cops.length - 1; i >= 0; i--) {
    const c = cops[i];
    const far = Math.hypot(c.x - playerPos.x, c.y - playerPos.y) > 1150;
    if ((c.wrecked && now - (c.wreckAt ?? now) > 4) || (far && want < cops.length)) {
      cops.splice(i, 1);
    }
    if (c.wrecked && c.wreckAt === undefined) c.wreckAt = now;
  }
  while (cops.length < want) {
    const s = spawnPoint(rng, playerPos);
    const cop = makeCar(s.x, s.y, Math.atan2(playerPos.y - s.y, playerPos.x - s.x), '#e8e8f0', 'police');
    cop.driver = 'cop';
    cop.cruise = 305;
    cops.push(cop);
  }
  return cops;
}

// Chase steering for one unit. Cops aim ahead of a moving target, hang back a
// touch when alongside, and back out when wedged against the city.
export function updatePolice(world, cops, dt, target) {
  let nearest = Infinity;
  let seeing = false;
  for (const cop of cops) {
    if (cop.wrecked) continue;
    const d = Math.hypot(target.x - cop.x, target.y - cop.y);
    nearest = Math.min(nearest, d);
    if (d < POLICE.sightRange) seeing = true;

    const lead = clamp(d / 300, 0, 1) * 0.55;
    const aimX = target.x + (target.vx || 0) * lead;
    const aimY = target.y + (target.vy || 0) * lead;
    const desired = Math.atan2(aimY - cop.y, aimX - cop.x);
    const steer = clamp(angleDelta(cop.angle, desired) * 2.6, -1, 1);

    // Stuck detection: throttle on, barely moving — reverse and re-aim.
    if (Math.abs(cop.speed) < 14) cop.stuckAt = (cop.stuckAt || 0) + dt; else cop.stuckAt = 0;
    let throttle;
    if (cop.stuckAt > 0.85) {
      throttle = -1;
      cop.stuckAt = -0.7; // brief reverse window (negative timer counts back up)
    } else {
      const slowForTurn = Math.abs(steer) > 0.75 && d < 130;
      throttle = slowForTurn ? 0.25 : 1;
      // Don't plough through the player at full tilt from point blank.
      if (d < 52 && Math.abs(cop.speed) > 120) throttle = -0.7;
    }
    driveCar(world, cop, dt, { throttle, steer });
  }
  return { nearest, seeing };
}

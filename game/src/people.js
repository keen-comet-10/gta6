// people.js — the player on foot and Solmaris' pedestrians. Peds stroll the
// pavements, flee from danger and go down when hit; the player walks, runs,
// punches and takes damage here. Cars and police live in their own modules.

import { PLAYER, CITY } from './config.js';
import { clamp } from './random.js';
import { collideCircle, inWater } from './world.js';

const PED_COLORS = ['#e8b04b', '#4bb0e8', '#e84b7a', '#7ae84b', '#e8e4da', '#9b4be8', '#4be8c8', '#e87a4b'];

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speedNow: 0, health: PLAYER.health,
    car: null, punchCd: 0, hurtFlash: 0, stepPhase: 0,
  };
}

export function makePed(x, y, rng) {
  return {
    x, y, angle: rng.range(0, Math.PI * 2), state: 'walk',
    tx: x, ty: y, wait: 0, fleeAt: 0, downAt: 0,
    shirt: rng.pick(PED_COLORS), skin: rng.pick(['#f2c79b', '#c68850', '#8a5a33', '#f7d7b0', '#6e4525']),
    speed: rng.range(34, 62),
  };
}

function pointInBuilding(world, x, y, pad = 6) {
  for (const b of world.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  return false;
}

export function spawnPeds(world, rng, count) {
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard++ < count * 40) {
    const x = rng.range(90, CITY.size - 90), y = rng.range(90, CITY.size - 90);
    if (pointInBuilding(world, x, y) || inWater(world, x, y)) continue;
    peds.push(makePed(x, y, rng));
  }
  return peds;
}

function pickStrollTarget(world, ped, rng) {
  for (let tries = 0; tries < 8; tries++) {
    const x = ped.x + rng.range(-280, 280), y = ped.y + rng.range(-280, 280);
    if (x < 30 || y < 30 || x > CITY.size - 30 || y > CITY.size - 30) continue;
    if (pointInBuilding(world, x, y) || inWater(world, x, y)) continue;
    ped.tx = x; ped.ty = y;
    return;
  }
  ped.wait = 1.2;
}

// threats: [{x, y, radius}] — fast cars, a swinging fist, a police presence.
export function updatePeds(world, peds, dt, rng, threats, now) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      if (now - ped.downAt > 7) { ped.state = 'walk'; pickStrollTarget(world, ped, rng); }
      continue;
    }
    let fleeing = false;
    for (const t of threats) {
      const d2 = (ped.x - t.x) ** 2 + (ped.y - t.y) ** 2;
      if (d2 < t.radius * t.radius) {
        ped.angle = Math.atan2(ped.y - t.y, ped.x - t.x);
        ped.state = 'flee'; ped.fleeAt = now;
        fleeing = true;
        break;
      }
    }
    if (ped.state === 'flee' && now - ped.fleeAt > 1.6 && !fleeing) {
      ped.state = 'walk'; pickStrollTarget(world, ped, rng);
    }
    if (ped.state === 'walk') {
      if (ped.wait > 0) { ped.wait -= dt; continue; }
      const dx = ped.tx - ped.x, dy = ped.ty - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) { ped.wait = rng.range(0.4, 2.6); pickStrollTarget(world, ped, rng); continue; }
      ped.angle = Math.atan2(dy, dx);
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
    } else { // flee
      ped.x += Math.cos(ped.angle) * 172 * dt;
      ped.y += Math.sin(ped.angle) * 172 * dt;
    }
    collideCircle(world, ped, 10);
    if (inWater(world, ped.x, ped.y)) { ped.x -= Math.cos(ped.angle) * 60 * dt; ped.state = 'walk'; }
  }
}

// WASD/arrows movement with building collision. Returns the speed travelled.
export function updatePlayerOnFoot(world, p, dt, axes, running) {
  const mag = Math.hypot(axes.x, axes.y);
  if (mag > 0.01) {
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const nx = axes.x / mag, ny = axes.y / mag;
    p.angle = Math.atan2(ny, nx);
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.speedNow = speed;
    p.stepPhase += dt * (running ? 11 : 8);
  } else {
    p.speedNow = 0;
  }
  collideCircle(world, p, PLAYER.radius);
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.hurtCd > 0) p.hurtCd -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  return p.speedNow;
}

export function hurtPlayer(p, amount) {
  p.health = clamp(p.health - amount, 0, PLAYER.health);
  p.hurtFlash = 0.35;
  return p.health <= 0;
}

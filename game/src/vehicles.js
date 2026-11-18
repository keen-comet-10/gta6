// vehicles.js — every car in Solmaris: one arcade physics step shared by the
// player, traffic and police, a lane-following traffic driver, and the spawner
// that fills the streets and parking lots.

import { CAR, CITY, CAR_COLORS } from './config.js';
import { clamp, angleDelta } from './random.js';
import { LINES, collideCircle } from './world.js';

let nextId = 1;

export function makeCar(x, y, angle, color, kind = 'civil') {
  return {
    id: nextId++, x, y, angle, speed: 0, steerVis: 0,
    color, kind, health: CAR.wreckHealth, wrecked: false,
    driver: 'none', // 'ai' | 'player' | 'parked'
    route: null, cruise: 0, honkAt: 0, smokeAt: 0,
  };
}

// Right-hand lane offset for a heading: the lane centre is centreline + right*off.
function lanePoint(axis, line, along, dir) {
  // axis 'v': travelling along y on avenue x=line; axis 'h': along x on street y=line.
  const off = 21;
  if (axis === 'v') return { x: line + (dir > 0 ? -off : off), y: along };
  return { x: along, y: line + (dir > 0 ? off : -off) };
}

function newRoute(rng, x, y) {
  const axis = rng.chance(0.5) ? 'v' : 'h';
  const line = LINES.reduce((a, b) => (Math.abs(b - (axis === 'v' ? x : y)) < Math.abs(a - (axis === 'v' ? x : y)) ? b : a), LINES[0]);
  return { axis, line, dir: rng.sign() };
}

export function spawnTraffic(world, rng, playerPos) {
  const cars = [];
  // Moving traffic on the grid, kept away from the player's start.
  for (let i = 0; i < 26; i++) {
    const route = newRoute(rng, rng.range(200, 3400), rng.range(200, 3400));
    const along = rng.range(120, CITY.size - 120);
    const p = lanePoint(route.axis, route.line, along, route.dir);
    if ((p.x - playerPos.x) ** 2 + (p.y - playerPos.y) ** 2 < 320 ** 2) continue;
    const car = makeCar(p.x, p.y, route.axis === 'v' ? (route.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (route.dir > 0 ? 0 : Math.PI), rng.pick(CAR_COLORS), rng.chance(0.14) ? 'taxi' : 'civil');
    car.driver = 'ai';
    car.route = route;
    car.cruise = rng.range(120, 185);
    cars.push(car);
  }
  // Parked cars in the lots, ready to steal.
  const spots = [...world.parkingSpots];
  for (let i = 0; i < 16 && spots.length; i++) {
    const s = spots.splice(rng.int(0, spots.length - 1), 1)[0];
    const car = makeCar(s.x, s.y, s.angle, rng.pick(CAR_COLORS));
    car.driver = 'parked';
    cars.push(car);
  }
  return cars;
}

// One physics step. control: {throttle -1..1, steer -1..1, handbrake}.
// Returns the impact speed when the car struck the city, else 0.
export function driveCar(world, car, dt, control) {
  if (car.wrecked) { car.speed = 0; return 0; }
  const throttle = clamp(control.throttle || 0, -1, 1);
  const steer = clamp(control.steer || 0, -1, 1);
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    car.speed += (car.speed > 12 ? -CAR.brake : -CAR.reverse * 0.9) * -throttle * dt * (car.speed > 12 ? 1 : 1);
    if (car.speed > 12) car.speed -= CAR.brake * -throttle * dt * 0; // braking handled above
  }
  car.speed -= car.speed * CAR.drag * dt;
  if (!throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -95, 335);
  if (control.handbrake) car.speed -= car.speed * 2.4 * dt;

  const speedRatio = clamp(car.speed / 130, -1, 1);
  car.angle += steer * CAR.gripTurn * speedRatio * dt * (control.handbrake ? 1.5 : 1);
  car.steerVis = steer;

  const before = car.speed;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (collideCircle(world, car, CAR.radius)) {
    const impact = Math.abs(before);
    if (impact > 60) {
      car.health -= (impact - 60) * 0.22;
      car.speed = -before * 0.22;
      if (car.health <= 0) { car.health = 0; car.wrecked = true; }
      return impact;
    }
    car.speed *= 0.4;
  }
  return 0;
}

// Lane-following traffic. Cars cruise their avenue or street, brake for the car
// ahead, and turn at intersections often enough to feel alive.
export function updateTraffic(world, cars, dt, rng) {
  for (const car of cars) {
    if (car.driver !== 'ai' || car.wrecked) continue;
    const r = car.route;
    const along = r.axis === 'v' ? car.y : car.x;
    const ahead = lanePoint(r.axis, r.line, along + r.dir * 340, r.dir);
    // Brake for anything solid ahead.
    let want = car.cruise;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
      if (forward > 0 && forward < 74 && Math.abs(side) < 26) want = Math.min(want, Math.max(0, (forward - 40) * 2.2));
    }
    // Near the next intersection, sometimes turn onto the crossing road.
    const nextJunction = LINES.find((c) => (r.dir > 0 ? c > along + 30 : c < along - 30));
    if (nextJunction !== undefined && Math.abs(nextJunction - along) < 46 && rng.chance(dt * 0.9)) {
      r.axis = r.axis === 'v' ? 'h' : 'v';
      r.line = nextJunction;
      r.dir = rng.sign();
    }
    const desired = Math.atan2(ahead.y - car.y, ahead.x - car.x);
    const steer = clamp(angleDelta(car.angle, desired) * 2.4, -1, 1);
    const throttle = car.speed < want ? 0.75 : car.speed > want + 24 ? -0.6 : 0;
    driveCar(world, car, dt, { throttle, steer });
  }
}

// Pairwise car contact: shove apart, trade speed, report the hardest hit so the
// game can score rams, wrecks and heat. cb(a, b, force) fires on real impacts.
export function collideCars(cars, cb) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy, min = CAR.radius * 2 - 4;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
      if (rel > 55) {
        const dmg = (rel - 55) * 0.16;
        a.health -= dmg; b.health -= dmg;
        for (const c of [a, b]) if (c.health <= 0 && !c.wrecked) { c.health = 0; c.wrecked = true; }
        a.speed *= 0.55; b.speed *= 0.55;
        cb && cb(a, b, rel);
      }
    }
  }
}

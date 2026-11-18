// game.js — Neon Harbor: Solmaris Heat. Owns the state and the loop: builds the
// city and its crowd, feeds input to the player on foot or behind a wheel, runs
// traffic, police, heat, missions, busts and paydays, and hands the frame to
// render.js and hud.js. Every other module is a system; this one is the game.

import { VIEW_W, VIEW_H, CITY, HEAT, POLICE, PLAYER } from './config.js';
import { makeRng, clamp } from './random.js';
import { initInput, down, hit, moveAxes, endFrame, pointer } from './input.js';
import { initAudio, updateAudio, toggleMute, sfx } from './audio.js';
import { buildWorld, districtAt } from './world.js';
import { spawnTraffic, driveCar, updateTraffic, collideCars, recycleTraffic } from './vehicles.js';
import { makePlayer, spawnPeds, updatePeds, updatePlayerOnFoot, hurtPlayer } from './people.js';
import { maintainPolice, updatePolice, starsFor } from './police.js';
import { MissionDirector } from './missions.js';
import { makeCamera, updateCamera, drawWorld } from './render.js';
import { drawHud, drawTitle, drawPause, drawEndScreen } from './hud.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const rng = makeRng(seed * 7919 + 13);

const SAVE_KEY = 'solmaris-heat-save-v1';

const G = {
  state: 'title',
  now: 0,
  rng,
  world: buildWorld(rng),
  camera: makeCamera(),
  player: makePlayer(470, 560),
  cars: [],
  cops: [],
  peds: [],
  pickups: [],
  particles: [],
  cash: 120,
  heat: 0,
  stars: 0,
  bust: 0,
  crimeAt: -99,
  banner: null,
  prompt: null,
  progress: null,
  muted: false,
  saveData: loadSave(),
  director: null,
  hooks: null,
};
G.cars = spawnTraffic(G.world, rng, G.player);
G.peds = spawnPeds(G.world, rng, 46);
G.director = new MissionDirector(G.world);

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || { bestCash: 0, missionsDone: 0 };
  } catch { return { bestCash: 0, missionsDone: 0 }; }
}

function saveGame() {
  G.saveData.bestCash = Math.max(G.saveData.bestCash, G.cash);
  G.saveData.missionsDone = Math.max(G.saveData.missionsDone, G.director.index + (G.director.storyDone ? 0 : 0));
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.saveData)); } catch { /* private mode */ }
}

// The context object the mission director drives the game through.
G.hooks = {
  rng,
  playerPos: () => G.player,
  playerSpeed: () => (G.player.car ? Math.abs(G.player.car.speed) : G.player.speedNow),
  playerInCar: () => !!G.player.car,
  get heat() { return G.heat; },
  setHeat: (n) => setHeat(n),
  addCash: (n) => { G.cash += n; },
  banner: (title, sub) => showBanner(title, sub),
  sfxMission: () => sfx.mission(),
  sfxFail: () => sfx.fail(),
  sfxPickup: () => sfx.pickup(),
  sfxCash: () => sfx.cash(),
  setProgress: (frac, label) => { G.progress = { frac, label }; },
  roadsidePoints: () => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const line = rng.pick([450, 750, 1050, 1350, 1650, 1950, 2250, 2550, 2850]);
      const along = rng.range(200, CITY.size - 200);
      pts.push(rng.chance(0.5) ? { x: line + 58, y: along } : { x: along, y: line + 58 });
    }
    return pts;
  },
  onStoryComplete: () => showBanner('Story complete', 'Marlo raises a glass: "Solmaris runs on you now, kid." Free roam — the fares never stop.'),
  save: () => saveGame(),
};
G.setHeat = setHeat;

function showBanner(title, sub) {
  G.banner = { title, sub, from: G.now, until: G.now + 4.6 };
}

function setHeat(n) {
  const before = G.stars;
  G.heat = clamp(n, 0, HEAT.max);
  G.stars = starsFor(G.heat);
  if (G.stars > before) { sfx.star(); G.crimeAt = G.now; }
}

function addHeat(n) {
  if (n > 0) G.crimeAt = G.now;
  setHeat(G.heat + n);
}

function burst(x, y, color, n, speed = 130, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), v = rng.range(speed * 0.3, speed);
    G.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
      life: rng.range(0.3, 0.8), maxLife: 0.8, color, size: rng.range(2, size + 2),
    });
  }
}

// --- Player actions ----------------------------------------------------------

function nearestCar(maxD) {
  let best = null, bd = maxD * maxD;
  for (const car of [...G.cars, ...G.cops]) {
    if (car.wrecked) continue;
    const d = (car.x - G.player.x) ** 2 + (car.y - G.player.y) ** 2;
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  if (car.driver === 'cop') addHeat(24); // stealing a PD unit is a statement
  car.driver = 'player';
  if (!G.cars.includes(car)) { G.cops.splice(G.cops.indexOf(car), 1); G.cars.push(car); }
  G.player.car = car;
  sfx.door();
}

function exitCar() {
  const car = G.player.car;
  car.driver = 'parked';
  car.speed = 0;
  G.player.car = null;
  G.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
  G.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
  sfx.door();
}

function punch() {
  const p = G.player;
  if (p.punchCd > 0) return;
  p.punchCd = 0.38;
  p.punchT = 0.22;
  sfx.punch();
  const fx = p.x + Math.cos(p.angle) * (PLAYER.punchRange - 6);
  const fy = p.y + Math.sin(p.angle) * (PLAYER.punchRange - 6);
  for (const ped of G.peds) {
    if (ped.state !== 'down' && (ped.x - fx) ** 2 + (ped.y - fy) ** 2 < 26 ** 2) {
      ped.state = 'down';
      ped.downAt = G.now;
      addHeat(HEAT.pedHit);
      burst(ped.x, ped.y, '#ffd9ec', 6, 90, 3);
      if (rng.chance(0.45)) G.pickups.push({ x: ped.x + rng.range(-8, 8), y: ped.y + rng.range(-8, 8), amount: rng.int(8, 42) });
      return;
    }
  }
  for (const car of G.cars) {
    if ((car.x - fx) ** 2 + (car.y - fy) ** 2 < 34 ** 2) {
      car.health -= 5;
      burst(fx, fy, '#ffe9a8', 5, 80, 3);
      return;
    }
  }
}

// --- Consequences ------------------------------------------------------------

function endRun(busted) {
  G.state = busted ? 'busted' : 'wasted';
  if (G.director.active) G.director.fail(G.hooks, busted ? 'The PD closed the book on that job.' : 'The job died with you in Santa Brisa.');
  const cut = busted ? Math.round(G.cash * 0.15) : 150;
  G.cash = Math.max(0, G.cash - cut);
  sfx.fail();
  updateAudio(0, {});
}

function respawn() {
  const p = G.player;
  if (p.car) { p.car.driver = 'parked'; p.car = null; }
  p.x = 470; p.y = 560; p.health = PLAYER.health;
  G.cops.length = 0;
  G.bust = 0;
  setHeat(0);
  G.state = 'play';
  showBanner('Back on the street', `The Velvet Anchor, ${districtAt(p.x, p.y)}. Marlo is waiting.`);
}

// --- The frame ---------------------------------------------------------------

function update(dt) {
  G.now += dt;
  const p = G.player;

  if (G.state === 'title') {
    if (hit('Enter') || pointer.clicked) { initAudio(); G.state = 'play'; showBanner('Solmaris Heat', 'Marlo at the Velvet Anchor has work. Follow the gold marker.'); }
    return;
  }
  if (G.state === 'busted' || G.state === 'wasted') {
    if (hit('Enter')) respawn();
    return;
  }
  if (hit('KeyP') || hit('Escape')) { G.state = G.state === 'pause' ? 'play' : 'pause'; return; }
  if (G.state === 'pause') return;

  if (hit('KeyM')) G.muted = toggleMute();
  G.progress = null;
  G.prompt = null;

  // Player, on foot or behind a wheel.
  if (p.car) {
    const axes = moveAxes();
    const impact = driveCar(G.world, p.car, dt, {
      throttle: -axes.y,
      steer: axes.x,
      handbrake: down('Space'),
    });
    p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle;
    if (impact > 90) {
      G.camera.shake = Math.min(14, (impact - 90) * 0.06);
      sfx.crash(impact > 170);
      if (impact > 200) hurtPlayer(p, (impact - 200) * 0.03);
    }
    if (hit('KeyE') && Math.abs(p.car.speed) < 30) exitCar();
  } else {
    const axes = moveAxes();
    updatePlayerOnFoot(G.world, p, dt, axes, down('ShiftLeft') || down('ShiftRight'));
    if (hit('Space') || hit('KeyJ')) punch();
    if (p.punchT > 0) p.punchT -= dt;
    const car = nearestCar(56);
    if (car) {
      G.prompt = car.kind === 'police' ? 'Press E to steal the PD unit' : 'Press E to take this car';
      if (hit('KeyE')) enterCar(car);
    }
    // Job offer at the Anchor.
    const offer = G.director.currentOffer();
    if (offer && G.director.offerCd <= 0) {
      const dClub = Math.hypot(p.x - G.world.club.x, p.y - G.world.club.y);
      if (dClub < 95) {
        G.prompt = `Press F — take "${offer.title}" ($${offer.reward})`;
        if (hit('KeyF')) G.director.accept(G.hooks);
      }
    }
  }

  // The city moves.
  updateTraffic(G.world, G.cars, dt, rng);
  G.recycleAt = (G.recycleAt || 0) + dt;
  if (G.recycleAt > 2.5) { G.recycleAt = 0; recycleTraffic(G.world, G.cars, rng, p); }
  const threats = [];
  for (const car of [...G.cars, ...G.cops]) if (Math.abs(car.speed) > 130) threats.push({ x: car.x, y: car.y, radius: 95 });
  if (p.punchT > 0) threats.push({ x: p.x, y: p.y, radius: 74 });
  updatePeds(G.world, G.peds, dt, rng, threats, G.now);

  // Cars meet cars; the player's rams have consequences.
  const wreckedBefore = new Set([...G.cars, ...G.cops].filter((c) => c.wrecked).map((c) => c.id));
  collideCars([...G.cars, ...G.cops], (a, b, force) => {
    const playerInvolved = a === p.car || b === p.car;
    burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffe9a8', 7, 150, 4);
    if (playerInvolved) {
      const other = a === p.car ? b : a;
      sfx.crash(force > 150);
      G.camera.shake = Math.min(12, force * 0.045);
      // Heat and wreck credit belong to the aggressor: a cop or a commuter
      // rear-ending a stationary player is their crime, not the player's.
      if (Math.abs(p.car.speed) > 60) {
        other.lastHitBy = 'player';
        other.lastHitAt = G.now;
        addHeat(other.kind === 'police' ? HEAT.policeRam : HEAT.carRam);
        if (other.kind === 'police' && force > 150) hurtPlayer(p, 3);
      }
    }
  });
  for (const car of G.cars) {
    if (car.wrecked && !wreckedBefore.has(car.id) && car.lastHitBy === 'player' && G.now - (car.lastHitAt || -9) < 4) {
      car.countedWreck = true;
      addHeat(HEAT.carWreck);
      G.director.onPlayerWreck();
      showBanner('Wrecked', 'One of the rival crew is off the road.');
    }
  }

  // Cars meet people.
  for (const car of [...G.cars, ...G.cops]) {
    if (Math.abs(car.speed) < 46) continue;
    for (const ped of G.peds) {
      if (ped.state === 'down') continue;
      if ((ped.x - car.x) ** 2 + (ped.y - car.y) ** 2 < 27 ** 2) {
        ped.state = 'down'; ped.downAt = G.now;
        burst(ped.x, ped.y, '#ff8899', 8, 110, 3);
        if (car === p.car) { addHeat(HEAT.pedKill); sfx.crash(false); }
      }
    }
    if (!p.car && (p.hurtCd || 0) <= 0 && (p.x - car.x) ** 2 + (p.y - car.y) ** 2 < 27 ** 2) {
      // One hit per pass, capped: a car clips the player and throws them clear
      // rather than grinding through their whole health bar in one contact.
      const dmg = Math.min(16, Math.abs(car.speed) * 0.1);
      p.hurtCd = 0.9;
      if (hurtPlayer(p, dmg)) return endRun(false);
      p.x += Math.cos(car.angle) * 26; p.y += Math.sin(car.angle) * 26;
      G.camera.shake = 9;
      sfx.crash(true);
    }
  }

  // Police, heat, bust.
  maintainPolice(G.world, G.cops, rng, G.heat, p, G.now);
  const target = { x: p.x, y: p.y, vx: p.car ? Math.cos(p.car.angle) * p.car.speed : 0, vy: p.car ? Math.sin(p.car.angle) * p.car.speed : 0, onFoot: !p.car };
  const pressure = updatePolice(G.world, G.cops, dt, target, G.heat <= 0);
  const playerSpeed = p.car ? Math.abs(p.car.speed) : p.speedNow;
  if (G.stars > 0 && pressure.nearest < POLICE.bustRange && playerSpeed < 34) {
    G.bust += POLICE.bustFillPerSec * dt;
    if (G.bust >= 1) return endRun(true);
  } else {
    G.bust = Math.max(0, G.bust - POLICE.bustDrainPerSec * dt);
  }
  if (!pressure.seeing && G.now - G.crimeAt > 4) addHeat(-HEAT.decayPerSec * dt - (pressure.nearest > 500 ? HEAT.decayHiddenBonus * dt : 0));
  else if (G.now - G.crimeAt > 14) addHeat(-HEAT.decayPerSec * dt * 0.5);

  // Missions and money.
  G.director.update(dt, G.hooks);
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    const rr = p.car ? 34 : 24;
    if ((pk.x - p.x) ** 2 + (pk.y - p.y) ** 2 < rr * rr) {
      G.cash += pk.amount;
      sfx.cash();
      burst(pk.x, pk.y, '#3dff9e', 6, 80, 3);
      G.pickups.splice(i, 1);
    }
  }

  // Particles.
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) { G.particles.splice(i, 1); continue; }
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vy += 60 * dt;
  }
  // Wreck smoke.
  for (const car of G.cars) {
    if (car.wrecked && rng.chance(dt * 2.2)) {
      G.particles.push({ x: car.x + rng.range(-8, 8), y: car.y - 8, vx: rng.range(-6, 6), vy: -34, life: 1.4, maxLife: 1.4, color: 'rgba(90,90,100,0.5)', size: rng.range(6, 11) });
    }
  }

  updateCamera(G.camera, target, dt);
  const sirenNear = G.cops.length ? clamp(1 - pressure.nearest / 620, 0, 1) : 0;
  updateAudio(dt, { engineSpeed: p.car ? Math.abs(p.car.speed) / 335 : 0, sirenNear });
  if (p.health <= 0) return endRun(false);
}

function draw() {
  ctx.fillStyle = '#1b1035';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (G.state === 'title') { drawTitle(ctx, G); return; }
  drawWorld(ctx, G, G.now);
  drawHud(ctx, G);
  if (G.state === 'pause') drawPause(ctx, G);
  if (G.state === 'busted' || G.state === 'wasted') drawEndScreen(ctx, G);
}

let last = performance.now();
function frame(t) {
  // Clamp both ways: a frame timestamp can predate `last` (it is the vsync
  // time, captured before this script ran), and a negative dt would run every
  // system backwards for a frame — including heat decay, which would ADD heat.
  const dt = Math.max(0, Math.min(0.033, (t - last) / 1000 || 0.016));
  last = t;
  update(dt);
  draw();
  endFrame();
  requestAnimationFrame(frame);
}

initInput(canvas);
stageShot(G, params.get('shot'));
if (params.get('shot')) {
  // Settle the staged scene so captures show a living city, not spawn frame zero.
  for (let i = 0; i < 70; i++) update(1 / 60);
  G.camera.x = G.player.x; G.camera.y = G.player.y;
}
window.__solmaris = G;
requestAnimationFrame(frame);

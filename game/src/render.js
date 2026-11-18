// render.js — everything the player sees of the world: the dusk city, harbour,
// traffic, crowds, police, effects and the minimap. Pure canvas, culled to the
// camera view, deterministic window lights so the city never flickers randomly.

import { CITY, PALETTE, VIEW_W, VIEW_H } from './config.js';
import { clamp } from './random.js';
import { LINES } from './world.js';

export function makeCamera() {
  return { x: 450, y: 450, shake: 0 };
}

export function updateCamera(cam, target, dt) {
  const look = 0.32;
  const tx = target.x + (target.vx || 0) * look;
  const ty = target.y + (target.vy || 0) * look;
  const k = 1 - Math.pow(0.0015, dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.x = clamp(cam.x, VIEW_W / 2 - 200, CITY.size - VIEW_W / 2 + 200);
  cam.y = clamp(cam.y, VIEW_H / 2 - 200, CITY.size - VIEW_H / 2 + 200);
  if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 26);
}

function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function drawWorld(ctx, g, now) {
  const cam = g.camera;
  const shx = cam.shake ? (hash(now * 60) - 0.5) * cam.shake : 0;
  const shy = cam.shake ? (hash(now * 47 + 9) - 0.5) * cam.shake : 0;
  const vx = cam.x - VIEW_W / 2 + shx, vy = cam.y - VIEW_H / 2 + shy;
  const inView = (x, y, w, h) => x + w > vx - 60 && y + h > vy - 60 && x < vx + VIEW_W + 60 && y < vy + VIEW_H + 60;

  ctx.save();
  ctx.translate(-vx, -vy);

  // Base pavement, then parks and lots.
  ctx.fillStyle = PALETTE.pavement;
  ctx.fillRect(vx - 40, vy - 40, VIEW_W + 80, VIEW_H + 80);
  for (const p of g.world.parks) {
    if (!inView(p.x, p.y, p.w, p.h)) continue;
    ctx.fillStyle = p.lot ? '#262838' : PALETTE.grass;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if (p.lot) {
      ctx.strokeStyle = 'rgba(220,220,240,0.35)';
      ctx.lineWidth = 2;
      for (let x = p.x + 8; x < p.x + p.w - 8; x += 46) {
        ctx.strokeRect(x, p.y + 6, 34, 30);
        ctx.strokeRect(x, p.y + p.h - 36, 34, 30);
      }
    }
  }

  drawRoads(ctx, vx, vy);
  drawHarbour(ctx, g, now, inView);

  // Mission beacon: a pillar of gold light with a pulsing ground ring.
  const target = g.director.currentTarget();
  if (target && g.state === 'play') {
    const pulse = 1 + Math.sin(now * 4) * 0.16;
    ctx.fillStyle = 'rgba(255, 190, 40, 0.13)';
    ctx.fillRect(target.x - 13, target.y - 620, 26, 620);
    ctx.strokeStyle = 'rgba(255, 200, 60, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(target.x, target.y, 40 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffbe28';
    ctx.font = 'bold 26px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('▼', target.x, target.y - 52 - Math.sin(now * 4) * 6);
  }

  for (const b of g.world.buildings) if (inView(b.x, b.y, b.w, b.h)) drawBuilding(ctx, b);
  for (const p of g.world.palms) if (inView(p.x - 20, p.y - 20, 40, 40)) drawPalm(ctx, p);

  // Lamp glow: a tight warm pool at each corner, kept faint so it reads as
  // streetlight on asphalt rather than a stain.
  for (const l of g.world.lamps) {
    if (!inView(l.x - 24, l.y - 24, 48, 48)) continue;
    const grad = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 23);
    grad.addColorStop(0, 'rgba(255, 196, 96, 0.20)');
    grad.addColorStop(1, 'rgba(255, 196, 96, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(l.x, l.y, 23, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(l.x - 1.6, l.y - 1.6, 3.2, 3.2);
  }

  for (const pk of g.pickups) drawPickup(ctx, pk, now);
  for (const ped of g.peds) if (inView(ped.x - 16, ped.y - 16, 32, 32)) drawPed(ctx, ped, now);
  // The player's car lives in g.cars like any other, so this loop draws it too.
  for (const car of g.cars) if (inView(car.x - 46, car.y - 46, 92, 92)) drawCar(ctx, car, now, car.kind === 'police');
  for (const cop of g.cops) if (inView(cop.x - 46, cop.y - 46, 92, 92)) drawCar(ctx, cop, now, true);
  if (!g.player.car) drawPlayer(ctx, g.player, now);

  // Particles ride on top: sparks, smoke, cash sparkles.
  for (const pt of g.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRoads(ctx, vx, vy) {
  const half = CITY.road / 2;
  ctx.fillStyle = PALETTE.road;
  for (const c of LINES) {
    if (c + half > vx - 40 && c - half < vx + VIEW_W + 40) ctx.fillRect(c - half, vy - 40, CITY.road, VIEW_H + 80);
    if (c + half > vy - 40 && c - half < vy + VIEW_H + 40) ctx.fillRect(vx - 40, c - half, VIEW_W + 80, CITY.road);
  }
  ctx.strokeStyle = PALETTE.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  for (const c of LINES) {
    if (c > vx - 40 && c < vx + VIEW_W + 40) { ctx.moveTo(c, vy - 40); ctx.lineTo(c, vy + VIEW_H + 80); }
    if (c > vy - 40 && c < vy + VIEW_H + 40) { ctx.moveTo(vx - 40, c); ctx.lineTo(vx + VIEW_W + 80, c); }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // Zebra crossings on all four sides of each visible intersection.
  ctx.fillStyle = PALETTE.crosswalk;
  ctx.globalAlpha = 0.34;
  const halfR = CITY.road / 2;
  for (const cx of LINES) {
    if (cx < vx - 80 || cx > vx + VIEW_W + 80) continue;
    for (const cy of LINES) {
      if (cy < vy - 80 || cy > vy + VIEW_H + 80) continue;
      for (let s = -3; s <= 3; s++) {
        if (s === 0) continue;
        ctx.fillRect(cx + s * 12 - 4, cy - halfR - 13, 8, 9);
        ctx.fillRect(cx + s * 12 - 4, cy + halfR + 4, 8, 9);
        ctx.fillRect(cx - halfR - 13, cy + s * 12 - 4, 9, 8);
        ctx.fillRect(cx + halfR + 4, cy + s * 12 - 4, 9, 8);
      }
    }
  }
  ctx.globalAlpha = 1;
  // Pavement rims.
  ctx.strokeStyle = PALETTE.pavementEdge;
  ctx.lineWidth = 3;
  for (const c of LINES) {
    if (c + half > vx && c - half < vx + VIEW_W) {
      ctx.beginPath(); ctx.moveTo(c - half, vy - 20); ctx.lineTo(c - half, vy + VIEW_H + 20); ctx.moveTo(c + half, vy - 20); ctx.lineTo(c + half, vy + VIEW_H + 20); ctx.stroke();
    }
  }
}

function drawHarbour(ctx, g, now, inView) {
  const w = g.world;
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(CITY.waterX, 0, CITY.size - CITY.waterX + 400, CITY.size);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(CITY.waterX - 26, 0, 26, CITY.size);
  // Slow light shimmer on the water.
  ctx.fillStyle = PALETTE.waterGlow;
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 26; i++) {
    const x = CITY.waterX + 20 + hash(i * 3.7) * 330;
    const y = (hash(i * 9.1) * CITY.size + now * 14) % CITY.size;
    if (inView(x, y, 42, 5)) ctx.fillRect(x, y, 42, 4);
  }
  ctx.globalAlpha = 1;
  for (const p of w.piers) {
    ctx.fillStyle = '#5d4a33';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#6d573d';
    for (let x = p.x + 8; x < p.x + p.w; x += 30) ctx.fillRect(x, p.y + 5, 18, p.h - 10);
  }
  // Moored boats: simple hulls bobbing by the piers.
  for (let i = 0; i < 5; i++) {
    const bx = CITY.waterX + 120 + i * 68, by = 420 + i * 560 + Math.sin(now * 0.9 + i) * 5;
    if (!inView(bx, by, 60, 30)) continue;
    ctx.fillStyle = ['#c94f30', '#e8e4da', '#3f7fbf', '#c9a227', '#4caf7d'][i];
    ctx.beginPath();
    ctx.moveTo(bx - 28, by); ctx.lineTo(bx + 28, by); ctx.lineTo(bx + 18, by + 13); ctx.lineTo(bx - 18, by + 13);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#20303e';
    ctx.fillRect(bx - 9, by - 9, 18, 9);
  }
}

function drawBuilding(ctx, b) {
  // Dusk shadow, wall, roof, lit windows, neon sign on the street edge.
  ctx.fillStyle = 'rgba(8, 6, 20, 0.45)';
  ctx.fillRect(b.x + 9, b.y + 11, b.w, b.h);
  ctx.fillStyle = b.wall;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(b.x + 12, b.y + 12, Math.max(0, b.w - 24), Math.max(0, b.h - 24));

  const cols = Math.max(1, Math.floor((b.w - 18) / 17));
  const rows = Math.max(1, Math.floor((b.h - 18) / 17));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = hash(b.seed + i * 13.7 + j * 7.3);
      if (lit < 0.42) continue;
      ctx.fillStyle = lit > 0.9 ? 'rgba(120, 230, 255, 0.85)' : 'rgba(255, 205, 110, 0.75)';
      ctx.fillRect(b.x + 10 + i * 17, b.y + 10 + j * 17, 8, 10);
    }
  }
  if (b.sign) {
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = b.neon;
    ctx.shadowColor = b.neon;
    ctx.shadowBlur = 9;
    // Shrink the label only when the real measured width overflows the frontage.
    let label = b.sign;
    while (label.length > 3 && ctx.measureText(label).width > b.w - 8) label = label.slice(0, -1);
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h - 7);
    ctx.shadowBlur = 0;
  }
}

function drawPalm(ctx, p) {
  ctx.strokeStyle = '#4d3b28';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 8); ctx.stroke();
  ctx.strokeStyle = '#3f9e5f';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + p.x * 0.01;
    ctx.beginPath();
    ctx.moveTo(p.x + 3, p.y - 8);
    ctx.quadraticCurveTo(p.x + 3 + Math.cos(a) * 11, p.y - 14, p.x + 3 + Math.cos(a) * 17, p.y - 6 + Math.sin(a) * 5);
    ctx.stroke();
  }
}

function drawPickup(ctx, pk, now) {
  const bob = Math.sin(now * 3.4 + pk.x) * 3;
  ctx.fillStyle = 'rgba(61, 255, 158, 0.18)';
  ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3dff9e';
  ctx.font = 'bold 17px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('$', pk.x, pk.y + 6 + bob);
}

export function drawPed(ctx, ped, now) {
  if (ped.state === 'down') {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-11, -5, 22, 10);
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(14, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const stride = Math.sin(now * 9 + ped.x * 0.4) * 3;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(ped.x, ped.y + 6, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#22242f';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(ped.x, ped.y); ctx.lineTo(ped.x + Math.cos(ped.angle + 2.6) * (7 + stride), ped.y + Math.sin(ped.angle + 2.6) * (7 + stride));
  ctx.moveTo(ped.x, ped.y); ctx.lineTo(ped.x + Math.cos(ped.angle - 2.6) * (7 - stride), ped.y + Math.sin(ped.angle - 2.6) * (7 - stride));
  ctx.stroke();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(ped.x, ped.y, 7.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 2.5, ped.y + Math.sin(ped.angle) * 2.5, 4.6, 0, Math.PI * 2); ctx.fill();
}

export function drawPlayer(ctx, p, now) {
  const ped = { x: p.x, y: p.y, angle: p.angle, shirt: '#ff2e88', skin: '#c68850', state: 'walk' };
  drawPed(ctx, ped, now + p.stepPhase * 0.11);
  // A hot-pink ring so the player always reads at a glance.
  ctx.strokeStyle = 'rgba(255, 46, 136, 0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 13.5, 0, Math.PI * 2); ctx.stroke();
  if (p.punchT > 0) {
    ctx.strokeStyle = '#ffd9ec';
    ctx.lineWidth = 4;
    const reach = 15 + (0.22 - p.punchT) * 60;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * reach, p.y + Math.sin(p.angle) * reach);
    ctx.stroke();
  }
  if (p.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255, 40, 60, ${p.hurtFlash * 0.8})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawCar(ctx, car, now, isCop) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Headlight cones on the asphalt ahead.
  if (!car.wrecked) {
    const grad = ctx.createLinearGradient(18, 0, 120, 0);
    grad.addColorStop(0, 'rgba(255, 240, 190, 0.20)');
    grad.addColorStop(1, 'rgba(255, 240, 190, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(18, -9); ctx.lineTo(122, -30); ctx.lineTo(122, 30); ctx.lineTo(18, 9);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-16, -7, 38, 20);
  // Wheels, turned with the steering.
  ctx.fillStyle = '#101016';
  const wy = 10.5;
  for (const [wx, front] of [[-11, 0], [11, 1]]) {
    ctx.save();
    ctx.translate(wx, -wy); if (front) ctx.rotate(car.steerVis * 0.42); ctx.fillRect(-4.5, -2.4, 9, 4.8); ctx.restore();
    ctx.save();
    ctx.translate(wx, wy); if (front) ctx.rotate(car.steerVis * 0.42); ctx.fillRect(-4.5, -2.4, 9, 4.8); ctx.restore();
  }
  // Body.
  ctx.fillStyle = isCop ? '#e9e9f2' : car.color;
  roundRect(ctx, -19, -11, 38, 22, 6); ctx.fill();
  if (car.kind === 'taxi' && !isCop) {
    ctx.fillStyle = '#f7b731';
    roundRect(ctx, -19, -11, 38, 22, 6); ctx.fill();
    ctx.fillStyle = '#14141c';
    ctx.fillRect(-4, -4, 8, 8);
  }
  if (isCop) {
    ctx.fillStyle = '#14141f';
    ctx.fillRect(-6, -11, 13, 22);
    ctx.fillStyle = '#e9e9f2';
    ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
    ctx.save(); ctx.rotate(Math.PI / 2); ctx.fillText('PD', 0, 3); ctx.restore();
    // Light bar: alternating red/blue strobes.
    const phase = Math.floor(now * 7) % 2;
    ctx.fillStyle = phase ? '#ff3355' : '#2255ff';
    ctx.fillRect(-3, -7, 7, 6);
    ctx.fillStyle = phase ? '#2255ff' : '#ff3355';
    ctx.fillRect(-3, 1, 7, 6);
    ctx.fillStyle = phase ? 'rgba(255,51,85,0.25)' : 'rgba(34,85,255,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  }
  // Cabin and glass.
  ctx.fillStyle = '#18242f';
  roundRect(ctx, -8, -8.6, 17, 17.2, 4); ctx.fill();
  ctx.fillStyle = 'rgba(170, 225, 255, 0.5)';
  ctx.fillRect(6, -7.6, 3.4, 15.2);
  // Tail lights.
  ctx.fillStyle = '#ff2233';
  ctx.fillRect(-19.5, -8.6, 2.4, 4.6);
  ctx.fillRect(-19.5, 4, 2.4, 4.6);
  if (car.wrecked) {
    ctx.fillStyle = 'rgba(12,12,16,0.5)';
    roundRect(ctx, -19, -11, 38, 22, 6); ctx.fill();
    ctx.strokeStyle = '#0c0c10';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(2, 6); ctx.moveTo(-4, -9); ctx.lineTo(10, 4); ctx.stroke();
  }
  ctx.restore();
  // Damage smoke drifts up in screen space.
  if (car.health < 45 && !car.wrecked) {
    ctx.fillStyle = 'rgba(160,160,170,0.35)';
    const s = 5 + Math.sin(now * 6 + car.id) * 1.6;
    ctx.beginPath(); ctx.arc(car.x + 10, car.y - 8 - (now * 13 + car.id * 7) % 16, s, 0, Math.PI * 2); ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The minimap: whole city at a glance — water, roads, the player, the job
// marker in gold, police in red, traffic as faint dots.
export function drawMinimap(ctx, g, x, y, size) {
  const s = size / CITY.size;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 24, 0.78)';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x + CITY.waterX * s, y, size - CITY.waterX * s, size);
  ctx.strokeStyle = 'rgba(160,160,200,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const c of LINES) {
    ctx.moveTo(x + c * s, y); ctx.lineTo(x + c * s, y + size);
    ctx.moveTo(x, y + c * s); ctx.lineTo(x + size, y + c * s);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(230,230,240,0.35)';
  for (const car of g.cars) ctx.fillRect(x + car.x * s - 1, y + car.y * s - 1, 2, 2);
  ctx.fillStyle = '#ff3355';
  for (const cop of g.cops) ctx.fillRect(x + cop.x * s - 2, y + cop.y * s - 2, 4, 4);
  const target = g.director.currentTarget();
  if (target) {
    ctx.fillStyle = '#ffbe28';
    ctx.beginPath(); ctx.arc(x + target.x * s, y + target.y * s, 4 + Math.sin(g.now * 5) * 1.2, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const px = x + g.player.x * s, py = y + g.player.y * s;
  ctx.translate(px, py);
  ctx.rotate(g.player.car ? g.player.car.angle : g.player.angle);
  ctx.fillStyle = '#ff2e88';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

// hud.js — everything drawn over the world: cash, health, wanted stars, the job
// panel, banners and prompts, and the full-screen states (title, pause, busted,
// wasted). The game loop owns the state; this module only reads and draws.

import { VIEW_W, VIEW_H, PALETTE } from './config.js';
import { drawMinimap } from './render.js';
import { districtAt } from './world.js';
import { GIVER } from './missions.js';

function hash(n) {
  const x = Math.sin(n * 91.7 + 47.3) * 24634.6;
  return x - Math.floor(x);
}

function stars(ctx, x, y, count, now) {
  ctx.font = '26px system-ui';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    const active = i < count;
    ctx.fillStyle = active ? '#ffd23e' : 'rgba(255,255,255,0.18)';
    if (active && count >= 4) ctx.fillStyle = Math.floor(now * 3) % 2 ? '#ffd23e' : '#ff9040';
    ctx.fillText('★', x + i * 27, y);
  }
}

export function drawHud(ctx, g) {
  // Top-left: cash and health.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,10,24,0.55)';
  ctx.fillRect(14, 12, 218, 64);
  ctx.fillStyle = '#3dff9e';
  ctx.font = 'bold 25px system-ui';
  ctx.fillText(`$${g.cash.toLocaleString('en-US')}`, 26, 42);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(26, 52, 160, 9);
  ctx.fillStyle = g.player.health > 30 ? '#ff2e88' : '#ff2233';
  ctx.fillRect(26, 52, 160 * Math.max(0, g.player.health) / 100, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px system-ui';
  ctx.fillText(districtAt(g.player.x, g.player.y).toUpperCase(), 26, 72);

  // Top-right: wanted stars over the minimap.
  stars(ctx, VIEW_W - 232, 34, g.stars, g.now);
  drawMinimap(ctx, g, VIEW_W - 216, 46, 200);

  // Bust meter: a closing handcuff ring while the PD has the player pinned.
  if (g.bust > 0.02) {
    ctx.fillStyle = 'rgba(10,10,24,0.6)';
    ctx.fillRect(VIEW_W / 2 - 130, 84, 260, 34);
    ctx.fillStyle = '#ff3355';
    ctx.fillRect(VIEW_W / 2 - 122, 106, 244 * Math.min(1, g.bust), 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('THE PD HAS YOU PINNED — MOVE!', VIEW_W / 2, 99);
  }

  drawJobPanel(ctx, g);

  // Bottom-right: speed in the car, controls hint on foot.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  if (g.player.car) {
    ctx.font = 'bold 30px system-ui';
    ctx.fillText(`${Math.round(Math.abs(g.player.car.speed) * 0.36)}`, VIEW_W - 64, VIEW_H - 26);
    ctx.font = '13px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('km/h', VIEW_W - 26, VIEW_H - 26);
  } else {
    ctx.font = '13px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('E — take a car · SPACE — swing · SHIFT — run', VIEW_W - 20, VIEW_H - 18);
  }
  if (g.muted) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '13px system-ui';
    ctx.fillText('MUTED (M)', VIEW_W - 20, VIEW_H - 40);
  }

  if (g.prompt) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 19px system-ui';
    const w = ctx.measureText(g.prompt).width + 44;
    ctx.fillStyle = 'rgba(10,10,24,0.72)';
    ctx.fillRect(VIEW_W / 2 - w / 2, VIEW_H - 108, w, 40);
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(g.prompt, VIEW_W / 2, VIEW_H - 80);
  }

  if (g.progress) {
    ctx.fillStyle = 'rgba(10,10,24,0.6)';
    ctx.fillRect(VIEW_W / 2 - 150, VIEW_H - 160, 300, 30);
    ctx.fillStyle = '#ffbe28';
    ctx.fillRect(VIEW_W / 2 - 142, VIEW_H - 141, 284 * Math.min(1, g.progress.frac), 6);
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(g.progress.label, VIEW_W / 2, VIEW_H - 148 + 30 - 22);
  }

  if (g.banner && g.now < g.banner.until) {
    const left = g.banner.until - g.now;
    const alpha = Math.min(1, left / 0.5, (g.now - g.banner.from) / 0.3);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,10,24,0.66)';
    ctx.fillRect(VIEW_W / 2 - 330, 128, 660, 74);
    ctx.fillStyle = '#ff2e88';
    ctx.font = 'bold 27px system-ui';
    ctx.fillText(g.banner.title, VIEW_W / 2, 162);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '15px system-ui';
    wrapText(ctx, g.banner.sub, VIEW_W / 2, 186, 620, 18, 1);
    ctx.globalAlpha = 1;
  }
}

function drawJobPanel(ctx, g) {
  const d = g.director;
  let title = null, lines = [];
  if (d.active) {
    const step = d.active.def.steps[d.active.stepIdx];
    title = d.active.def.title.toUpperCase();
    lines = [step.label];
    if (step.kind === 'wrecks') lines.push(`${d.active.wrecks} / ${step.count} wrecked`);
    else {
      const t = d.point(step.at);
      const dist = Math.round(Math.hypot(g.player.x - t.x, g.player.y - t.y) / 10);
      lines.push(`Target ${dist} m out — follow the gold light`);
    }
    if (step.time || step.legTime) {
      const left = Math.max(0, (step.time || step.legTime) - d.active.stepTime);
      lines.push(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left`);
    }
    lines.push(`Reward $${d.active.def.reward}`);
  } else if (d.storyDone) {
    title = 'SOLMARIS IS YOURS';
    lines = ['Story complete. Fares and mayhem remain.'];
  } else {
    const offer = d.currentOffer();
    if (offer && d.offerCd <= 0) {
      title = 'NEW JOB AT THE ANCHOR';
      lines = [`${offer.title} — $${offer.reward}`, 'Go to the gold marker, press F to take it'];
    }
  }
  if (!title) return;
  ctx.fillStyle = 'rgba(10,10,24,0.55)';
  ctx.fillRect(14, VIEW_H - 30 - lines.length * 19 - 30, 330, lines.length * 19 + 40);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffbe28';
  ctx.font = 'bold 14px system-ui';
  ctx.fillText(title, 26, VIEW_H - lines.length * 19 - 26);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '14px system-ui';
  lines.forEach((line, i) => ctx.fillText(line, 26, VIEW_H - lines.length * 19 - 4 + i * 19));
}

function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = text.split(' ');
  let line = '', rows = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + rows * lineH);
      rows++; line = word;
      if (rows >= maxLines) return;
    } else line = test;
  }
  if (rows < maxLines) ctx.fillText(line, x, y + rows * lineH);
}

// --- Full-screen states -----------------------------------------------------

export function drawTitle(ctx, g) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, '#160a2e');
  grad.addColorStop(0.55, '#3d1440');
  grad.addColorStop(0.78, '#93355c');
  grad.addColorStop(1, '#1b1035');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Sun: a fat banded disc sinking behind the skyline.
  const sunY = 468;
  ctx.fillStyle = '#ffb02e';
  ctx.beginPath(); ctx.arc(VIEW_W / 2, sunY, 128, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#93355c';
  for (let i = 0; i < 5; i++) ctx.fillRect(VIEW_W / 2 - 130, sunY + 18 + i * 24, 260, 7 + i * 2);

  // Skyline silhouette with lit windows and neon crowns.
  for (let i = 0; i < 26; i++) {
    const w = 34 + hash(i * 3.1) * 46;
    const h = 90 + hash(i * 7.7) * 240;
    const x = i * 52 - 8;
    ctx.fillStyle = '#120826';
    ctx.fillRect(x, 560 - h, w, h + 160);
    ctx.fillStyle = ['#ff2e88', '#22d3ee', '#ffb02e', '#7c5cff'][i % 4];
    ctx.fillRect(x, 560 - h, w, 3);
    ctx.fillStyle = 'rgba(255, 205, 110, 0.8)';
    for (let k = 0; k < 14; k++) {
      if (hash(i * 31 + k * 7) < 0.5) ctx.fillRect(x + 5 + hash(k + i) * (w - 12), 560 - h + 12 + hash(k * 3 + i) * (h - 24), 4, 6);
    }
  }
  ctx.fillStyle = '#0d0518';
  ctx.fillRect(0, 560, VIEW_W, VIEW_H - 560);
  ctx.fillStyle = PALETTE.waterGlow;
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 30; i++) ctx.fillRect(60 + hash(i * 5.3) * (VIEW_W - 120), 580 + hash(i * 9.4) * 110, 36, 3);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#22d3ee';
  ctx.font = 'bold 30px system-ui';
  ctx.fillText('N E O N   H A R B O R', VIEW_W / 2, 120);
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#ff2e88';
  ctx.font = 'bold 92px system-ui';
  ctx.fillText('SOLMARIS HEAT', VIEW_W / 2, 208);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '17px system-ui';
  ctx.fillText('One courier. One neon port city. Every cop in Solmaris between you and payday.', VIEW_W / 2, 252);

  ctx.font = '15px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const controls = [
    'WASD / arrows — move & drive      E — enter / leave a car      SPACE — swing / handbrake',
    'F — take the job at the Anchor      SHIFT — run      P — pause      M — mute',
  ];
  controls.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 606 + i * 24));

  const pulse = 0.65 + Math.sin(g.now * 3.2) * 0.35;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 22px system-ui';
  ctx.fillText('CLICK OR PRESS ENTER TO RUN THE CITY', VIEW_W / 2, 668);
  ctx.globalAlpha = 1;

  if (g.saveData && (g.saveData.bestCash > 0 || g.saveData.missionsDone > 0)) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px system-ui';
    ctx.fillText(`Saved: best cash $${g.saveData.bestCash} · story jobs done ${g.saveData.missionsDone}/4`, VIEW_W / 2, 40);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '13px system-ui';
  ctx.fillText(`Work for ${GIVER}. Steal cars. Mind the stars.`, VIEW_W / 2, VIEW_H - 14);
}

export function drawPause(ctx, g) {
  ctx.fillStyle = 'rgba(8, 6, 20, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2e88';
  ctx.font = 'bold 54px system-ui';
  ctx.fillText('PAUSED', VIEW_W / 2, 300);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '17px system-ui';
  ctx.fillText('P or Esc to keep running · your progress saves itself at every payday', VIEW_W / 2, 348);
  ctx.fillText(`Cash $${g.cash.toLocaleString('en-US')} · jobs done ${g.director.index}/4`, VIEW_W / 2, 382);
}

export function drawEndScreen(ctx, g) {
  const busted = g.state === 'busted';
  ctx.fillStyle = busted ? 'rgba(16, 20, 60, 0.78)' : 'rgba(60, 8, 16, 0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = busted ? '#4dc9ff' : '#ff3355';
  ctx.font = 'bold 84px system-ui';
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', VIEW_W / 2, 320);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '18px system-ui';
  ctx.fillText(
    busted ? 'Solmaris PD impounds your ride and takes a cut of your cash.' : 'You wake up outside Santa Brisa hospital, lighter by the bill.',
    VIEW_W / 2, 366,
  );
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 20px system-ui';
  ctx.fillText('PRESS ENTER TO GET BACK TO WORK', VIEW_W / 2, 420);
}

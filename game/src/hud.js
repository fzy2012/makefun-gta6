// The HUD, the minimap and every menu, drawn over the world: cash and health,
// the wanted stars, the mission objective, the speed, the dialogue lines and
// the title, pause and busted screens.

import { FONT, PALETTE, WORLD } from './config.js';
import { currentObjective } from './missions.js';

const VIEW_W = 1280;
const VIEW_H = 720;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudBg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function drawStars(ctx, wanted, cx, y) {
  ctx.font = '26px ' + FONT;
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < wanted ? PALETTE.star : PALETTE.starEmpty;
    ctx.fillText('★', cx + (i - 2) * 32, y);
  }
}

export function drawHUD(ctx, state) {
  const p = state.player;
  // Top left: cash, health, ammo.
  panel(ctx, 14, 14, 250, 84);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.cash;
  ctx.font = 'bold 26px ' + FONT;
  ctx.fillText(`$${state.cash.toLocaleString('en-US')}`, 28, 44);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '13px ' + FONT;
  ctx.fillText(`Ammo ${state.ammo}`, 170, 42);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(28, 58, 180, 12);
  ctx.fillStyle = state.health > 30 ? '#7fe08a' : PALETTE.danger;
  ctx.fillRect(28, 58, 180 * Math.max(0, state.health / 100), 12);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('HP', 214, 69);

  // Top centre: wanted stars.
  drawStars(ctx, state.wanted, VIEW_W / 2, 44);
  if (state.wanted > 0) {
    ctx.fillStyle = PALETTE.danger;
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(state.wanted >= 3 ? 'THE LAW IS ON YOU' : 'WANTED', VIEW_W / 2, 64);
  }

  // Top right: minimap.
  drawMinimap(ctx, state);

  // Bottom left: the current job.
  const objective = currentObjective(state.missions);
  const missionTitle = state.missions.active && state.missions.index >= 0
    ? state.missions.defs[state.missions.index].title : null;
  if (objective || state.nextMissionAtGarage) {
    const text = objective || 'Head to Rook\'s Garage for the next job';
    const title = missionTitle || 'Next Job';
    panel(ctx, 14, VIEW_H - 78, 430, 64);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.star;
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillText(title.toUpperCase(), 28, VIEW_H - 54);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '15px ' + FONT;
    ctx.fillText(text, 28, VIEW_H - 30);
    if (state.missions.active && state.missions.timer > 0) {
      ctx.fillStyle = state.missions.timer < 20 ? PALETTE.danger : PALETTE.text;
      ctx.font = 'bold 20px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.ceil(state.missions.timer)}s`, 428, VIEW_H - 34);
      ctx.textAlign = 'left';
    }
  }

  // Bottom right: speed when driving, controls when walking.
  if (!p.onFoot && p.car) {
    panel(ctx, VIEW_W - 190, VIEW_H - 78, 176, 64);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.55)}`, VIEW_W - 60, VIEW_H - 36);
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('mph', VIEW_W - 28, VIEW_H - 36);
  } else {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(244,241,230,0.75)';
    ctx.font = '13px ' + FONT;
    ctx.fillText('WASD move · E get in car · Click shoot · Space punch · M mute', VIEW_W - 16, VIEW_H - 18);
  }

  // Context prompt.
  if (state.prompt) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(state.prompt, VIEW_W / 2, VIEW_H - 96);
  }

  // Toast under the stars.
  if (state.toast) {
    ctx.globalAlpha = Math.max(0, 1 - state.toast.t / 3);
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px ' + FONT;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(state.toast.text, VIEW_W / 2, 92);
    ctx.globalAlpha = 1;
  }

  // Dialogue lines, bottom centre, above the job panel.
  if (state.dialogue) {
    const d = state.dialogue;
    const lines = d.lines.slice(0, 2);
    const h = 30 + lines.length * 24 + 16;
    panel(ctx, VIEW_W / 2 - 330, VIEW_H - 190 - h, 660, h);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.star;
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillText(d.title.toUpperCase(), VIEW_W / 2 - 314, VIEW_H - 190 - h + 26);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '15px ' + FONT;
    lines.forEach((line, i) => {
      ctx.fillText(line, VIEW_W / 2 - 314, VIEW_H - 190 - h + 52 + i * 24);
    });
  }

  // Busted hold progress: a cop has a grip on the player.
  if (state.bustHold > 0.2) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillText('SHAKE THEM OFF — MOVE!', VIEW_W / 2, 130);
  }
}

function drawMinimap(ctx, state) {
  const size = 190;
  const x0 = VIEW_W - size - 14;
  const y0 = 14;
  const scale = size / WORLD.size;
  panel(ctx, x0 - 6, y0 - 6, size + 12, size + 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  ctx.fillStyle = '#3d6b34';
  ctx.fillRect(x0, y0, size, size);
  // Water: harbour north, sea south.
  ctx.fillStyle = '#2f9db8';
  ctx.fillRect(x0, y0, size, WORLD.harbourY * scale);
  ctx.fillRect(x0, y0 + WORLD.waterY * scale, size, size - WORLD.waterY * scale);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(x0, y0 + WORLD.beachY * scale, size, (WORLD.waterY - WORLD.beachY) * scale);
  // Roads.
  ctx.fillStyle = '#3c414d';
  for (const r of state.city.roads) {
    ctx.fillRect(x0 + (r - 48) * scale, y0, 96 * scale, WORLD.beachY * scale);
    ctx.fillRect(x0, y0 + (r - 48) * scale, size, 96 * scale);
  }
  // Park.
  const park = state.city.park;
  ctx.fillStyle = '#5d9b4a';
  ctx.fillRect(x0 + park.x * scale, y0 + park.y * scale, park.w * scale, park.h * scale);
  // Mission marker, pulsing.
  const marker = state.marker;
  if (marker) {
    const pulse = 3 + Math.sin(state.time * 5) * 1.5;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(x0 + marker.x * scale, y0 + marker.y * scale, pulse + 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police, blue; the player, yellow, with a direction tick.
  ctx.fillStyle = '#2f7bff';
  for (const car of state.cars) {
    if (car.driver !== 'police') continue;
    ctx.beginPath();
    ctx.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const p = state.player;
  ctx.save();
  ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // Viewport frame.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  const vx = x0 + (state.cam.x - 640) * scale;
  const vy = y0 + (state.cam.y - 360) * scale;
  ctx.strokeRect(vx, vy, 1280 * scale, 720 * scale);
}

export function drawTitle(ctx, best) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 84px ' + FONT;
  ctx.fillText('SOLMAR HEAT', VIEW_W / 2, 210);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '22px ' + FONT;
  ctx.fillText('An open-world crime story in Solmar City', VIEW_W / 2, 252);
  ctx.font = '16px ' + FONT;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('Steal cars. Outrun the law. Run Mara\'s jobs. Own the city.', VIEW_W / 2, 286);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 20px ' + FONT;
  ctx.fillText('Press ENTER or click to start', VIEW_W / 2, 360);
  if (best) {
    ctx.fillStyle = PALETTE.star;
    ctx.font = '16px ' + FONT;
    ctx.fillText('Continue — your last run is saved (press C)', VIEW_W / 2, 396);
  }
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '15px ' + FONT;
  ctx.fillText('WASD move / drive · E enter or steal a car · Mouse aim, click shoot · Space punch', VIEW_W / 2, 470);
  ctx.fillText('Esc pause · M mute · Your progress saves when a job is done', VIEW_W / 2, 496);
  ctx.fillStyle = 'rgba(244,241,230,0.5)';
  ctx.font = '13px ' + FONT;
  ctx.fillText('A work of fiction. Solmar City, its people and its stories are invented.', VIEW_W / 2, 660);
}

export function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 52px ' + FONT;
  ctx.fillText('PAUSED', VIEW_W / 2, 320);
  ctx.font = '18px ' + FONT;
  ctx.fillText('Esc to keep playing · progress is saved when a job is done', VIEW_W / 2, 364);
}

export function drawBusted(ctx, lost, wasted) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = wasted ? PALETTE.danger : '#7fb8ff';
  ctx.font = 'bold 64px ' + FONT;
  ctx.fillText(wasted ? 'WASTED' : 'BUSTED', VIEW_W / 2, 300);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '20px ' + FONT;
  ctx.fillText(wasted ? 'Solmar General patched you up.' : 'The Solmar PD booked you, then let you go.', VIEW_W / 2, 344);
  ctx.fillText(`You lost $${lost.toLocaleString('en-US')} in the confusion.`, VIEW_W / 2, 376);
  ctx.font = 'bold 18px ' + FONT;
  ctx.fillText('Press ENTER to get back on the street', VIEW_W / 2, 440);
}

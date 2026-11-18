// Drawing only: the world's state in, pixels out. The camera looks at a
// 1280x720 window of the city; only what falls inside it is painted, so a
// frame stays cheap whatever the city holds. All art is drawn, not loaded.

import { CAR, FONT, PALETTE, WORLD } from './config.js';
import { isSand, isWater } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const VIEW_W = 1280;
const VIEW_H = 720;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawCity(state, view) {
    const city = state.city;
    const { x0, y0, x1, y1 } = view;
    // Ground: grass, with the beach and the sea along the south edge.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (y1 > WORLD.beachY) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(x0, Math.max(y0, WORLD.beachY), x1 - x0, Math.min(y1, WORLD.waterY) - Math.max(y0, WORLD.beachY));
    }
    if (y1 > WORLD.waterY) {
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(x0, Math.max(y0, WORLD.waterY), x1 - x0, y1 - Math.max(y0, WORLD.waterY));
      // Animated wave lines.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      const t = state.time;
      for (let i = 0; i < 3; i += 1) {
        const wy = WORLD.waterY + 24 + i * 34 + Math.sin(t * 1.4 + i * 2) * 4;
        if (wy < y0 || wy > y1) continue;
        ctx.beginPath();
        for (let x = Math.max(x0, 0); x <= Math.min(x1, WORLD.size); x += 40) {
          const yy = wy + Math.sin(x * 0.02 + t * 2 + i) * 3;
          if (x === Math.max(x0, 0)) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    // Harbour water on the north edge.
    if (y0 < WORLD.harbourY) {
      ctx.fillStyle = PALETTE.waterDeep;
      ctx.fillRect(x0, Math.max(y0, 0), x1 - x0, Math.min(y1, WORLD.harbourY) - Math.max(y0, 0));
    }

    // Sidewalks, then roads.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const r of city.roads) {
      ctx.fillRect(r - WORLD.roadWidth / 2 - WORLD.sidewalk, 0, WORLD.roadWidth + WORLD.sidewalk * 2, WORLD.beachY);
      ctx.fillRect(0, r - WORLD.roadWidth / 2 - WORLD.sidewalk, WORLD.size, WORLD.roadWidth + WORLD.sidewalk * 2);
    }
    ctx.fillStyle = PALETTE.road;
    for (const r of city.roads) {
      ctx.fillRect(r - WORLD.roadWidth / 2, 0, WORLD.roadWidth, WORLD.beachY);
      ctx.fillRect(0, r - WORLD.roadWidth / 2, WORLD.size, WORLD.roadWidth);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const r of city.roads) {
      for (let y = 0; y < WORLD.beachY; y += 56) {
        if (y + 26 > y1 || y < y0 - 26) continue;
        ctx.fillRect(r - 2, y, 4, 26);
      }
      for (let x = 0; x < WORLD.size; x += 56) {
        if (x + 26 > x1 || x < x0 - 26) continue;
        ctx.fillRect(x, r - 2, 26, 4);
      }
    }

    // The park: green, a pond, and trees.
    const park = city.park;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = PALETTE.water;
    ctx.beginPath();
    ctx.ellipse(park.x + park.w * 0.68, park.y + park.h * 0.62, 52, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const tree of city.trees) {
      if (tree.x < x0 - 20 || tree.x > x1 + 20 || tree.y < y0 - 20 || tree.y > y1 + 20) continue;
      ctx.fillStyle = '#3f7a33';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#57a047';
      ctx.beginPath();
      ctx.arc(tree.x - 3, tree.y - 3, tree.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Harbour containers.
    for (const c of city.containers) {
      if (c.x + c.w < x0 || c.x > x1 || c.y + c.h < y0 || c.y > y1) continue;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 1; i < 5; i += 1) ctx.fillRect(c.x + (c.w / 5) * i - 1, c.y, 2, c.h);
    }

    // Buildings: a shaded slab, a roof, windows, and a rooftop box.
    for (const b of city.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x, b.y, b.w, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      const cols = Math.max(2, Math.floor(b.w / 26));
      const rows = Math.max(2, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 3 + b.seed) % 4 === 0) continue;
          ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 10, 10);
        }
      }
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, b.w * 0.2, b.h * 0.2);
      }
    }

    // Zone labels, small and quiet, kept inside the frame.
    ctx.font = '600 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const z of city.zones) {
      if (z.x < x0 + 90 || z.x > x1 - 90 || z.y < y0 + 24 || z.y > y1 - 24) continue;
      ctx.fillText(z.name, z.x, z.y - 8);
    }
  }

  function drawCar(car, state, time) {
    const ctx2 = ctx;
    ctx2.save();
    ctx2.translate(car.x, car.y);
    ctx2.rotate(car.angle);
    // Shadow.
    ctx2.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx2, -CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 8);
    ctx2.fill();
    // Body.
    ctx2.fillStyle = car.color;
    roundRect(ctx2, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    ctx2.fill();
    if (car.kind === 'police') {
      ctx2.fillStyle = '#1d3a8a';
      ctx2.fillRect(-6, -CAR.width / 2, 12, CAR.width);
      // Flashing light bar.
      const on = Math.floor(time * 6) % 2 === 0;
      ctx2.fillStyle = on ? PALETTE.policeLight : PALETTE.policeLight2;
      ctx2.fillRect(-4, -CAR.width / 2 - 3, 8, 6);
      ctx2.fillStyle = on ? PALETTE.policeLight2 : PALETTE.policeLight;
      ctx2.fillRect(-4, CAR.width / 2 - 3, 8, 6);
    } else if (car.kind === 'taxi') {
      ctx2.fillStyle = '#1c1c1c';
      ctx2.font = 'bold 9px ' + FONT;
      ctx2.textAlign = 'center';
      ctx2.fillText('TAXI', 0, 3);
    }
    // Windshield and roof.
    ctx2.fillStyle = 'rgba(20,30,45,0.85)';
    ctx2.fillRect(CAR.length / 2 - 16, -CAR.width / 2 + 4, 10, CAR.width - 8);
    ctx2.fillStyle = 'rgba(255,255,255,0.18)';
    ctx2.fillRect(-8, -CAR.width / 2 + 4, 14, CAR.width - 8);
    // Headlights and taillights.
    ctx2.fillStyle = '#fff8c8';
    ctx2.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 2, 3, 5);
    ctx2.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 7, 3, 5);
    ctx2.fillStyle = '#ff3b30';
    ctx2.fillRect(-CAR.length / 2 - 1, -CAR.width / 2 + 2, 3, 5);
    ctx2.fillRect(-CAR.length / 2 - 1, CAR.width / 2 - 7, 3, 5);
    // Smoke when wrecked.
    if (car.smoking) {
      ctx2.fillStyle = 'rgba(60,60,60,0.5)';
      ctx2.beginPath();
      ctx2.arc(-CAR.length / 4, 0, 8 + Math.sin(time * 5) * 2, 0, Math.PI * 2);
      ctx2.fill();
    }
    ctx2.restore();
    // Player's car gets a marker ring.
    if (car.driver === 'player') {
      ctx.strokeStyle = 'rgba(255,210,62,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(car.x, car.y, CAR.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPed(ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle);
    if (ped.kind === 'down') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.kind === 'cop' ? '#1d3a8a' : ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(5, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    if (ped.kind === 'cop') {
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(-2, -11, 4, 3);
    }
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p.onFoot) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rook: yellow jacket, dark jeans, always moving like he owns the street.
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(7, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22242c';
    ctx.fillRect(4, -6, 5, 4);
    ctx.fillRect(4, 2, 5, 4);
    // Pistol in hand when aiming.
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(10, -2, 9, 3);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,210,62,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const bob = Math.sin(state.time * 3 + pk.x) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'health') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-11, -11, 22, 22);
        ctx.fillStyle = '#e8452c';
        ctx.fillRect(-3, -8, 6, 16);
        ctx.fillRect(-8, -3, 16, 6);
      } else if (pk.kind === 'ammo') {
        ctx.fillStyle = '#ffd23e';
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = '#22242c';
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', 0, 4);
      } else if (pk.kind === 'cash') {
        ctx.fillStyle = '#7fe08a';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#14522a';
        ctx.font = 'bold 13px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 5);
      } else {
        // Package or crate: a glowing parcel.
        const pulse = 0.6 + Math.sin(state.time * 4) * 0.4;
        ctx.fillStyle = `rgba(255,210,62,${0.25 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pk.kind === 'crate' ? '#8a6fc9' : '#d9a05b';
        ctx.fillRect(-10, -8, 20, 16);
        ctx.fillStyle = '#22242c';
        ctx.fillRect(-10, -1, 20, 2);
      }
      ctx.restore();
    }
  }

  function drawMarker(state, view) {
    const marker = state.marker;
    if (!marker) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(-9, -52);
    ctx.lineTo(9, -52);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(marker.label, 0, -60);
    ctx.restore();
    // An edge arrow when the marker is off screen.
    const cx = state.cam.x;
    const cy = state.cam.y;
    const dx = marker.x - cx;
    const dy = marker.y - cy;
    if (Math.abs(dx) > VIEW_W / 2 - 40 || Math.abs(dy) > VIEW_H / 2 - 40) {
      const ang = Math.atan2(dy, dx);
      const ax = cx + Math.cos(ang) * (VIEW_W / 2 - 60);
      const ay = cy + Math.sin(ang) * (VIEW_H / 2 - 60);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawWorld(state) {
    const cam = state.cam;
    const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const vx0 = cam.x - VIEW_W / 2 + shakeX;
    const vy0 = cam.y - VIEW_H / 2 + shakeY;
    const view = { x0: vx0, y0: vy0, x1: vx0 + VIEW_W, y1: vy0 + VIEW_H };
    ctx.save();
    ctx.translate(-vx0, -vy0);
    drawCity(state, view);
    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,20,0.45)';
    ctx.lineWidth = 4;
    for (const s of state.skids) {
      ctx.globalAlpha = Math.min(1, s.life);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawPickups(state);
    for (const car of state.cars) {
      if (car.x < view.x0 - 80 || car.x > view.x1 + 80 || car.y < view.y0 - 80 || car.y > view.y1 + 80) continue;
      drawCar(car, state, state.time);
    }
    for (const ped of state.peds) {
      if (ped.x < view.x0 - 40 || ped.x > view.x1 + 40 || ped.y < view.y0 - 40 || ped.y > view.y1 + 40) continue;
      drawPed(ped);
    }
    drawPlayer(state);
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    drawMarker(state, view);
    // Floating score text.
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Sun glare: warm light from the top of the frame.
    const glare = ctx.createLinearGradient(0, 0, 0, 160);
    glare.addColorStop(0, 'rgba(255, 214, 130, 0.10)');
    glare.addColorStop(1, 'rgba(255, 214, 130, 0)');
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, VIEW_W, 160);
  }

  return { drawWorld, VIEW_W, VIEW_H };
}

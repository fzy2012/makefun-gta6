// Solmar City: a grid of roads, the blocks between them, and the places that
// make it a city — a park, a beach, a harbour, and the named spots missions use.
// Everything is generated from one seed, so the city never changes between runs.

import { WORLD, PALETTE } from './config.js';

const ROADS = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];

function roadCentres() {
  return ROADS.slice();
}

/** The block (col, row) spans between two neighbouring roads. */
function blockRect(col, row) {
  const x0 = ROADS[col] + WORLD.roadWidth / 2 + WORLD.sidewalk;
  const y0 = ROADS[row] + WORLD.roadWidth / 2 + WORLD.sidewalk;
  const x1 = ROADS[col + 1] - WORLD.roadWidth / 2 - WORLD.sidewalk;
  const y1 = ROADS[row + 1] - WORLD.roadWidth / 2 - WORLD.sidewalk;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function buildCity(rng) {
  const buildings = [];
  const containers = [];
  const trees = [];
  const zones = [];

  // The park fills one whole block in the middle of town.
  const park = { col: 4, row: 4, ...blockRect(4, 4) };
  for (let i = 0; i < 26; i += 1) {
    trees.push({
      x: rng.range(park.x + 16, park.x + park.w - 16),
      y: rng.range(park.y + 16, park.y + park.h - 16),
      r: rng.range(9, 15),
    });
  }

  // The harbour yard fills the north-west block: containers stacked inside
  // it, clear of the roads, with the water along the north edge above.
  const yard = blockRect(0, 0);
  for (let i = 0; i < 8; i += 1) {
    containers.push({
      x: yard.x + 8 + (i % 3) * 88,
      y: yard.y + 10 + Math.floor(i / 3) * 62,
      w: 76,
      h: 36,
      color: rng.pick(['#c96f4a', '#4a7fc9', '#5aa864', '#c9a44a', '#8a6fc9']),
    });
  }

  // Buildings fill every block but the park, the harbour block and the beach row.
  const downtown = new Set(['2,2', '3,2', '2,3', '3,3']);
  for (let col = 0; col < 7; col += 1) {
    for (let row = 0; row < 7; row += 1) {
      if (col === park.col && row === park.row) continue;
      if (col === 0 && row === 0) continue; // harbour yard
      if (row === 6) continue; // beach row, open sand
      const rect = blockRect(col, row);
      const tall = downtown.has(`${col},${row}`);
      const count = tall ? 1 : rng.int(2, 3);
      for (let i = 0; i < count; i += 1) {
        const w = tall ? rect.w * 0.8 : rng.range(rect.w * 0.28, rect.w * 0.42);
        const h = tall ? rect.h * 0.8 : rng.range(rect.h * 0.28, rect.h * 0.42);
        const x = rect.x + rng.range(0, Math.max(1, rect.w - w));
        const y = rect.y + rng.range(0, Math.max(1, rect.h - h));
        buildings.push({
          x, y, w, h,
          tall,
          color: rng.pick(PALETTE.buildingRoof),
          seed: rng.int(0, 9999),
        });
      }
    }
  }

  // Named places missions and the HUD point at.
  zones.push({ id: 'garage', name: "Rook's Garage", x: 640, y: 640, kind: 'garage' });
  zones.push({ id: 'bar', name: 'The Rusty Anchor', x: 2360, y: 640, kind: 'bar' });
  zones.push({ id: 'bank', name: 'Solmar Bank', x: 1240, y: 1240, kind: 'bank' });
  zones.push({ id: 'harbour', name: 'Harbour Gate', x: 600, y: 300, kind: 'harbour' });
  zones.push({ id: 'clinic', name: 'St. Marina Clinic', x: 2640, y: 1440, kind: 'clinic' });
  zones.push({ id: 'ironworks', name: 'Ironworks Guns', x: 1440, y: 2640, kind: 'guns' });
  zones.push({ id: 'warehouse', name: 'Old Cannery', x: 2640, y: 2240, kind: 'warehouse' });
  zones.push({ id: 'beach', name: 'Playa Solmar', x: 1800, y: 3040, kind: 'beach' });

  return {
    roads: roadCentres(),
    buildings,
    containers,
    trees,
    park,
    zones,
    size: WORLD.size,
  };
}

export function zoneById(city, id) {
  return city.zones.find((z) => z.id === id);
}

/** True when the point is on a road (not on a sidewalk or a block). */
export function isOnRoad(x, y) {
  const half = WORLD.roadWidth / 2;
  const onV = ROADS.some((r) => Math.abs(x - r) <= half && y >= 0 && y <= WORLD.beachY);
  const onH = ROADS.some((r) => Math.abs(y - r) <= half && x >= 0 && x <= WORLD.size);
  return onV || onH;
}

export function isWater(x, y) {
  if (y >= WORLD.waterY) return true;
  if (y <= WORLD.harbourY && x < 1100) return true;
  return false;
}

export function isSand(x, y) {
  return y >= WORLD.beachY && y < WORLD.waterY;
}

/** Push a circle out of every building it overlaps; returns the corrected point. */
export function resolveBuildings(city, x, y, r) {
  let px = x;
  let py = y;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(px, b.x + b.w));
    const cy = Math.max(b.y, Math.min(py, b.y + b.h));
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        px = cx + (dx / d) * r;
        py = cy + (dy / d) * r;
      } else {
        // Dead centre: shove out along the smallest overlap.
        const left = px - b.x;
        const right = b.x + b.w - px;
        const top = py - b.y;
        const bottom = b.y + b.h - py;
        const m = Math.min(left, right, top, bottom);
        if (m === left) px = b.x - r;
        else if (m === right) px = b.x + b.w + r;
        else if (m === top) py = b.y - r;
        else py = b.y + b.h + r;
      }
    }
  }
  for (const c of city.containers) {
    const cx = Math.max(c.x, Math.min(px, c.x + c.w));
    const cy = Math.max(c.y, Math.min(py, c.y + c.h));
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 0.01) {
      const d = Math.sqrt(d2);
      px = cx + (dx / d) * r;
      py = cy + (dy / d) * r;
    }
  }
  return { x: px, y: py };
}

export function pointInBuilding(city, x, y) {
  return city.buildings.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

/** Road-graph nodes are the intersections; traffic picks a neighbouring one. */
export function nodeKey(x, y) {
  return `${x},${y}`;
}

export function neighboursOf(node) {
  const out = [];
  for (const r of ROADS) {
    if (r !== node.x) out.push({ x: r, y: node.y });
    if (r !== node.y) out.push({ x: node.x, y: r });
  }
  return out;
}

/** The nearest intersection to a point. */
export function nearestNode(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS) {
    for (const ry of ROADS) {
      const d = (rx - x) * (rx - x) + (ry - y) * (ry - y);
      if (d < bestD) {
        bestD = d;
        best = { x: rx, y: ry };
      }
    }
  }
  return best;
}

function nearestRoad(value) {
  let best = ROADS[0];
  let bestD = Infinity;
  for (const r of ROADS) {
    const d = Math.abs(value - r);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/**
 * Waypoints from a point to an intersection, staying on the roads: snap onto
 * the nearest road line, run along it to the target's row or column, then
 * turn onto the target's road. The result is an L shape, never a shortcut
 * across a block.
 */
export function roadPath(fromX, fromY, toX, toY) {
  const rv = nearestRoad(fromX);
  const rh = nearestRoad(fromY);
  const points = [];
  if (Math.abs(fromX - rv) <= Math.abs(fromY - rh)) {
    points.push({ x: rv, y: fromY });
    points.push({ x: rv, y: toY });
  } else {
    points.push({ x: fromX, y: rh });
    points.push({ x: toX, y: rh });
  }
  points.push({ x: toX, y: toY });
  // Drop waypoints the car is already on top of.
  const out = [];
  let px = fromX;
  let py = fromY;
  for (const p of points) {
    if (Math.hypot(p.x - px, p.y - py) > 30) {
      out.push(p);
      px = p.x;
      py = p.y;
    }
  }
  return out;
}

/** A random point on a road, for spawning traffic and parked cars. */
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(ROADS), y: rng.range(160, WORLD.beachY - 60) };
  }
  return { x: rng.range(160, WORLD.size - 160), y: rng.pick(ROADS) };
}

/** A random point on a sidewalk (for pedestrians). */
export function randomSidewalkPoint(rng) {
  const r = rng.pick(ROADS);
  const along = rng.range(160, WORLD.beachY - 60);
  const off = WORLD.roadWidth / 2 + WORLD.sidewalk / 2 + 4;
  if (rng.chance(0.5)) return { x: r + (rng.chance(0.5) ? off : -off), y: along };
  return { x: along, y: r + (rng.chance(0.5) ? off : -off) };
}

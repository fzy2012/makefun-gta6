// The screenshot scenes behind ?shot=start|chase|mission|drive. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot, so the frame is what a real game looks like and the
// same seed always gives the same frame.

import { STEP } from './config.js';
import { nearestNode, roadPath, zoneById } from './city.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const CHASE_SECONDS = 14;
const MISSION_SECONDS = 9;
const DRIVE_SECONDS = 11;

function neutralCtrl() {
  return { axes: { x: 0, y: 0 }, actions: 0, aim: null, mouseDown: false };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Drive toward the pilot's destination along the roads, never across a block. */
function drivePilot(api, pilot) {
  const s = api.state;
  const p = s.player;
  const car = p.car;
  if (!car) return neutralCtrl();
  if (!car.path || car.pathI >= car.path.length) {
    if (Math.hypot(pilot.dest.x - car.x, pilot.dest.y - car.y) < 80) {
      // Destination reached: pick another far corner of the city.
      const far = nearestNode(
        car.x + (s.rng.chance(0.5) ? 900 : -900),
        car.y + (s.rng.chance(0.5) ? 900 : -900),
      );
      pilot.dest = far;
    }
    car.path = roadPath(car.x, car.y, pilot.dest.x, pilot.dest.y);
    car.pathI = 0;
    if (car.path.length === 0) return { axes: { x: 0, y: -1 }, actions: 0, aim: null, mouseDown: false };
  }
  const wp = car.path[car.pathI];
  const d = Math.hypot(wp.x - car.x, wp.y - car.y);
  if (d < 46) {
    car.pathI += 1;
    return { axes: { x: 0, y: 0 }, actions: 0, aim: null, mouseDown: false };
  }
  const want = Math.atan2(wp.y - car.y, wp.x - car.x);
  const diff = angleDiff(want, car.angle);
  const steer = diff > 0.25 ? 1 : diff < -0.25 ? -1 : 0;
  // Look ahead: the turn after this waypoint, and brake early for it, or
  // the car arrives too fast and slides across the block.
  let comingTurn = 0;
  const nextWp = car.path[car.pathI + 1];
  if (nextWp) {
    const leg2 = Math.atan2(nextWp.y - wp.y, nextWp.x - wp.x);
    comingTurn = Math.abs(angleDiff(leg2, want));
  }
  // Wedged against a building: back out the way it came.
  if (Math.abs(car.speed) < 25) pilot.stuck = (pilot.stuck || 0) + 1;
  else pilot.stuck = 0;
  if (pilot.stuck > 45) {
    pilot.reverse = 40;
    pilot.stuck = 0;
  }
  if (pilot.reverse > 0) {
    pilot.reverse -= 1;
    return { axes: { x: -steer, y: 1 }, actions: 0, aim: null, mouseDown: false };
  }
  // Brake for a sharp turn and coast into a close one, so the car turns on
  // the road instead of powering across the block; brake early when the
  // turn after this waypoint is sharp.
  let throttle = -1;
  if (Math.abs(diff) > 0.55) throttle = 1;
  else if (comingTurn > 0.5 && d < 230) throttle = 1;
  else if (d < 110 && Math.abs(diff) > 0.2) throttle = 0;
  return { axes: { x: steer, y: throttle }, actions: 0, aim: null, mouseDown: false };
}

/** Walk toward a point. */
function walkPilot(api, tx, ty) {
  const s = api.state;
  const p = s.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  return {
    axes: {
      x: Math.abs(dx) > 12 ? Math.sign(dx) : 0,
      y: Math.abs(dy) > 12 ? Math.sign(dy) : 0,
    },
    actions: 0, aim: null, mouseDown: false,
  };
}

/** Put the player behind the wheel of the nearest parked car. */
function getInCar(api) {
  const s = api.state;
  const car = api.nearestCar(s.player.x, s.player.y, 400);
  if (!car) return false;
  s.player.x = car.x - 40;
  s.player.y = car.y;
  api.step({ axes: { x: 0, y: 0 }, actions: 4, aim: null, mouseDown: false }, STEP, null);
  return !s.player.onFoot;
}

export function stageShot(name, api) {
  const s = api.state;
  api.reset(true);
  const rng = s.rng;

  if (name === 'start') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      api.step(neutralCtrl(), STEP, null);
    }
    return { screen: SCREEN_TITLE };
  }

  if (name === 'chase') {
    // Three stars, police on the tail, the player tearing down a main road.
    getInCar(api);
    s.wanted = 3;
    for (let i = 0; i < 8; i += 1) api.spawnPolice();
    const pilot = { dest: nearestNode(s.player.x + 700, s.player.y - 500) };
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      api.step(drivePilot(api, pilot), STEP, null);
    }
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    // Package Run in progress: on foot, packages glowing, the Anchor ahead.
    const m = s.missions;
    startMission(m, 1);
    const def = m.defs[1];
    for (const pt of def.steps[0].points) {
      s.pickups.push({ kind: 'package', x: pt.x, y: pt.y, t: 0 });
    }
    const bar = zoneById(s.city, 'bar');
    s.player.x = 1900;
    s.player.y = 1500;
    s.cam.x = s.player.x;
    s.cam.y = s.player.y;
    const first = def.steps[0].points[0];
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      api.step(walkPilot(api, first.x, first.y), STEP, null);
      if (s.missions.collected > 0) break;
    }
    return { screen: SCREEN_PLAY };
  }

  // 'drive' and anything else: a fast cruise with traffic around.
  getInCar(api);
  const pilot = { dest: nearestNode(s.player.x + 800, s.player.y + 300) };
  for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
    api.step(drivePilot(api, pilot), STEP, null);
  }
  return { screen: SCREEN_PLAY };
}

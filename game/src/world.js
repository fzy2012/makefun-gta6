// Solmar Heat's rules and state: the player on foot and behind the wheel,
// traffic, pedestrians, police, the wanted level, combat, pickups, particles
// and Mara's missions. No drawing and no browser here: step() advances one
// fixed step and returns what happened as bit flags.

import { CAR, PLAYER, STEP, WANTED, WORLD } from './config.js';
import {
  buildCity, isOnRoad, isSand, isWater, nearestNode, neighboursOf,
  randomRoadPoint, randomSidewalkPoint, resolveBuildings, roadPath, zoneById,
} from './city.js';
import {
  MISSION_DEFS, currentMarker, missionDialogue, nextDialogueAfter, startMission,
} from './missions.js';

export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;
export const EVENT_MISSION_DONE = 4;
export const EVENT_MISSION_FAILED = 8;
export const EVENT_STORY_DONE = 16;

const CAR_COLORS = ['#e8452c', '#2c7be8', '#e8c82c', '#7fd08a', '#c97fd0', '#e8e8e8', '#3aa6a0', '#e88a2c'];
const CAR_KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sport'];
const TRAFFIC_TARGET = 12;
const PARKED_TARGET = 9;
const PED_TARGET = 24;

let nextId = 1;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function makeCar(rng, x, y, kind, driver) {
  return {
    id: nextId,
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    color: kind === 'police' ? '#e8e8e8' : rng.pick(CAR_COLORS),
    kind,
    driver, // 'traffic' | 'parked' | 'player' | 'police' | 'leaving'
    owner: driver === 'player' ? 'player' : null,
    node: nearestNode(x, y),
    path: null, // waypoints from roadPath, followed in order
    pathI: 0,
    repath: 0, // seconds until the police rebuild their route
    hp: 3,
    smoking: false,
    brake: 0,
    skid: 0,
  };
}

function makePed(rng, x, y, kind) {
  return {
    id: nextId,
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: kind === 'cop' ? 192 : rng.range(45, 75),
    kind, // 'walk' | 'flee' | 'cop' | 'down'
    target: null,
    down: 0,
    punchCd: 0,
    color: kind === 'cop' ? '#1d3a8a' : rng.pick(['#e86a6a', '#6a9fe8', '#e8c86a', '#7fd08a', '#c97fd0', '#e8e8e8']),
  };
}

export function createWorld(rng) {
  const city = buildCity(rng);
  const state = {
    rng, city,
    time: 0,
    cash: 0,
    health: PLAYER.health,
    ammo: PLAYER.startAmmo,
    wanted: 0,
    quietTime: 0,
    crimeCooldown: 0,
    bustHold: 0,
    player: {
      x: 0, y: 0, angle: -Math.PI / 2, onFoot: true, car: null,
      speed: 0, punchCd: 0, gunCd: 0, invuln: 0,
    },
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    skids: [],
    floaters: [],
    missions: {
      defs: MISSION_DEFS, index: 0, step: 0, collected: 0,
      timer: 0, active: false, banner: null, failed: false,
    },
    missionsDone: [],
    storyDone: false,
    nextMissionAtGarage: false,
    dialogue: null, // { title, lines, t }
    toast: null, // { text, t }
    stats: { carsStolen: 0, pedsDown: 0, copsDown: 0 },
    cam: { x: 0, y: 0 },
    shake: 0,
    spawnTimer: 0,
    sirenNear: false,
  };

  function say(title, lines) {
    state.dialogue = { title, lines, t: 0, shown: 0 };
  }

  function toast(text) {
    state.toast = { text, t: 0 };
  }

  function floater(x, y, text, color) {
    state.floaters.push({ x, y, text, color: color || '#f4f1e6', t: 0 });
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rng.range(0.25, 0.6), maxLife: 0.6,
        color, size: rng.range(2, 5),
      });
    }
  }

  function addWanted(n, audio) {
    if (state.wanted >= WANTED.max) return;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.quietTime = 0;
    if (audio) audio.siren(true);
  }

  function spawnTrafficCar(farFromPlayer) {
    const p = randomRoadPoint(rng);
    if (farFromPlayer && dist2(p.x, p.y, state.player.x, state.player.y) < 500 * 500) return;
    const kind = rng.pick(CAR_KINDS);
    const car = makeCar(rng, p.x, p.y, kind, 'traffic');
    car.speed = CAR.trafficSpeed * rng.range(0.7, 1);
    state.cars.push(car);
  }

  function spawnParkedCar() {
    const p = randomRoadPoint(rng);
    if (dist2(p.x, p.y, state.player.x, state.player.y) < 300 * 300) return;
    const car = makeCar(rng, p.x, p.y, rng.pick(CAR_KINDS), 'parked');
    car.angle = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    state.cars.push(car);
  }

  function spawnPed() {
    const p = randomSidewalkPoint(rng);
    if (dist2(p.x, p.y, state.player.x, state.player.y) < 300 * 300) return;
    state.peds.push(makePed(rng, p.x, p.y, 'walk'));
  }

  function spawnPolice() {
    const p = randomRoadPoint(rng);
    // Police arrive from a road point away from the player.
    if (dist2(p.x, p.y, state.player.x, state.player.y) < 650 * 650) return false;
    const car = makeCar(rng, p.x, p.y, 'police', 'police');
    car.speed = CAR.policeSpeed * 0.7;
    state.cars.push(car);
    return true;
  }

  function spawnPickup(kind, x, y) {
    state.pickups.push({ kind, x, y, t: 0 });
  }

  function reset(newGame) {
    state.time = 0;
    state.cash = 0;
    state.health = PLAYER.health;
    state.ammo = PLAYER.startAmmo;
    state.wanted = 0;
    state.quietTime = 0;
    state.crimeCooldown = 0;
    state.bustHold = 0;
    state.cars = [];
    state.peds = [];
    state.pickups = [];
    state.particles = [];
    state.skids = [];
    state.floaters = [];
    state.missionsDone = [];
    state.storyDone = false;
    state.nextMissionAtGarage = false;
    state.dialogue = null;
    state.toast = null;
    state.stats = { carsStolen: 0, pedsDown: 0, copsDown: 0 };
    state.shake = 0;
    const garage = zoneById(city, 'garage');
    state.player.x = garage.x;
    state.player.y = garage.y + 40;
    state.player.angle = -Math.PI / 2;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.speed = 0;
    state.player.punchCd = 0;
    state.player.gunCd = 0;
    state.player.invuln = 0;
    state.cam.x = state.player.x;
    state.cam.y = state.player.y;
    for (let i = 0; i < TRAFFIC_TARGET; i += 1) spawnTrafficCar(false);
    for (let i = 0; i < PARKED_TARGET; i += 1) spawnParkedCar();
    // One car is always waiting by the garage: the first job is stealing a
    // car, and the player should not have to hike across town to start it.
    // Both sit on the roads by the intersection, a short walk away.
    const firstCar = makeCar(rng, 600, 770, 'sedan', 'parked');
    firstCar.angle = Math.PI / 2;
    state.cars.push(firstCar);
    const secondCar = makeCar(rng, 770, 600, 'sport', 'parked');
    secondCar.angle = 0;
    state.cars.push(secondCar);
    for (let i = 0; i < PED_TARGET; i += 1) spawnPed();
    spawnPickup('health', zoneById(city, 'clinic').x + 60, zoneById(city, 'clinic').y);
    spawnPickup('ammo', zoneById(city, 'ironworks').x + 60, zoneById(city, 'ironworks').y);
    if (newGame) {
      state.missions = {
        defs: MISSION_DEFS, index: 0, step: 0, collected: 0,
        timer: 0, active: false, banner: null, failed: false,
      };
      const def = startMission(state.missions, 0);
      say(def.title, missionDialogue('intro'));
    }
  }

  function nearestCar(x, y, maxD) {
    let best = null;
    let bestD = maxD * maxD;
    for (const car of state.cars) {
      const d = dist2(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function tryInteract(audio) {
    const p = state.player;
    if (!p.onFoot) {
      // Get out of the car, beside it.
      const car = p.car;
      if (!car) return;
      p.onFoot = true;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
      p.angle = car.angle;
      car.driver = 'parked';
      p.car = null;
      if (audio) audio.click();
      return;
    }
    const car = nearestCar(p.x, p.y, 60);
    if (!car) return;
    if (car.driver === 'police') return; // a cop car is never yours to take
    p.onFoot = false;
    p.car = car;
    car.driver = 'player';
    p.angle = car.angle;
    if (car.owner !== 'player') {
      car.owner = 'player';
      state.stats.carsStolen += 1;
      addWanted(WANTED.stealCar, audio);
      toast('Car stolen — the law noticed');
      if (audio) audio.crash(0.3);
    } else if (audio) audio.click();
    checkMissionStep('steal', audio);
  }

  function tryPunch(audio) {
    const p = state.player;
    if (!p.onFoot || p.punchCd > 0) return;
    p.punchCd = PLAYER.punchCooldown;
    if (audio) audio.punch();
    const hx = p.x + Math.cos(p.angle) * 26;
    const hy = p.y + Math.sin(p.angle) * 26;
    for (const ped of state.peds) {
      if (ped.kind === 'down') continue;
      if (dist2(hx, hy, ped.x, ped.y) < 30 * 30) {
        downPed(ped, audio, ped.kind === 'cop' ? 'cop' : 'ped');
        burst(ped.x, ped.y, '#ffffff', 6, 120);
        return;
      }
    }
  }

  function tryShoot(aim, audio) {
    const p = state.player;
    if (!p.onFoot || p.gunCd > 0 || state.ammo <= 0) return;
    p.gunCd = PLAYER.gunCooldown;
    state.ammo -= 1;
    if (audio) audio.shot();
    burst(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, '#ffd23e', 5, 200);
    // Find the closest ped or car near the aim line.
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    let best = null;
    let bestT = PLAYER.gunRange;
    for (const ped of state.peds) {
      if (ped.kind === 'down') continue;
      const rx = ped.x - p.x;
      const ry = ped.y - p.y;
      const t = rx * dx + ry * dy;
      if (t < 10 || t > PLAYER.gunRange) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < 16 && t < bestT) {
        bestT = t;
        best = { kind: 'ped', ped };
      }
    }
    for (const car of state.cars) {
      if (car.driver === 'player') continue;
      const rx = car.x - p.x;
      const ry = car.y - p.y;
      const t = rx * dx + ry * dy;
      if (t < 10 || t > PLAYER.gunRange) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < 20 && t < bestT) {
        bestT = t;
        best = { kind: 'car', car };
      }
    }
    if (!best) return;
    if (best.kind === 'ped') {
      downPed(best.ped, audio, best.ped.kind === 'cop' ? 'cop' : 'ped');
      burst(best.ped.x, best.ped.y, '#ff5a4e', 10, 160);
    } else {
      best.car.hp -= 1;
      burst(best.car.x, best.car.y, '#ffb347', 8, 180);
      if (best.car.hp <= 0) {
        best.car.smoking = true;
        best.car.driver = 'parked';
        best.car.speed = 0;
        if (best.car.driver === 'traffic' || true) {
          // The driver bails out and runs.
          const d = makePed(rng, best.car.x, best.car.y, 'flee');
          state.peds.push(d);
        }
        addWanted(WANTED.shoot, audio);
      } else {
        addWanted(WANTED.shoot, audio);
      }
    }
  }

  function downPed(ped, audio, what) {
    ped.kind = 'down';
    ped.down = 6;
    if (what === 'cop') {
      state.stats.copsDown += 1;
      addWanted(WANTED.killCop, audio);
      floater(ped.x, ped.y, 'Cop down!', '#7fb8ff');
    } else {
      state.stats.pedsDown += 1;
      addWanted(WANTED.hitPed, audio);
    }
  }

  function checkMissionStep(kind, audio) {
    const m = state.missions;
    if (!m.active || m.index < 0) return;
    const def = MISSION_DEFS[m.index];
    const step = def.steps[m.step];
    if (!step || step.type !== kind) return;
    advanceStep(audio);
  }

  function advanceStep(audio) {
    const m = state.missions;
    const def = MISSION_DEFS[m.index];
    m.step += 1;
    m.collected = 0;
    if (m.step >= def.steps.length) {
      completeMission(audio);
    } else if (audio) audio.pickup();
  }

  function completeMission(audio) {
    const m = state.missions;
    const def = MISSION_DEFS[m.index];
    state.cash += def.reward;
    state.missionsDone.push(def.id);
    floater(state.player.x, state.player.y - 30, `+$${def.reward}`, '#7fe08a');
    if (audio) {
      audio.mission();
      audio.cash();
    }
    const done = m.index;
    m.active = false;
    m.index = -1;
    if (done >= MISSION_DEFS.length - 1) {
      state.storyDone = true;
      say('Solmar Is Yours', nextDialogueAfter(done));
      state.nextMissionAtGarage = false;
    } else {
      say('Mission Complete', nextDialogueAfter(done));
      state.nextMissionAtGarage = true;
    }
    saveSoon();
  }

  let saveTimer = -1;
  function saveSoon() {
    saveTimer = 1.5;
  }

  function failMission() {
    const m = state.missions;
    m.active = false;
    m.failed = true;
    toast('Mission failed — head to the garage to try again');
    state.nextMissionAtGarage = true;
  }

  function startNextMission(audio) {
    const m = state.missions;
    const next = state.missionsDone.length;
    if (next >= MISSION_DEFS.length) return;
    const def = startMission(m, next);
    if (def.wantedOnStart) {
      state.wanted = def.wantedOnStart;
      state.quietTime = 0;
    }
    if (def.steps[0].type === 'collect') {
      for (const pt of def.steps[0].points) {
        spawnPickup(next === 4 ? 'crate' : 'package', pt.x, pt.y);
      }
    }
    say(def.title, []);
    if (audio) audio.mission();
    state.nextMissionAtGarage = false;
  }

  function stepPlayer(ctrl, dt, audio) {
    const p = state.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.gunCd = Math.max(0, p.gunCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (ctrl.actions && (ctrl.actions & 4)) tryInteract(audio); // E
    if (ctrl.actions && (ctrl.actions & 8)) tryPunch(audio); // Space
    if (ctrl.aim) p.angle = Math.atan2(ctrl.aim.y - p.y, ctrl.aim.x - p.x);
    if (ctrl.mouseDown) tryShoot(ctrl.aim, audio);

    if (p.onFoot) {
      const ax = ctrl.axes.x;
      const ay = ctrl.axes.y;
      const len = Math.hypot(ax, ay) || 1;
      const slow = isSand(p.x, p.y) ? 0.7 : 1;
      const speed = PLAYER.walkSpeed * slow;
      p.x += (ax / len) * speed * dt * (ax || ay ? 1 : 0);
      p.y += (ay / len) * speed * dt * (ax || ay ? 1 : 0);
      if (ax || ay) p.angle = Math.atan2(ay, ax);
      p.speed = (ax || ay) ? speed : 0;
      const fixed = resolveBuildings(state.city, p.x, p.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      p.x = Math.max(20, Math.min(WORLD.size - 20, p.x));
      p.y = Math.max(140, Math.min(WORLD.waterY - 12, p.y));
    } else {
      const car = p.car;
      if (!car) {
        p.onFoot = true;
        return;
      }
      const ax = ctrl.axes.y; // W/S: forward/back
      const steer = ctrl.axes.x; // A/D
      const forward = -ax; // W is up the screen: forward
      if (forward > 0) car.speed += CAR.accel * dt;
      else if (forward < 0) {
        if (car.speed > 5) car.speed -= CAR.brake * dt;
        else car.speed -= CAR.reverseAccel * dt;
      } else {
        car.speed -= Math.sign(car.speed) * 140 * dt;
        if (Math.abs(car.speed) < 4) car.speed = 0;
      }
      car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
      const speedFactor = Math.min(1, Math.abs(car.speed) / 160);
      car.angle += steer * CAR.turnRate * speedFactor * dt * Math.sign(car.speed || 1);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const fixed = resolveBuildings(state.city, nx, ny, CAR.radius);
      if (fixed.x !== nx || fixed.y !== ny) {
        if (Math.abs(car.speed) > 180) {
          if (audio) audio.crash(Math.abs(car.speed) / CAR.maxSpeed);
          burst(car.x, car.y, '#ffb347', 10, 200);
          state.shake = Math.min(10, state.shake + 4);
        }
        car.speed *= 0.45;
      }
      car.x = Math.max(20, Math.min(WORLD.size - 20, fixed.x));
      car.y = Math.max(140, Math.min(WORLD.waterY - 14, fixed.y));
      p.x = car.x;
      p.y = car.y;
      p.speed = Math.abs(car.speed);
      if (Math.abs(car.speed) > 240 && steer !== 0) {
        car.skid += dt;
        if (car.skid > 0.05) {
          car.skid = 0;
          const bx = car.x - Math.cos(car.angle) * 20;
          const by = car.y - Math.sin(car.angle) * 20;
          state.skids.push({ x1: bx, y1: by, x2: bx, y2: by, life: 2.2 });
        }
      }
      if (audio) audio.engine(Math.abs(car.speed) / CAR.maxSpeed, true);
    }
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.driver === 'player' || car.driver === 'parked') continue;
      if (car.driver === 'leaving') {
        // Drive away from the player and vanish.
        const away = angleTo(state.player.x, state.player.y, car.x, car.y);
        car.angle += angleDiff(away, car.angle) * Math.min(1, 2 * dt);
        car.speed = Math.min(car.speed + 200 * dt, CAR.trafficSpeed);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        continue;
      }
      if (car.driver === 'police') {
        stepPoliceCar(car, dt);
        continue;
      }
      // Traffic: follow the roads to its node, then pick a neighbouring one.
      if (!car.path || car.pathI >= car.path.length) {
        const options = neighboursOf(car.node).filter(
          (n) => !(Math.abs(n.x - car.x) < 1 && Math.abs(n.y - car.y) < 1),
        );
        car.node = rng.pick(options.length ? options : neighboursOf(car.node));
        car.path = roadPath(car.x, car.y, car.node.x, car.node.y);
        car.pathI = 0;
        if (car.path.length === 0) {
          // Already standing on the node: pick another one next step.
          car.path = null;
          continue;
        }
      }
      const wp = car.path[car.pathI];
      const d = Math.hypot(wp.x - car.x, wp.y - car.y);
      if (d < 40) {
        car.pathI += 1;
      } else {
        const want = angleTo(car.x, car.y, wp.x, wp.y);
        const diff = angleDiff(want, car.angle);
        car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      }
      // Slow down for the car ahead.
      let target = CAR.trafficSpeed;
      for (const other of state.cars) {
        if (other === car) continue;
        const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
        const side = Math.abs((other.x - car.x) * Math.sin(car.angle) - (other.y - car.y) * Math.cos(car.angle));
        if (ahead > 0 && ahead < 70 && side < 30) {
          target = Math.min(target, 40);
          break;
        }
      }
      car.speed += (target - car.speed) * Math.min(1, 1.6 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const fixed = resolveBuildings(state.city, car.x, car.y, CAR.radius);
      car.x = fixed.x;
      car.y = fixed.y;
    }
  }

  function stepPoliceCar(car, dt) {
    const p = state.player;
    const d = Math.hypot(p.x - car.x, p.y - car.y);
    let want;
    if (d < 150) {
      // Close enough for the final approach: straight at the player.
      want = angleTo(car.x, car.y, p.x, p.y);
    } else {
      // Follow the roads to the player's nearest intersection, re-planned
      // as the player moves, so the chase stays on the streets.
      car.repath -= dt;
      if (!car.path || car.pathI >= car.path.length || car.repath <= 0) {
        const node = nearestNode(p.x, p.y);
        car.path = roadPath(car.x, car.y, node.x, node.y);
        car.pathI = 0;
        car.repath = 1.5;
      }
      const wp = car.path ? car.path[car.pathI] : undefined;
      if (!wp) {
        want = angleTo(car.x, car.y, p.x, p.y);
      } else if (Math.hypot(wp.x - car.x, wp.y - car.y) < 40) {
        car.pathI += 1;
        want = car.angle;
      } else {
        want = angleTo(car.x, car.y, wp.x, wp.y);
      }
    }
    const diff = angleDiff(want, car.angle);
    car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    // Brake for a sharp turn, or the chase cuts the corner across a block;
    // brake early when the turn after this waypoint is sharp.
    let target = d > 60 ? CAR.policeSpeed : CAR.policeSpeed * 0.55;
    if (Math.abs(diff) > 0.7) target = Math.min(target, 210);
    const wp = car.path ? car.path[car.pathI] : undefined;
    const wp2 = car.path ? car.path[car.pathI + 1] : undefined;
    if (wp && wp2) {
      const leg2 = Math.atan2(wp2.y - wp.y, wp2.x - wp.x);
      const leg1 = Math.atan2(wp.y - car.y, wp.x - car.x);
      if (Math.abs(angleDiff(leg2, leg1)) > 0.5 && Math.hypot(wp.x - car.x, wp.y - car.y) < 230) {
        target = Math.min(target, 150);
      }
    }
    if (Math.abs(car.speed) < 25) car.stuck = (car.stuck || 0) + 1;
    else car.stuck = 0;
    if (car.stuck > 60) {
      car.reverse = 40;
      car.stuck = 0;
    }
    if (car.reverse > 0) {
      // Back out: reverse, steering the opposite way; the shared movement
      // below still moves the car, once, by the (negative) speed.
      car.reverse -= 1;
      car.speed = Math.max(-CAR.maxReverse, car.speed - CAR.reverseAccel * dt);
      car.angle -= Math.max(-3.2 * dt, Math.min(3.2 * dt, diff)) * 2;
    } else {
      car.speed += (target - car.speed) * Math.min(1, (target < car.speed ? 4 : 2) * dt);
    }
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const fixed = resolveBuildings(state.city, car.x, car.y, CAR.radius);
    if (fixed.x !== car.x || fixed.y !== car.y) car.speed *= 0.5;
    car.x = fixed.x;
    car.y = fixed.y;
    // Ram the player's car.
    if (!p.onFoot && p.car) {
      const pc = p.car;
      const cd = Math.hypot(pc.x - car.x, pc.y - car.y);
      if (cd < 46) {
        const push = angleTo(car.x, car.y, pc.x, pc.y);
        pc.x += Math.cos(push) * 30 * dt * 10;
        pc.y += Math.sin(push) * 30 * dt * 10;
        pc.speed *= 0.94;
        state.shake = Math.min(8, state.shake + 2);
        if (state.time - (car.lastRam || 0) > 1) {
          car.lastRam = state.time;
          burst(pc.x, pc.y, '#ffb347', 6, 140);
        }
      }
    }
    // Close enough to the player on foot: a cop gets out and chases.
    if (p.onFoot && d < 130 && state.peds.filter((q) => q.kind === 'cop').length < 3) {
      const cop = makePed(rng, car.x + 24, car.y, 'cop');
      state.peds.push(cop);
      car.driver = 'leaving';
      car.speed = 0;
    }
  }

  function stepPeds(dt, audio) {
    for (const ped of state.peds) {
      if (ped.kind === 'down') {
        ped.down -= dt;
        continue;
      }
      ped.punchCd = Math.max(0, ped.punchCd - dt);
      if (ped.kind === 'cop') {
        const p = state.player;
        const d = Math.hypot(p.x - ped.x, p.y - ped.y);
        if (!p.onFoot) {
          // The player got away in a car: the cop gives up and walks off.
          ped.kind = 'walk';
          ped.target = null;
          continue;
        }
        const want = angleTo(ped.x, ped.y, p.x, p.y);
        ped.angle = want;
        if (d > 26) {
          ped.x += Math.cos(want) * ped.speed * dt;
          ped.y += Math.sin(want) * ped.speed * dt;
        } else {
          state.bustHold += dt;
          if (ped.punchCd <= 0) {
            ped.punchCd = 0.8;
            state.health -= 8;
            burst(p.x, p.y, '#ff5a4e', 5, 120);
            state.shake = Math.min(8, state.shake + 3);
          }
        }
        const fixed = resolveBuildings(state.city, ped.x, ped.y, 10);
        ped.x = fixed.x;
        ped.y = fixed.y;
        continue;
      }
      if (ped.kind === 'flee') {
        const away = angleTo(state.player.x, state.player.y, ped.x, ped.y);
        ped.angle = away;
        ped.x += Math.cos(away) * 150 * dt;
        ped.y += Math.sin(away) * 150 * dt;
        const fixed = resolveBuildings(state.city, ped.x, ped.y, 10);
        ped.x = fixed.x;
        ped.y = fixed.y;
        continue;
      }
      // Walking: amble to a target on the sidewalk, then pick another.
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 24) {
        ped.target = randomSidewalkPoint(rng);
      }
      const want = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle = want;
      ped.x += Math.cos(want) * ped.speed * dt;
      ped.y += Math.sin(want) * ped.speed * dt;
      const fixed = resolveBuildings(state.city, ped.x, ped.y, 10);
      ped.x = fixed.x;
      ped.y = fixed.y;
    }
    // Clean up the down and the far away.
    state.peds = state.peds.filter((ped) => {
      if (ped.kind === 'down' && ped.down <= 0) return false;
      if (ped.kind !== 'cop' && dist2(ped.x, ped.y, state.player.x, state.player.y) > 1500 * 1500) return false;
      return true;
    });
  }

  function stepCarCollisions(dt, audio) {
    // Player car hitting pedestrians.
    const p = state.player;
    if (!p.onFoot && p.car && Math.abs(p.car.speed) > 120) {
      for (const ped of state.peds) {
        if (ped.kind === 'down') continue;
        if (dist2(p.car.x, p.car.y, ped.x, ped.y) < 34 * 34) {
          downPed(ped, audio, ped.kind === 'cop' ? 'cop' : 'ped');
          burst(ped.x, ped.y, '#ff5a4e', 12, 200);
          state.shake = Math.min(10, state.shake + 5);
          if (audio) audio.crash(0.5);
          p.car.speed *= 0.7;
        }
      }
    }
    // Cars bumping each other.
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 44) {
          const push = (44 - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          if (Math.abs(a.speed) > 200 || Math.abs(b.speed) > 200) {
            a.speed *= 0.8;
            b.speed *= 0.8;
          }
        }
      }
    }
  }

  function stepPickups(dt, audio) {
    const p = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      pk.t += dt;
      if (dist2(p.x, p.y, pk.x, pk.y) < 44 * 44) {
        if (pk.kind === 'health') {
          state.health = Math.min(PLAYER.health, state.health + 50);
          floater(pk.x, pk.y, '+50 HP', '#7fe08a');
          if (audio) audio.pickup();
        } else if (pk.kind === 'ammo') {
          state.ammo = Math.min(PLAYER.maxAmmo, state.ammo + 24);
          floater(pk.x, pk.y, '+24 ammo', '#ffd23e');
          if (audio) audio.pickup();
        } else if (pk.kind === 'cash') {
          state.cash += pk.amount || 50;
          floater(pk.x, pk.y, `+$${pk.amount || 50}`, '#7fe08a');
          if (audio) audio.cash();
        } else if (pk.kind === 'package' || pk.kind === 'crate') {
          const m = state.missions;
          if (m.active) {
            m.collected += 1;
            floater(pk.x, pk.y, pk.kind === 'crate' ? 'Crate secured' : 'Package secured', '#7fe08a');
            if (audio) audio.pickup();
            const def = MISSION_DEFS[m.index];
            const step = def.steps[m.step];
            if (step && step.type === 'collect' && m.collected >= step.points.length) advanceStep(audio);
          }
        }
        state.pickups.splice(i, 1);
      }
    }
  }

  function stepWanted(dt, audio) {
    state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);
    if (state.wanted > 0) {
      // Quiet while no cop can see the player: the heat fades.
      let seen = false;
      for (const car of state.cars) {
        if (car.driver === 'police' && dist2(car.x, car.y, state.player.x, state.player.y) < 520 * 520) {
          seen = true;
          break;
        }
      }
      if (!seen) {
        for (const ped of state.peds) {
          if (ped.kind === 'cop' && dist2(ped.x, ped.y, state.player.x, state.player.y) < 420 * 420) {
            seen = true;
            break;
          }
        }
      }
      if (seen) state.quietTime = 0;
      else {
        state.quietTime += dt;
        if (state.quietTime >= WANTED.decaySeconds) {
          state.wanted -= 1;
          state.quietTime = 0;
          toast(state.wanted > 0 ? 'Heat dying down…' : 'You lost them. Clean.');
        }
      }
      // Keep the right number of police on the streets.
      const wantCars = Math.min(state.wanted, 5);
      const have = state.cars.filter((c) => c.driver === 'police').length;
      if (have < wantCars && rng.chance(0.02)) spawnPolice();
      state.sirenNear = state.cars.some(
        (c) => c.driver === 'police' && dist2(c.x, c.y, state.player.x, state.player.y) < 700 * 700,
      );
      if (audio) audio.siren(state.sirenNear);
    } else if (audio) {
      audio.siren(false);
    }
    // Cops that have nothing to chase drive off.
    if (state.wanted === 0) {
      for (const car of state.cars) {
        if (car.driver === 'police') car.driver = 'leaving';
      }
      for (const ped of state.peds) {
        if (ped.kind === 'cop') ped.kind = 'walk';
      }
    }
  }

  function stepMissions(dt, audio) {
    const m = state.missions;
    const p = state.player;
    if (m.active && m.timer > 0) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission();
        return;
      }
    }
    // Starting the next job: walk into the garage marker.
    if (state.nextMissionAtGarage) {
      const g = zoneById(state.city, 'garage');
      if (dist2(p.x, p.y, g.x, g.y) < 80 * 80) startNextMission(audio);
    }
    if (!m.active || m.index < 0) return;
    const def = MISSION_DEFS[m.index];
    const step = def.steps[m.step];
    if (!step) return;
    if (step.type === 'goto') {
      const z = zoneById(state.city, step.zoneId);
      if (dist2(p.x, p.y, z.x, z.y) < 70 * 70) advanceStep(audio);
    } else if (step.type === 'evade') {
      if (state.wanted === 0) advanceStep(audio);
    }
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.t += dt;
      f.y -= 24 * dt;
      if (f.t > 1.6) state.floaters.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - 30 * dt);
  }

  function stepSpawns(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) return;
    state.spawnTimer = 1.5;
    const traffic = state.cars.filter((c) => c.driver === 'traffic').length;
    if (traffic < TRAFFIC_TARGET) spawnTrafficCar(true);
    const parked = state.cars.filter((c) => c.driver === 'parked').length;
    if (parked < PARKED_TARGET) spawnParkedCar();
    if (state.peds.filter((p) => p.kind === 'walk').length < PED_TARGET) spawnPed();
    // Far traffic and parked cars drift out of the world.
    state.cars = state.cars.filter((c) => {
      if (c.driver === 'player') return true;
      if (c.driver === 'leaving') return dist2(c.x, c.y, state.player.x, state.player.y) < 1600 * 1600;
      return dist2(c.x, c.y, state.player.x, state.player.y) < 1500 * 1500;
    });
  }

  function step(ctrl, dt, audio) {
    let events = 0;
    state.time += dt;
    if (state.dialogue) {
      state.dialogue.t += dt;
      if (state.dialogue.t > 6) state.dialogue = null;
    }
    if (state.toast) {
      state.toast.t += dt;
      if (state.toast.t > 3) state.toast = null;
    }
    if (saveTimer > 0) {
      saveTimer -= dt;
      if (saveTimer <= 0) state.saveRequested = true;
    }
    stepPlayer(ctrl, dt, audio);
    stepTraffic(dt);
    stepPeds(dt, audio);
    stepCarCollisions(dt, audio);
    stepPickups(dt, audio);
    stepWanted(dt, audio);
    stepMissions(dt, audio);
    stepParticles(dt);
    stepSpawns(dt);

    // Camera follows the player, leaning into the speed.
    const lookX = state.player.x + Math.cos(state.player.angle) * (state.player.onFoot ? 0 : state.player.speed * 0.25);
    const lookY = state.player.y + Math.sin(state.player.angle) * (state.player.onFoot ? 0 : state.player.speed * 0.25);
    state.cam.x += (lookX - state.cam.x) * Math.min(1, 4 * dt);
    state.cam.y += (lookY - state.cam.y) * Math.min(1, 4 * dt);

    // Busted: a cop held the player on foot.
    if (state.bustHold >= WANTED.bustSeconds) {
      events |= EVENT_BUSTED;
      state.bustHold = 0;
    } else if (state.player.onFoot) {
      const held = state.peds.some(
        (ped) => ped.kind === 'cop' && dist2(ped.x, ped.y, state.player.x, state.player.y) < 30 * 30,
      );
      if (!held) state.bustHold = Math.max(0, state.bustHold - dt * 2);
    }
    if (state.health <= 0) events |= EVENT_WASTED;
    if (state.storyDone && !state.storyAnnounced) {
      state.storyAnnounced = true;
      events |= EVENT_STORY_DONE;
    }
    return events;
  }

  function applyBustedOrWasted() {
    const lost = Math.floor(state.cash * WANTED.fineShare);
    state.cash -= lost;
    state.health = 50;
    state.ammo = Math.max(12, state.ammo);
    state.wanted = 0;
    state.bustHold = 0;
    for (const car of state.cars) {
      if (car.driver === 'police') car.driver = 'leaving';
    }
    for (const ped of state.peds) {
      if (ped.kind === 'cop') ped.kind = 'walk';
    }
    const garage = zoneById(state.city, 'garage');
    state.player.x = garage.x;
    state.player.y = garage.y + 40;
    state.player.angle = -Math.PI / 2;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.speed = 0;
    state.cam.x = state.player.x;
    state.cam.y = state.player.y;
    return lost;
  }

  function applySave(data) {
    state.cash = data.cash;
    state.missionsDone = data.missionsDone.slice();
    state.storyDone = !!data.storyDone;
    state.player.x = data.player.x;
    state.player.y = data.player.y;
    state.player.onFoot = true;
    state.player.car = null;
    state.cam.x = data.player.x;
    state.cam.y = data.player.y;
    if (state.missionsDone.length >= MISSION_DEFS.length) {
      state.missions.index = -1;
      state.missions.active = false;
    } else {
      state.missions.index = state.missionsDone.length;
      state.missions.active = false;
      state.nextMissionAtGarage = true;
    }
  }

  reset(true);

  return {
    state,
    reset,
    step,
    say,
    toast,
    floater,
    burst,
    addWanted,
    spawnPolice,
    nearestCar,
    tryInteract,
    currentMarker: () => currentMarker(state.missions, city),
    applyBustedOrWasted,
    applySave,
    startNextMission,
  };
}

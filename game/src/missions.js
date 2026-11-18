// Mara's jobs: five missions that tell Rook's story in Solmar City. Each one is
// a short list of steps; a step is a place to reach, a thing to collect, a car
// to steal, or a wanted level to lose. Finishing a mission pays cash and opens
// the next one; finishing all five ends the story and leaves the city open.

import { zoneById } from './city.js';

const DIALOGUE = {
  intro: [
    "Mara: Rook. You're back in Solmar. Good — I got work, if your hands still remember a wheel.",
    'Mara: First job is easy. Steal any car on the street and bring it to my garage. Try not to make a scene.',
  ],
  m1done: [
    "Mara: Clean. That one's already sold. Here's your cut.",
    'Mara: Next: three packages stashed around town. Pick them up, bring them to the Anchor. Clock is running.',
  ],
  m2done: [
    "Mara: Delivered, no questions. You're warming up, Rook.",
    "Mara: The harbour crew needs a driver. Get to the gate in 90 seconds — and the cops will be watching.",
  ],
  m3done: [
    "Mara: You drive like the devil owes you money. I like it.",
    "Mara: One problem: you're hot. Three stars. Lose them before you come back — lay low, stay out of sight.",
  ],
  m4done: [
    'Mara: Cool as the sea. Last job, and it pays like one.',
    "Mara: A crate at the harbour. Grab it, bring it to the Old Cannery, and don't let the law keep it.",
  ],
  m5done: [
    "Mara: It's done. The crate, the cash, the whole town talking about it.",
    "Mara: Solmar is yours now, Rook. Drive it like you own it — because tonight, you do.",
  ],
};

function stepGoto(zoneId, label, hint) {
  return { type: 'goto', zoneId, label, hint };
}
function stepSteal(label, hint) {
  return { type: 'steal', label, hint };
}
function stepCollect(points, label, hint) {
  return { type: 'collect', points, label, hint };
}
function stepEvade(label, hint) {
  return { type: 'evade', label, hint };
}

export const MISSION_DEFS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 200,
    steps: [
      stepSteal('Steal any car', 'Walk up to a car and press E'),
      stepGoto('garage', 'Deliver it to Rook\'s Garage', 'Follow the yellow marker'),
    ],
  },
  {
    id: 'package-run',
    title: 'Package Run',
    reward: 400,
    timeLimit: 150,
    steps: [
      stepCollect(
        [{ x: 1000, y: 2200 }, { x: 2200, y: 1800 }, { x: 600, y: 2600 }],
        'Collect the 3 packages (0/3)',
        'Grab them on foot or from a car',
      ),
      stepGoto('bar', 'Deliver to The Rusty Anchor', 'Mara is waiting'),
    ],
  },
  {
    id: 'hot-lap',
    title: 'Hot Lap',
    reward: 600,
    timeLimit: 90,
    wantedOnStart: 2,
    steps: [
      stepGoto('harbour', 'Reach the Harbour Gate in 90 seconds', 'Drive fast — the clock is running'),
    ],
  },
  {
    id: 'cool-down',
    title: 'Cool Down',
    reward: 500,
    timeLimit: 90,
    steps: [
      stepEvade('Lose the cops — get to 0 stars', 'Stay out of sight and stop making trouble'),
    ],
  },
  {
    id: 'harbour-job',
    title: 'The Harbour Job',
    reward: 1000,
    wantedOnStart: 3,
    steps: [
      stepCollect([{ x: 500, y: 300 }], 'Grab the crate at the harbour (0/1)', 'It is sitting by the containers'),
      stepGoto('warehouse', 'Deliver it to the Old Cannery', 'Three stars and counting — drive'),
    ],
  },
];

export function createMissions(city) {
  return {
    defs: MISSION_DEFS,
    index: 0, // which mission is current; -1 when the story is done
    step: 0,
    collected: 0,
    timer: 0,
    active: false,
    banner: null, // { title, lines, t } shown as dialogue
    failed: false,
  };
}

/** The marker the player should head for right now, or null. */
export function currentMarker(missions, city) {
  if (!missions.active || missions.index < 0) return null;
  const def = MISSION_DEFS[missions.index];
  const step = def.steps[missions.step];
  if (!step) return null;
  if (step.type === 'goto') {
    const z = zoneById(city, step.zoneId);
    return { x: z.x, y: z.y, label: z.name };
  }
  if (step.type === 'collect') {
    const p = step.points[missions.collected];
    return p ? { x: p.x, y: p.y, label: 'Package' } : null;
  }
  return null;
}

export function currentObjective(missions) {
  if (!missions.active || missions.index < 0) return null;
  const def = MISSION_DEFS[missions.index];
  const step = def.steps[missions.step];
  if (!step) return null;
  if (step.type === 'collect') {
    return step.label.replace(/\(\d+\/\d+\)/, `(${missions.collected}/${step.points.length})`);
  }
  return step.label;
}

export function startMission(missions, index) {
  const def = MISSION_DEFS[index];
  missions.index = index;
  missions.step = 0;
  missions.collected = 0;
  missions.timer = def.timeLimit || 0;
  missions.active = true;
  missions.failed = false;
  missions.banner = { title: def.title, lines: DIALOGUE.intro && index === 0 ? DIALOGUE.intro : [], t: 0 };
  return def;
}

export function missionDialogue(key) {
  return DIALOGUE[key] || [];
}

export function nextDialogueAfter(index) {
  return [DIALOGUE.m1done, DIALOGUE.m2done, DIALOGUE.m3done, DIALOGUE.m4done, DIALOGUE.m5done][index] || [];
}

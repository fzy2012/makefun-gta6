// Solmar Heat — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play, paused, busted and wasted screens.
//
// ?seed=N fixes the city and the traffic. ?shot=start|chase|mission|drive
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createRandom } from './rng.js';
import {
  createWorld, EVENT_BUSTED, EVENT_MISSION_DONE, EVENT_MISSION_FAILED,
  EVENT_STORY_DONE, EVENT_WASTED,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WASTED,
} from './render.js';
import { drawBusted, drawHUD, drawPaused, drawTitle } from './hud.js';
import { createAudio } from './audio.js';
import { clearSave, hasSave, loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const state = world.state;

function announce(message) {
  status.textContent = message;
}

function refreshOverlays() {
  state.marker = world.currentMarker();
  const p = state.player;
  if (p.onFoot) {
    const car = world.nearestCar(p.x, p.y, 60);
    state.prompt = car ? (car.owner === 'player' ? 'Press E — Get in your car' : 'Press E — Steal this car') : null;
  } else {
    state.prompt = 'Press E — Get out';
  }
}

function paint(screen) {
  refreshOverlays();
  renderer.drawWorld(state);
  if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHUD(canvas.getContext('2d'), state);
  if (screen === SCREEN_TITLE) drawTitle(canvas.getContext('2d'), hasSave());
  if (screen === SCREEN_PAUSED) drawPaused(canvas.getContext('2d'));
  if (screen === SCREEN_BUSTED) drawBusted(canvas.getContext('2d'), state.lastLost || 0, false);
  if (screen === SCREEN_WASTED) drawBusted(canvas.getContext('2d'), state.lastLost || 0, true);
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paintOnce() {
    paint(scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintOnce);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintOnce);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function startNewGame() {
    world.reset(true);
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    announce('Playing. Mara\'s first job: steal a car and bring it to the garage.');
  }

  function continueGame() {
    const data = loadGame();
    if (!data) return;
    world.reset(false);
    world.applySave(data);
    state.dialogue = null;
    state.toast = null;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    announce('Welcome back to Solmar. Your jobs are waiting at the garage.');
  }

  function handleEvents(events) {
    if (events & EVENT_BUSTED) {
      state.lastLost = world.applyBustedOrWasted();
      saveGame(state);
      audio.busted();
      audio.siren(false);
      audio.engine(0, false);
      screen = SCREEN_BUSTED;
      announce('Busted. The police took their cut.');
    } else if (events & EVENT_WASTED) {
      state.lastLost = world.applyBustedOrWasted();
      saveGame(state);
      audio.busted();
      audio.siren(false);
      audio.engine(0, false);
      screen = SCREEN_WASTED;
      announce('Wasted. The clinic patched you up.');
    }
    if (events & EVENT_MISSION_DONE) announce('Mission complete.');
    if (events & EVENT_MISSION_FAILED) announce('Mission failed. Head to the garage to try again.');
    if (events & EVENT_STORY_DONE) announce('Story complete. Solmar is yours.');
  }

  function buildCtrl() {
    const axes = input.axes();
    const mouse = input.mouse();
    const aim = state.player.onFoot
      ? { x: state.cam.x - 640 + mouse.x, y: state.cam.y - 360 + mouse.y }
      : null;
    return {
      axes,
      actions: input.takeActions(),
      aim,
      mouseDown: input.mouseDown(),
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (input.consume('KeyC') && screen === SCREEN_TITLE && hasSave()) {
      continueGame();
      return;
    }
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        startNewGame();
        return;
      }
      // Attract mode: the city lives behind the title.
      while (accumulator >= STEP) {
        world.step({ axes: { x: 0, y: 0 }, actions: 0, aim: null, mouseDown: false }, STEP, null);
        accumulator -= STEP;
      }
      paint(SCREEN_TITLE);
      return;
    }

    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      paint(SCREEN_PAUSED);
      accumulator = 0;
      return;
    }

    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Back on the street.');
      }
      paint(screen);
      accumulator = 0;
      return;
    }

    // Playing.
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      saveGame(state);
      audio.engine(0, false);
      announce('Paused. Progress saved.');
      paint(SCREEN_PAUSED);
      accumulator = 0;
      return;
    }
    let events = 0;
    let firstStep = true;
    while (accumulator >= STEP) {
      const ctrl = buildCtrl();
      // One-shot actions fire on the first step of the frame only: a press
      // must never get in and straight back out of a car in one frame.
      ctrl.actions = firstStep ? actions : 0;
      firstStep = false;
      events |= world.step(ctrl, STEP, audio);
      accumulator -= STEP;
      if (events & (EVENT_BUSTED | EVENT_WASTED)) break;
    }
    if (state.saveRequested) {
      state.saveRequested = false;
      saveGame(state);
    }
    handleEvents(events);
    paint(SCREEN_PLAY);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(state);
      announce('Paused.');
    }
  });

  announce('Solmar Heat. Press Enter to start, C to continue your last run.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

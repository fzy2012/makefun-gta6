// Every sound is synthesised with WebAudio: no audio files, no network.
// The engine hum follows the car's speed, the siren wails while the police
// are near, and a small step sequencer plays a bassline under the game.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = null;
  let muted = false;
  try {
    muted = window.localStorage.getItem('solmar-heat.muted') === '1';
  } catch {
    muted = false;
  }

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  // A short funk bassline: A minor, 104 BPM, kick on the beat, hat off it.
  const BASSLINE = [55, 0, 55, 65.41, 0, 55, 82.41, 0, 49, 0, 49, 55, 0, 65.41, 73.42, 0];
  const STEP_SEC = 60 / 104 / 2;
  let musicStep = 0;
  let nextStepTime = 0;

  function scheduleMusic() {
    if (!ctx || muted) return;
    while (nextStepTime < ctx.currentTime + 0.12) {
      const step = musicStep % 16;
      const t = nextStepTime - ctx.currentTime;
      if (step % 4 === 0) noise(0.09, 0.5, 300, Math.max(0, t)); // kick
      if (step % 4 === 2) noise(0.03, 0.12, 6000, Math.max(0, t)); // hat
      const note = BASSLINE[step];
      if (note > 0) tone(note, STEP_SEC * 0.9, 'triangle', 0.32, Math.max(0, t));
      musicStep += 1;
      nextStepTime += STEP_SEC;
    }
  }

  return {
    unlock,
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem('solmar-heat.muted', muted ? '1' : '0');
      } catch {
        // ignore
      }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      nextStepTime = ctx.currentTime + 0.05;
      musicTimer = window.setInterval(scheduleMusic, 40);
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    /** Called every frame with the player's speed: the engine follows it. */
    engine(speed01, on) {
      if (!ensure()) return;
      if (!on) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = 0.05 + speed01 * 0.06;
    },
    siren(on) {
      if (!ensure()) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.9;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 160;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenOsc.frequency.value = 820;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      }
      sirenGain.gain.value = 0.045;
    },
    shot() {
      noise(0.14, 0.5, 1800);
      tone(180, 0.08, 'square', 0.2, 0, 60);
    },
    punch() {
      noise(0.08, 0.35, 900);
    },
    crash(strength) {
      noise(0.25, Math.min(0.6, 0.2 + strength * 0.4), 500);
      tone(70, 0.2, 'sine', 0.35, 0, 40);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.25);
      tone(990, 0.14, 'sine', 0.25, 0.08);
    },
    cash() {
      tone(880, 0.08, 'triangle', 0.25);
      tone(1174, 0.08, 'triangle', 0.25, 0.07);
      tone(1568, 0.16, 'triangle', 0.25, 0.14);
    },
    mission() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.28, i * 0.1));
    },
    busted() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.2, i * 0.14));
    },
    click() {
      tone(1200, 0.04, 'sine', 0.15);
    },
  };
}

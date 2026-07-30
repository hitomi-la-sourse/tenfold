"use client";

export type GameSound =
  | "select"
  | "confirm"
  | "card-play"
  | "turn-self"
  | "turn-opponent"
  | "draw"
  | "effect"
  | "spirit-swap"
  | "duel"
  | "win"
  | "lose"
  | "draw-result";

interface AudioGraph {
  context: AudioContext;
  master: GainNode;
  music: GainNode;
  effects: GainNode;
  reverb: ConvolverNode;
  reverbGain: GainNode;
}

interface ToneOptions {
  bus?: "music" | "effects";
  attack?: number;
  release?: number;
  type?: OscillatorType;
  endFrequency?: number;
  filterFrequency?: number;
  pan?: number;
  reverb?: number;
}

interface NoiseOptions {
  bus?: "music" | "effects";
  filterType?: BiquadFilterType;
  filterFrequency?: number;
  endFrequency?: number;
  attack?: number;
  pan?: number;
  reverb?: number;
}

const MUSIC_STEP_SECONDS = 60 / 72 / 2;
const MUSIC_LOOKAHEAD_SECONDS = 1.25;
const MUSIC_CHORDS = [
  [50, 57, 62, 65],
  [46, 53, 58, 62],
  [43, 50, 55, 58],
  [45, 52, 57, 61],
] as const;
const MUSIC_MELODY = [74, 69, 72, 77, 74, 69, 65, 72, 70, 65, 69, 74, 70, 65, 62, 69] as const;

let graph: AudioGraph | null = null;
let musicRequested = false;
let musicTimer: number | null = null;
let nextMusicTime = 0;
let musicStep = 0;
let unlockListenersInstalled = false;

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function createImpulse(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const decay = (1 - index / length) ** 2.8;
      data[index] = (Math.random() * 2 - 1) * decay;
    }
  }
  return impulse;
}

function ensureAudioGraph(): AudioGraph | null {
  if (graph) return graph;
  if (typeof window === "undefined" || !window.AudioContext) return null;

  const context = new window.AudioContext();
  const master = context.createGain();
  const music = context.createGain();
  const effects = context.createGain();
  const reverb = context.createConvolver();
  const reverbGain = context.createGain();
  const compressor = context.createDynamicsCompressor();

  master.gain.value = 0.82;
  music.gain.value = 0.0001;
  effects.gain.value = 0.72;
  reverb.buffer = createImpulse(context, 2.4);
  reverbGain.gain.value = 0.26;
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.22;

  music.connect(master);
  effects.connect(master);
  reverb.connect(reverbGain).connect(master);
  master.connect(compressor).connect(context.destination);

  graph = { context, master, music, effects, reverb, reverbGain };
  return graph;
}

function connectVoice(
  source: AudioNode,
  destination: AudioNode,
  reverbAmount: number,
  pan: number,
): void {
  const current = graph;
  if (!current) return;
  const panner = current.context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  source.connect(panner).connect(destination);
  if (reverbAmount > 0) {
    const send = current.context.createGain();
    send.gain.value = reverbAmount;
    panner.connect(send).connect(current.reverb);
  }
}

function scheduleTone(
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  options: ToneOptions = {},
): void {
  const current = graph;
  if (!current) return;
  const { context } = current;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const attack = Math.min(options.attack ?? 0.012, duration * 0.4);
  const release = Math.min(options.release ?? Math.max(0.08, duration * 0.42), duration * 0.7);
  const stop = start + duration;
  const destination = options.bus === "music" ? current.music : current.effects;

  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, options.endFrequency),
      stop - 0.01,
    );
  }
  filter.type = "lowpass";
  filter.frequency.value = options.filterFrequency ?? 12000;
  filter.Q.value = 0.7;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + attack);
  envelope.gain.setValueAtTime(Math.max(0.0002, volume), Math.max(start + attack, stop - release));
  envelope.gain.exponentialRampToValueAtTime(0.0001, stop);

  oscillator.connect(filter).connect(envelope);
  connectVoice(envelope, destination, options.reverb ?? 0.18, options.pan ?? 0);
  oscillator.start(start);
  oscillator.stop(stop + 0.03);
}

function scheduleNoise(
  start: number,
  duration: number,
  volume: number,
  options: NoiseOptions = {},
): void {
  const current = graph;
  if (!current) return;
  const { context } = current;
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const attack = Math.min(options.attack ?? 0.008, duration * 0.35);
  const stop = start + duration;
  const destination = options.bus === "music" ? current.music : current.effects;

  source.buffer = buffer;
  filter.type = options.filterType ?? "bandpass";
  filter.frequency.setValueAtTime(options.filterFrequency ?? 1600, start);
  if (options.endFrequency) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, options.endFrequency), stop - 0.01);
  }
  filter.Q.value = options.filterType === "highpass" ? 0.4 : 1.2;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, stop);

  source.connect(filter).connect(envelope);
  connectVoice(envelope, destination, options.reverb ?? 0.08, options.pan ?? 0);
  source.start(start);
  source.stop(stop + 0.02);
}

function schedulePad(notes: readonly number[], start: number): void {
  notes.forEach((note, index) => {
    const frequency = midiToFrequency(note);
    const pan = (index - (notes.length - 1) / 2) * 0.24;
    scheduleTone(frequency, start, MUSIC_STEP_SECONDS * 15.6, 0.035, {
      bus: "music",
      type: index % 2 === 0 ? "triangle" : "sine",
      attack: 1.3,
      release: 2.2,
      filterFrequency: 1100 + index * 240,
      pan,
      reverb: 0.52,
    });
    scheduleTone(frequency / 2, start, MUSIC_STEP_SECONDS * 15.6, 0.016, {
      bus: "music",
      type: "sine",
      attack: 1.6,
      release: 2.4,
      filterFrequency: 520,
      pan: pan * 0.5,
      reverb: 0.34,
    });
  });
}

function scheduleMusicBeat(start: number, step: number): void {
  const phraseStep = step % 64;
  const chordIndex = Math.floor(phraseStep / 16);

  if (phraseStep % 16 === 0) {
    schedulePad(MUSIC_CHORDS[chordIndex]!, start);
  }

  if (phraseStep % 2 === 0) {
    const melodyNote = MUSIC_MELODY[(phraseStep / 2) % MUSIC_MELODY.length]!;
    scheduleTone(midiToFrequency(melodyNote), start, MUSIC_STEP_SECONDS * 1.55, 0.055, {
      bus: "music",
      type: "triangle",
      attack: 0.009,
      release: 0.48,
      filterFrequency: 3100,
      pan: phraseStep % 8 < 4 ? -0.32 : 0.32,
      reverb: 0.68,
    });
    scheduleTone(midiToFrequency(melodyNote + 12), start + 0.018, 0.12, 0.014, {
      bus: "music",
      type: "sine",
      attack: 0.006,
      release: 0.1,
      pan: phraseStep % 8 < 4 ? -0.2 : 0.2,
      reverb: 0.78,
    });
  }

  if (phraseStep % 8 === 0) {
    const bass = MUSIC_CHORDS[chordIndex]![0];
    scheduleTone(midiToFrequency(bass - 12), start, MUSIC_STEP_SECONDS * 3.6, 0.052, {
      bus: "music",
      type: "sine",
      attack: 0.035,
      release: 0.8,
      filterFrequency: 340,
      reverb: 0.16,
    });
    scheduleNoise(start, 0.42, 0.016, {
      bus: "music",
      filterType: "lowpass",
      filterFrequency: 180,
      endFrequency: 70,
      attack: 0.004,
      reverb: 0.08,
    });
  }

  if (phraseStep % 16 === 12) {
    scheduleTone(midiToFrequency(MUSIC_CHORDS[chordIndex]![3] + 12), start, 2.4, 0.024, {
      bus: "music",
      type: "sine",
      attack: 0.015,
      release: 1.9,
      filterFrequency: 5200,
      pan: chordIndex % 2 === 0 ? 0.62 : -0.62,
      reverb: 0.88,
    });
  }
}

function runMusicScheduler(): void {
  const current = graph;
  if (!current || !musicRequested || current.context.state !== "running") return;
  if (nextMusicTime < current.context.currentTime - 1) {
    nextMusicTime = current.context.currentTime + 0.08;
  }
  while (nextMusicTime < current.context.currentTime + MUSIC_LOOKAHEAD_SECONDS) {
    scheduleMusicBeat(nextMusicTime, musicStep);
    nextMusicTime += MUSIC_STEP_SECONDS;
    musicStep = (musicStep + 1) % 64;
  }
}

function beginMusicScheduler(): void {
  const current = graph;
  if (!current || !musicRequested || current.context.state !== "running") return;
  const now = current.context.currentTime;
  current.music.gain.cancelScheduledValues(now);
  current.music.gain.setValueAtTime(Math.max(0.0001, current.music.gain.value), now);
  current.music.gain.exponentialRampToValueAtTime(0.18, now + 1.8);
  if (musicTimer !== null) return;
  nextMusicTime = now + 0.08;
  musicStep = 0;
  runMusicScheduler();
  musicTimer = window.setInterval(runMusicScheduler, 240);
}

function removeUnlockListeners(): void {
  if (!unlockListenersInstalled || typeof window === "undefined") return;
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
  unlockListenersInstalled = false;
}

function unlockAudio(): void {
  const current = ensureAudioGraph();
  if (!current) return;
  void current.context
    .resume()
    .then(() => {
      removeUnlockListeners();
      if (musicRequested) beginMusicScheduler();
    })
    .catch(() => undefined);
}

function installUnlockListeners(): void {
  if (unlockListenersInstalled || typeof window === "undefined") return;
  unlockListenersInstalled = true;
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio);
}

export function startGameMusic(enabled: boolean): void {
  if (!enabled) {
    stopGameMusic();
    return;
  }
  musicRequested = true;
  const current = ensureAudioGraph();
  if (!current) return;
  if (current.context.state === "running") {
    beginMusicScheduler();
    return;
  }
  installUnlockListeners();
  void current.context
    .resume()
    .then(() => {
      if (musicRequested) beginMusicScheduler();
    })
    .catch(() => undefined);
}

export function stopGameMusic(): void {
  musicRequested = false;
  if (musicTimer !== null && typeof window !== "undefined") {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (!graph) return;
  const now = graph.context.currentTime;
  graph.music.gain.cancelScheduledValues(now);
  graph.music.gain.setValueAtTime(Math.max(0.0001, graph.music.gain.value), now);
  graph.music.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
}

function performSound(kind: GameSound, accent: number): void {
  const current = graph;
  if (!current) return;
  const now = current.context.currentTime + 0.012;

  if (kind === "select") {
    scheduleTone(660, now, 0.09, 0.11, { type: "sine", release: 0.07, reverb: 0.22 });
    scheduleTone(990, now + 0.035, 0.11, 0.065, {
      type: "triangle",
      release: 0.09,
      pan: 0.18,
      reverb: 0.38,
    });
    return;
  }

  if (kind === "confirm") {
    scheduleNoise(now, 0.36, 0.11, {
      filterType: "bandpass",
      filterFrequency: 420,
      endFrequency: 2600,
      pan: -0.16,
      reverb: 0.26,
    });
    scheduleTone(165, now, 0.34, 0.12, {
      type: "triangle",
      endFrequency: 82,
      filterFrequency: 720,
      release: 0.24,
      reverb: 0.12,
    });
    scheduleTone(520, now + 0.11, 0.28, 0.075, {
      type: "triangle",
      endFrequency: 780,
      pan: 0.18,
      reverb: 0.46,
    });
    return;
  }

  if (kind === "card-play") {
    const cardAccent = midiToFrequency(48 + Math.max(1, Math.min(10, accent)));
    scheduleNoise(now, 0.82, 0.16, {
      filterType: "bandpass",
      filterFrequency: 240,
      endFrequency: 5200,
      pan: -0.28,
      reverb: 0.36,
    });
    scheduleNoise(now + 0.08, 0.58, 0.07, {
      filterType: "highpass",
      filterFrequency: 2600,
      endFrequency: 8400,
      pan: 0.34,
      reverb: 0.54,
    });
    scheduleTone(92, now, 0.62, 0.18, {
      type: "sine",
      endFrequency: 48,
      filterFrequency: 380,
      release: 0.44,
      reverb: 0.14,
    });
    scheduleTone(cardAccent, now + 0.2, 0.75, 0.1, {
      type: "triangle",
      endFrequency: cardAccent * 1.5,
      filterFrequency: 2800,
      release: 0.54,
      reverb: 0.62,
    });
    return;
  }

  if (kind === "turn-self" || kind === "turn-opponent") {
    const root = kind === "turn-self" ? 440 : 293.66;
    [1, 1.5, 2].forEach((ratio, index) => {
      scheduleTone(root * ratio, now + index * 0.11, 0.9 - index * 0.1, 0.085 - index * 0.012, {
        type: index === 0 ? "triangle" : "sine",
        attack: 0.008,
        release: 0.65,
        pan: (index - 1) * 0.28,
        reverb: 0.72,
      });
    });
    scheduleNoise(now, 0.34, 0.035, {
      filterType: "lowpass",
      filterFrequency: 210,
      endFrequency: 72,
      reverb: 0.24,
    });
    return;
  }

  if (kind === "draw") {
    scheduleNoise(now, 0.34, 0.1, {
      filterType: "highpass",
      filterFrequency: 900,
      endFrequency: 4800,
      pan: -0.38,
      reverb: 0.14,
    });
    scheduleNoise(now + 0.12, 0.3, 0.07, {
      filterType: "bandpass",
      filterFrequency: 3200,
      endFrequency: 1100,
      pan: 0.32,
      reverb: 0.18,
    });
    scheduleTone(720, now + 0.24, 0.11, 0.07, {
      type: "triangle",
      release: 0.09,
      reverb: 0.28,
    });
    return;
  }

  if (kind === "spirit-swap") {
    scheduleNoise(now, 1.5, 0.095, {
      filterType: "bandpass",
      filterFrequency: 280,
      endFrequency: 6800,
      pan: -0.55,
      reverb: 0.68,
    });
    scheduleNoise(now + 0.18, 1.35, 0.07, {
      filterType: "bandpass",
      filterFrequency: 6200,
      endFrequency: 340,
      pan: 0.55,
      reverb: 0.74,
    });
    scheduleTone(196, now, 1.65, 0.095, {
      type: "sine",
      endFrequency: 1174,
      pan: -0.42,
      release: 0.42,
      reverb: 0.78,
    });
    scheduleTone(1174, now + 0.04, 1.65, 0.075, {
      type: "triangle",
      endFrequency: 196,
      pan: 0.42,
      release: 0.44,
      reverb: 0.82,
    });
    [587, 880, 1174].forEach((frequency, index) => {
      scheduleTone(frequency, now + 1.02 + index * 0.1, 0.72, 0.055, {
        type: "sine",
        release: 0.58,
        pan: (index - 1) * 0.32,
        reverb: 0.88,
      });
    });
    return;
  }

  if (kind === "duel") {
    scheduleNoise(now, 0.5, 0.19, {
      filterType: "lowpass",
      filterFrequency: 520,
      endFrequency: 70,
      reverb: 0.18,
    });
    scheduleTone(76, now, 0.72, 0.22, {
      type: "sine",
      endFrequency: 38,
      filterFrequency: 300,
      release: 0.5,
      reverb: 0.12,
    });
    [220, 277.18].forEach((frequency, index) => {
      scheduleTone(frequency, now + 0.08, 1.1, 0.09, {
        type: "sawtooth",
        endFrequency: frequency * 0.76,
        filterFrequency: 980,
        pan: index === 0 ? -0.46 : 0.46,
        release: 0.82,
        reverb: 0.46,
      });
    });
    return;
  }

  if (kind === "effect") {
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      scheduleTone(frequency, now + index * 0.075, 0.62, 0.062, {
        type: index === 1 ? "triangle" : "sine",
        release: 0.46,
        pan: (index - 1) * 0.3,
        reverb: 0.72,
      });
    });
    scheduleNoise(now, 0.55, 0.038, {
      filterType: "highpass",
      filterFrequency: 1800,
      endFrequency: 7200,
      reverb: 0.62,
    });
    return;
  }

  const isVictory = kind === "win";
  const isDraw = kind === "draw-result";
  const notes = isVictory ? [62, 65, 69, 74, 77] : isDraw ? [62, 69, 65, 69] : [62, 58, 55, 50];
  notes.forEach((note, index) => {
    const start = now + index * (isVictory ? 0.16 : 0.23);
    scheduleTone(midiToFrequency(note), start, isVictory ? 1.45 : 1.2, 0.1, {
      type: index % 2 === 0 ? "triangle" : "sine",
      attack: 0.012,
      release: isVictory ? 1 : 0.82,
      pan: (index / Math.max(1, notes.length - 1) - 0.5) * 0.9,
      reverb: 0.78,
    });
  });
  if (isVictory) {
    scheduleNoise(now + 0.45, 1.25, 0.055, {
      filterType: "highpass",
      filterFrequency: 2500,
      endFrequency: 9000,
      reverb: 0.88,
    });
  } else {
    scheduleTone(55, now, 1.8, 0.11, {
      type: "sine",
      endFrequency: 36,
      release: 1.2,
      filterFrequency: 240,
      reverb: 0.28,
    });
  }
}

export function playGameSound(
  kind: GameSound,
  enabled: boolean,
  accent = 0,
  unlockFromGesture = false,
): void {
  if (!enabled) return;
  const current = ensureAudioGraph();
  if (!current) return;
  if (current.context.state === "running") {
    performSound(kind, accent);
    return;
  }
  installUnlockListeners();
  if (!unlockFromGesture) return;
  void current.context
    .resume()
    .then(() => {
      performSound(kind, accent);
      if (musicRequested) beginMusicScheduler();
    })
    .catch(() => undefined);
}

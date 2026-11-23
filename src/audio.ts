// Synthesized groan tube voice.
//
// A real groan tube is a reed inside a tube with a sliding weight. When the tube is
// turned over, the weight falls, pushes air through the reed, and the shrinking air
// column bends the pitch down: "grooooaaan". We model that with a buzzy reed waveform,
// two vowel-like formant filters that close from "aah" to "ooh", a growl (fast
// amplitude flutter), a little breath noise, and a pitch that follows how far the
// weight has travelled.

export interface Preset {
  id: string;
  name: string;
  wave: "reed" | "sine";
  /** Pitch (Hz) at the start and end of a fall. */
  pitch: [number, number];
  /** Formant centre frequencies (Hz) at the start and end of a fall. */
  f1: [number, number];
  f2: [number, number];
  formantQ: number;
  vibratoRate: number;
  /** Vibrato depth as a fraction of pitch. */
  vibratoDepth: number;
  growlRate: number;
  growlDepth: number;
  breath: number;
  /** Like a moo can: only sounds when the weight falls one way. */
  oneWay: boolean;
  /** Output level, to even out loudness between presets. */
  level: number;
}

export const PRESETS: Preset[] = [
  {
    id: "groan",
    name: "Groan",
    wave: "reed",
    pitch: [250, 105],
    f1: [820, 380],
    f2: [1350, 760],
    formantQ: 5,
    vibratoRate: 5.2,
    vibratoDepth: 0.012,
    growlRate: 31,
    growlDepth: 0.35,
    breath: 0.06,
    oneWay: false,
    level: 1.4,
  },
  {
    id: "moo",
    name: "Moo",
    wave: "reed",
    pitch: [175, 92],
    f1: [560, 300],
    f2: [980, 640],
    formantQ: 6,
    vibratoRate: 4,
    vibratoDepth: 0.008,
    growlRate: 24,
    growlDepth: 0.45,
    breath: 0.05,
    oneWay: true,
    level: 1.4,
  },
  {
    id: "ghost",
    name: "Ghost",
    wave: "sine",
    pitch: [560, 300],
    f1: [900, 500],
    f2: [1600, 1000],
    formantQ: 1.2,
    vibratoRate: 6.5,
    vibratoDepth: 0.03,
    growlRate: 9,
    growlDepth: 0.1,
    breath: 0.22,
    oneWay: false,
    level: 0.4,
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class GroanVoice {
  readonly ctx: BaseAudioContext;
  private preset: Preset = PRESETS[0];
  private reedWave: PeriodicWave;

  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private vibrato: OscillatorNode;
  private vibratoGain: GainNode;
  private growl: OscillatorNode;
  private growlGain: GainNode;
  private growlAmp: GainNode;
  private f1: BiquadFilterNode;
  private f2: BiquadFilterNode;
  private body: BiquadFilterNode;
  private breathFilter: BiquadFilterNode;
  private breathGain: GainNode;
  private voice: GainNode;
  private master: GainNode;
  private noise: AudioBuffer;

  /** Last pitch sent to the oscillators, for the readout. */
  pitchHz = 0;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;

    this.reedWave = makeReedWave(ctx);
    this.noise = makeNoise(ctx, 2);

    // Reed: two slightly detuned oscillators for a rough, beating tone.
    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();

    // Vibrato drives both oscillators' frequency (in Hz).
    this.vibrato = ctx.createOscillator();
    this.vibratoGain = ctx.createGain();
    this.vibrato.connect(this.vibratoGain);
    this.vibratoGain.connect(this.oscA.frequency);
    this.vibratoGain.connect(this.oscB.frequency);

    // Growl: fast amplitude flutter, like the reed rattling.
    this.growl = ctx.createOscillator();
    this.growl.type = "triangle";
    this.growlGain = ctx.createGain();
    this.growlAmp = ctx.createGain();
    this.growl.connect(this.growlGain);
    this.growlGain.connect(this.growlAmp.gain);

    const mixA = ctx.createGain();
    const mixB = ctx.createGain();
    mixA.gain.value = 0.6;
    mixB.gain.value = 0.4;
    this.oscA.connect(mixA).connect(this.growlAmp);
    this.oscB.connect(mixB).connect(this.growlAmp);

    // Vowel formants in parallel, plus a lowpassed "body" path for warmth.
    this.f1 = ctx.createBiquadFilter();
    this.f1.type = "bandpass";
    this.f2 = ctx.createBiquadFilter();
    this.f2.type = "bandpass";
    this.body = ctx.createBiquadFilter();
    this.body.type = "lowpass";
    this.body.frequency.value = 700;

    const f1Gain = ctx.createGain();
    const f2Gain = ctx.createGain();
    const bodyGain = ctx.createGain();
    f1Gain.gain.value = 1.6;
    f2Gain.gain.value = 0.9;
    bodyGain.gain.value = 0.35;

    this.voice = ctx.createGain();
    this.voice.gain.value = 0;

    this.growlAmp.connect(this.f1).connect(f1Gain).connect(this.voice);
    this.growlAmp.connect(this.f2).connect(f2Gain).connect(this.voice);
    this.growlAmp.connect(this.body).connect(bodyGain).connect(this.voice);

    // Breath noise, bandpassed around the first formant.
    const breathSrc = ctx.createBufferSource();
    breathSrc.buffer = this.noise;
    breathSrc.loop = true;
    this.breathFilter = ctx.createBiquadFilter();
    this.breathFilter.type = "bandpass";
    this.breathFilter.Q.value = 0.8;
    this.breathGain = ctx.createGain();
    breathSrc.connect(this.breathFilter).connect(this.breathGain).connect(this.voice);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.voice.connect(comp).connect(this.master).connect(ctx.destination);

    this.setPreset(this.preset);

    for (const node of [this.oscA, this.oscB, this.vibrato, this.growl]) node.start();
    breathSrc.start();
  }

  setPreset(p: Preset) {
    this.preset = p;
    const now = this.ctx.currentTime;
    for (const osc of [this.oscA, this.oscB]) {
      if (p.wave === "reed") osc.setPeriodicWave(this.reedWave);
      else osc.type = "sine";
    }
    this.vibrato.frequency.setValueAtTime(p.vibratoRate, now);
    this.growl.frequency.setValueAtTime(p.growlRate, now);
    this.growlGain.gain.setValueAtTime(p.growlDepth, now);
    this.growlAmp.gain.setValueAtTime(1 - p.growlDepth, now);
    this.f1.Q.setValueAtTime(p.formantQ, now);
    this.f2.Q.setValueAtTime(p.formantQ, now);
  }

  get current() {
    return this.preset;
  }

  /**
   * @param flow 0..1, how fast air is moving through the reed
   * @param travel 0..1, how far the weight is through its current fall
   * @param direction +1 falling toward the bottom of the phone, -1 toward the top
   */
  update(flow: number, travel: number, direction: number) {
    const p = this.preset;
    const now = this.ctx.currentTime;
    const t = clamp01(travel);
    // Ease so the pitch drops faster near the end, like the real thing.
    const bend = t * t * (3 - 2 * t);

    let level = flow < 0.03 ? 0 : Math.pow(clamp01(flow), 1.25);
    if (p.oneWay && direction < 0) level = 0;

    if (level === 0) {
      // Let the tail ring out at its last pitch instead of sliding back up.
      this.voice.gain.setTargetAtTime(0, now, 0.06);
      this.breathGain.gain.setTargetAtTime(0, now, 0.04);
      this.pitchHz = 0;
      return;
    }

    // Faster air pushes the reed slightly sharp.
    const pitch = lerp(p.pitch[0], p.pitch[1], bend) * (0.93 + 0.12 * flow);
    this.pitchHz = pitch;

    this.oscA.frequency.setTargetAtTime(pitch, now, 0.03);
    this.oscB.frequency.setTargetAtTime(pitch * 1.006, now, 0.03);
    this.vibratoGain.gain.setTargetAtTime(pitch * p.vibratoDepth, now, 0.1);

    const f1 = lerp(p.f1[0], p.f1[1], bend);
    this.f1.frequency.setTargetAtTime(f1, now, 0.04);
    this.f2.frequency.setTargetAtTime(lerp(p.f2[0], p.f2[1], bend), now, 0.04);
    this.breathFilter.frequency.setTargetAtTime(f1 * 1.5, now, 0.05);
    this.breathGain.gain.setTargetAtTime(p.breath * level * 3, now, 0.04);

    this.voice.gain.setTargetAtTime(level * p.level, now, 0.035);
  }

  /** The weight hitting the end cap. */
  thunk(strength: number) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = clamp01(strength);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5 * s + 0.01, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    src.connect(lp).connect(g).connect(this.master);
    src.start(now, Math.random());
    src.stop(now + 0.12);

    const knock = ctx.createOscillator();
    knock.frequency.setValueAtTime(140, now);
    knock.frequency.exponentialRampToValueAtTime(55, now + 0.08);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0001, now);
    kg.gain.exponentialRampToValueAtTime(0.4 * s + 0.01, now + 0.003);
    kg.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    knock.connect(kg).connect(this.master);
    knock.start(now);
    knock.stop(now + 0.12);
  }

  silence() {
    this.voice.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    this.pitchHz = 0;
  }
}

export function createAudioContext(): AudioContext {
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx({ latencyHint: "interactive" });
}

/** Buzzy reed spectrum: rich harmonics, odd ones a touch stronger. */
function makeReedWave(ctx: BaseAudioContext): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    const odd = k % 2 === 1 ? 1 : 0.6;
    imag[k] = (odd / Math.pow(k, 0.85)) * (k === 1 ? 0.8 : 1);
  }
  return ctx.createPeriodicWave(real, imag);
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Slightly pinked noise so it sounds like air rather than hiss.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = 0.97 * last + 0.03 * white;
    data[i] = white * 0.35 + last * 3;
  }
  return buf;
}

// Groan tube physical model, run on the audio thread.
//
// Measured from real groan tube recordings: the reed holds an almost steady pitch
// (~300-330 Hz, very bright), and the "groan" is the tube's resonances sliding across
// its harmonics as the weight moves and the air column changes length. So:
//
//   reed (steady, bright wavetable) ──► tube (delay line with feedback) ──► out
//
// The tube is a waveguide: a delay of one round trip (2L / c) with a lossy, inverted
// reflection. That puts resonances at odd multiples of c / 4L, all of which glide
// together as `length` changes.

const SPEED_OF_SOUND = 343;
const TABLE_SIZE = 2048;
const BUF_SIZE = 8192; // > max round trip at 96 kHz for a 2 m tube
const BUF_MASK = BUF_SIZE - 1;

class GroanProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "f0", defaultValue: 320, minValue: 30, maxValue: 2000 },
      { name: "length", defaultValue: 0.2, minValue: 0.01, maxValue: 2 },
      { name: "level", defaultValue: 0, minValue: 0, maxValue: 4 },
      { name: "feedback", defaultValue: -0.8, minValue: -0.98, maxValue: 0.98, automationRate: "k-rate" },
      { name: "damping", defaultValue: 0.3, minValue: 0, maxValue: 0.99, automationRate: "k-rate" },
      // Real playback rate ÷ the context's nominal rate. Some iOS devices play a context
      // slower or faster than its sampleRate claims; the main thread measures this
      // against the wall clock and we compensate so pitch and tube length stay true.
      { name: "rate", defaultValue: 1, minValue: 0.1, maxValue: 10, automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    // Prefer the context's own rate, passed in, over the worklet global.
    const opt = options && options.processorOptions;
    this.sr = (opt && opt.sampleRate) || sampleRate;
    this.table = new Float32Array(TABLE_SIZE + 1);
    this.buf = new Float32Array(BUF_SIZE);
    this.write = 0;
    this.phase = 0;
    this.lp = 0;
    this.alive = true;
    this.port.onmessage = (e) => {
      if (e.data === "stop") this.alive = false;
      else if (e.data && e.data.harmonics) this.buildTable(e.data.harmonics);
    };
  }

  /** One cycle of the reed waveform from harmonic amplitudes (index 0 = fundamental). */
  buildTable(amps) {
    const t = this.table;
    t.fill(0);
    for (let k = 0; k < amps.length; k++) {
      const a = amps[k];
      if (!a) continue;
      for (let i = 0; i < TABLE_SIZE; i++) t[i] += a * Math.sin((2 * Math.PI * (k + 1) * i) / TABLE_SIZE);
    }
    let peak = 0;
    for (let i = 0; i < TABLE_SIZE; i++) peak = Math.max(peak, Math.abs(t[i]));
    if (peak > 0) for (let i = 0; i < TABLE_SIZE; i++) t[i] /= peak;
    t[TABLE_SIZE] = t[0];
  }

  process(_inputs, outputs, params) {
    const out = outputs[0];
    if (!out || !out[0]) return this.alive;
    const ch0 = out[0];
    const { f0, length, level } = params;
    const fb = params.feedback[0];
    const damp = params.damping[0];
    const sr = this.sr * params.rate[0];
    const table = this.table;
    const buf = this.buf;
    // Resonant peaks reach 1 / (1 - |fb|); scale back so the level stays put.
    const norm = 1 - Math.abs(fb);

    let phase = this.phase;
    let w = this.write;
    let lp = this.lp;

    for (let i = 0; i < ch0.length; i++) {
      const f = f0.length > 1 ? f0[i] : f0[0];
      const L = length.length > 1 ? length[i] : length[0];
      const g = level.length > 1 ? level[i] : level[0];

      phase += f / sr;
      if (phase >= 1) phase -= 1;
      const x = phase * TABLE_SIZE;
      const xi = x | 0;
      const src = (table[xi] + (table[xi + 1] - table[xi]) * (x - xi)) * g;

      let d = (2 * L * sr) / SPEED_OF_SOUND;
      if (d < 2) d = 2;
      else if (d > BUF_SIZE - 2) d = BUF_SIZE - 2;
      const r = w - d;
      const ri = Math.floor(r);
      const frac = r - ri;
      const a = buf[ri & BUF_MASK];
      const b = buf[(ri + 1) & BUF_MASK];
      const delayed = a + (b - a) * frac;

      // Wall losses: high resonances are broader than low ones.
      lp += (1 - damp) * (delayed - lp);
      const y = src + fb * lp;
      buf[w] = y;
      w = (w + 1) & BUF_MASK;

      ch0[i] = y * norm;
    }

    this.phase = phase;
    this.write = w;
    this.lp = lp;
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    return this.alive;
  }
}

registerProcessor("groan-processor", GroanProcessor);

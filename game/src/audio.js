// All sound in Neon Palms is synthesized with WebAudio: no samples, no
// files. A tiny synth voice plays effects (shots, crashes, pickups, thunder),
// loop nodes carry the continuous beds (engine, siren, helicopter rotor,
// rain), and the car radio rotates three generated stations while driving.

const STATIONS = [
  { name: 'PALM FM', style: 'chill' },
  { name: 'NEON DRIVE', style: 'synth' },
  { name: 'BAY TALK', style: 'talk' },
];

export class AudioEngine {
  constructor(save) {
    this.ctx = null;
    this.master = null;
    this.save = save;
    this.muted = !!save.muted;
    this.radioOn = false;
    this.station = 0;
    this.radioTimer = 0;
    this.noteIndex = 0;
    this.loops = {};
  }

  /** Browsers only allow audio after a gesture; call from the first input. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted) {
    this.muted = muted;
    this.save.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  stationName() {
    return STATIONS[this.station].name;
  }

  cycleStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.noteIndex = 0;
    this.radioTimer = 0;
    return this.stationName();
  }

  /** One short synthesized blip. */
  blip(freq, dur, type = 'square', vol = 0.2, slideTo = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A burst of filtered noise (shots, crashes, splashes, thunder bed). */
  noise(dur, vol = 0.3, freq = 1200, q = 0.8, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  gunshot() {
    this.noise(0.14, 0.5, 900, 0.5);
    this.blip(160, 0.1, 'sawtooth', 0.25, 60);
  }

  melee() {
    this.noise(0.08, 0.3, 500, 1);
  }

  crash(strength = 1) {
    this.noise(0.25, 0.35 * strength, 300, 0.4);
    this.blip(90, 0.2, 'triangle', 0.3 * strength, 40);
  }

  pickup() {
    this.blip(660, 0.09, 'square', 0.18);
    this.blip(990, 0.14, 'square', 0.18, 0, 0.08);
  }

  cash() {
    this.blip(880, 0.07, 'triangle', 0.22);
    this.blip(1320, 0.12, 'triangle', 0.22, 0, 0.06);
  }

  phone() {
    this.blip(1046, 0.12, 'sine', 0.2);
    this.blip(1046, 0.12, 'sine', 0.2, 0, 0.2);
  }

  thunder() {
    this.noise(1.4, 0.5, 120, 0.3, 0.15);
    this.noise(0.7, 0.3, 220, 0.4);
  }

  checkpoint() {
    this.blip(523, 0.09, 'square', 0.2);
    this.blip(784, 0.09, 'square', 0.2, 0, 0.09);
    this.blip(1046, 0.16, 'square', 0.2, 0, 0.18);
  }

  /** Start/stop a named looping bed: 'engine' | 'siren' | 'rotor' | 'rain'. */
  setLoop(name, on, level = 0.15) {
    if (!this.ctx) return;
    const existing = this.loops[name];
    if (on && existing) {
      existing.gain.gain.value = this.muted ? 0 : level;
      return;
    }
    if (!on && existing) {
      try { existing.src.stop(); } catch { /* already stopped */ }
      delete this.loops[name];
      return;
    }
    if (!on) return;
    const gain = this.ctx.createGain();
    gain.gain.value = this.muted ? 0 : level;
    gain.connect(this.master);
    let src;
    if (name === 'siren') {
      src = this.ctx.createOscillator();
      src.type = 'triangle';
      src.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.55;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain).connect(src.frequency);
      lfo.start();
      src.connect(gain);
      src.start();
      this.loops[name] = { src, gain, extra: lfo };
      return;
    }
    // Noise-based beds: engine rumble, rotor chop (amplitude-gated), rain hiss.
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    if (name === 'engine') {
      filter.type = 'lowpass';
      filter.frequency.value = 160;
    } else if (name === 'rotor') {
      filter.type = 'bandpass';
      filter.frequency.value = 300;
      filter.Q.value = 0.6;
      const gate = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 11;
      lfoGain.gain.value = 0.5;
      gate.gain.value = 0.5;
      lfo.connect(lfoGain).connect(gate.gain);
      lfo.start();
      src.connect(filter).connect(gate).connect(gain);
      src.start();
      this.loops[name] = { src, gain, extra: lfo };
      return;
    } else {
      filter.type = 'highpass';
      filter.frequency.value = 900;
    }
    src.connect(filter).connect(gain);
    src.start();
    this.loops[name] = { src, gain };
  }

  /** Radio: schedule the next note of the current station while driving. */
  updateRadio(dt, driving) {
    if (!this.ctx || this.muted) return;
    if (!driving) {
      this.radioOn = false;
      return;
    }
    this.radioOn = true;
    this.radioTimer -= dt;
    if (this.radioTimer > 0) return;
    const style = STATIONS[this.station].style;
    if (style === 'talk') {
      // Murmured talk radio: low formant-ish warbles, no melody.
      const f = 110 + Math.random() * 90;
      this.blip(f, 0.16, 'sawtooth', 0.05, f * (0.9 + Math.random() * 0.3));
      this.radioTimer = 0.14 + Math.random() * 0.22;
      return;
    }
    const scale = style === 'synth' ? [0, 3, 5, 7, 10, 12, 10, 7] : [0, 4, 7, 11, 12, 11, 7, 4];
    const base = style === 'synth' ? 220 : 196;
    const step = scale[this.noteIndex % scale.length];
    const freq = base * Math.pow(2, step / 12);
    this.blip(freq, style === 'synth' ? 0.22 : 0.34, style === 'synth' ? 'square' : 'triangle', 0.07);
    if (this.noteIndex % 4 === 0) this.blip(base / 2, 0.4, 'sine', 0.09);
    this.noteIndex += 1;
    this.radioTimer = style === 'synth' ? 0.21 : 0.42;
  }
}

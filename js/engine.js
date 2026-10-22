import { eventAt } from "./tracks.js";

export function createEngine() {
  const ctx = new AudioContext();
  const noise = createNoise(ctx);
  const masterBus = ctx.createGain();
  const cueBus = ctx.createGain();
  const masterKnob = ctx.createGain();
  const phonesKnob = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  masterKnob.gain.value = 0;
  phonesKnob.gain.value = 0;
  masterBus.connect(masterKnob);
  masterKnob.connect(comp);
  comp.connect(ctx.destination);
  cueBus.connect(phonesKnob);
  phonesKnob.connect(ctx.destination);

  const booth = ctx.createAnalyser();
  booth.fftSize = 256;
  masterBus.connect(booth);

  function makeDeck() {
    const input = ctx.createGain();
    const eqLow = ctx.createBiquadFilter();
    const eqMid = ctx.createBiquadFilter();
    const eqHigh = ctx.createBiquadFilter();
    const filter = ctx.createBiquadFilter();
    const pre = ctx.createGain();
    const fader = ctx.createGain();
    const cue = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    eqLow.type = "lowshelf";
    eqLow.frequency.value = 110;
    eqMid.type = "peaking";
    eqMid.frequency.value = 1100;
    eqMid.Q.value = 0.8;
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 7800;
    filter.type = "lowpass";
    filter.frequency.value = 18000;
    filter.Q.value = 0.7;

    input.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(filter);
    filter.connect(pre);
    pre.connect(fader);
    fader.connect(masterBus);
    fader.connect(analyser);
    pre.connect(cue);
    cue.connect(cueBus);

    return {
      input,
      eqLow,
      eqMid,
      eqHigh,
      filter,
      fader,
      cue,
      analyser,
      meterBuf: new Uint8Array(analyser.fftSize),
    };
  }

  return {
    ctx,
    noise,
    masterBus,
    masterKnob,
    phonesKnob,
    booth,
    boothBuf: new Uint8Array(booth.fftSize),
    decks: { a: makeDeck(), b: makeDeck() },
  };
}

export function peak(analyser, buf) {
  analyser.getByteTimeDomainData(buf);
  let max = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const value = Math.abs(buf[i] - 128) / 128;
    if (value > max) max = value;
  }
  return max;
}

export function rms(analyser, buf) {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

export function triggerStep(engine, nodes, track, step, time, scale) {
  const event = eventAt(track, step);
  if (event.kick > 0.05) triggerKick(engine, nodes.input, time, 0.7 * event.kick, 1 + (scale - 1) * 0.25);
  if (event.hat > 0.05) triggerHat(engine, nodes.input, time, 0.09 * event.hat, event.hat > 0.8);
  if (event.clap > 0.05) triggerClap(engine, nodes.input, time, 0.2 * event.clap);
  if (event.bass > 0.05) triggerBass(engine, nodes.input, time, 0.24 * event.bass, track.root * scale, track.voice);
  if (event.stab > 0.05) triggerStab(engine, nodes.input, time, 0.07 * event.stab, track.root * 2 * scale, track.minor);
  if (event.perc > 0.05) triggerPerc(engine, nodes.input, time, 0.07 * event.perc);
}

function triggerKick(engine, dest, time, amp, scale) {
  const osc = engine.ctx.createOscillator();
  const gain = engine.ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150 * scale, time);
  osc.frequency.exponentialRampToValueAtTime(46 * scale, time + 0.08);
  gain.gain.setValueAtTime(amp, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.28);

  const click = engine.ctx.createBufferSource();
  click.buffer = engine.noise;
  const hp = engine.ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const clickGain = engine.ctx.createGain();
  clickGain.gain.setValueAtTime(amp * 0.35, time);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
  click.connect(hp).connect(clickGain).connect(dest);
  click.start(time);
  click.stop(time + 0.03);
}

function triggerHat(engine, dest, time, amp, open) {
  const src = engine.ctx.createBufferSource();
  src.buffer = engine.noise;
  const hp = engine.ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = open ? 5000 : 8000;
  const gain = engine.ctx.createGain();
  gain.gain.setValueAtTime(amp, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + (open ? 0.14 : 0.035));
  src.connect(hp).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + (open ? 0.16 : 0.05));
}

function triggerClap(engine, dest, time, amp) {
  for (let n = 0; n < 3; n += 1) {
    const src = engine.ctx.createBufferSource();
    src.buffer = engine.noise;
    const bp = engine.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.7;
    const gain = engine.ctx.createGain();
    const at = time + n * 0.012;
    gain.gain.setValueAtTime(amp * (1 - n * 0.25), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    src.connect(bp).connect(gain).connect(dest);
    src.start(at);
    src.stop(at + 0.09);
  }
}

function triggerBass(engine, dest, time, amp, freq, voice) {
  const osc = engine.ctx.createOscillator();
  osc.type = voice === "techno" || voice === "melodic" ? "sine" : "triangle";
  osc.frequency.setValueAtTime(Math.max(30, freq), time);
  const filter = engine.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = voice === "dnb" ? 280 : 180;
  const gain = engine.ctx.createGain();
  const release = voice === "techno" || voice === "melodic" ? 0.2 : 0.13;
  gain.gain.setValueAtTime(amp, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + release);
  osc.connect(filter).connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + release + 0.02);
}

function triggerStab(engine, dest, time, amp, freq, minor) {
  const ratios = minor ? [1, 6 / 5, 3 / 2] : [1, 5 / 4, 3 / 2];
  const bp = engine.ctx.createBiquadFilter();
  bp.type = "lowpass";
  bp.frequency.value = 1400;
  ratios.forEach((ratio) => {
    const osc = engine.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq * ratio;
    const gain = engine.ctx.createGain();
    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(gain).connect(bp).connect(dest);
    osc.start(time);
    osc.stop(time + 0.24);
  });
}

function triggerPerc(engine, dest, time, amp) {
  const src = engine.ctx.createBufferSource();
  src.buffer = engine.noise;
  const bp = engine.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 420;
  bp.Q.value = 1.2;
  const gain = engine.ctx.createGain();
  gain.gain.setValueAtTime(amp, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
  src.connect(bp).connect(gain).connect(dest);
  src.start(time);
  src.stop(time + 0.08);
}

function createNoise(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.3);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

export function isSoundEnabled(): boolean {
  return localStorage.getItem("artix_sounds") !== "0";
}


function tone(
  freq: number,
  type: OscillatorType,
  duration: number,
  volume: number,
  delay = 0,
) {
  const ac = ctx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.value = freq;
  const now = ac.currentTime + delay;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

export function playCheckout() {
  if (!isSoundEnabled()) return;
  try {
    tone(523, "triangle", 0.07, 0.28, 0);
    tone(1047, "sine", 0.45, 0.22, 0.07);
    tone(1319, "sine", 0.55, 0.14, 0.10);
    tone(2093, "sine", 0.38, 0.07, 0.09);
  } catch (_) {}
}

export function playAddItem() {
  if (!isSoundEnabled()) return;
  try {
    tone(880, "sine", 0.07, 0.10);
  } catch (_) {}
}

export function playMilestone() {
  if (!isSoundEnabled()) return;
  try {
    tone(523, "sine", 0.14, 0.18, 0);
    tone(659, "sine", 0.14, 0.18, 0.12);
    tone(784, "sine", 0.14, 0.18, 0.24);
    tone(1047, "sine", 0.30, 0.22, 0.36);
  } catch (_) {}
}

export function playError() {
  if (!isSoundEnabled()) return;
  try {
    tone(200, "sawtooth", 0.10, 0.14, 0);
    tone(160, "sawtooth", 0.09, 0.10, 0.06);
  } catch (_) {}
}

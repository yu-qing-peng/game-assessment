let ctx = null;
let muted = false;

function init() {
  if (ctx) return;
  try {
    ctx = wx.createWebAudioContext();
  } catch (e) {
    ctx = null;
  }
}

function setMuted(v) {
  muted = !!v;
}

function isMuted() {
  return muted;
}

function tone(freq, duration, type, vol, delay) {
  if (!ctx || muted) return;
  try {
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (duration || 0.15));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + (duration || 0.15) + 0.03);
  } catch (e) {}
}

function vibrate(type) {
  try {
    wx.vibrateShort({ type: type || 'light' });
  } catch (e) {
    try {
      wx.vibrateShort({});
    } catch (e2) {}
  }
}

module.exports = {
  init,
  setMuted,
  isMuted,
  vibrate,
  click() {
    tone(880, 0.08, 'square', 0.12);
  },
  success() {
    tone(660, 0.12, 'triangle', 0.28);
    tone(990, 0.16, 'triangle', 0.28, 0.09);
  },
  fail() {
    tone(196, 0.22, 'sawtooth', 0.16);
  },
  combo() {
    tone(1200, 0.08, 'square', 0.2);
    tone(1500, 0.08, 'square', 0.16, 0.06);
  },
  roundClear() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.26, i * 0.09));
  },
  countdown() {
    tone(440, 0.1, 'sine', 0.25);
  },
  go() {
    tone(880, 0.28, 'sine', 0.32);
  },
  over() {
    tone(523, 0.18, 'triangle', 0.26);
    tone(392, 0.22, 'triangle', 0.26, 0.14);
    tone(262, 0.4, 'triangle', 0.26, 0.3);
  }
};

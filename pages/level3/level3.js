const audio = require('../../utils/audio');

const GAME_DURATION = 30;
const COLORS = ['#00e5ff', '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#60a5fa'];

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function sysInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
}

Page({
  data: {
    state: 'ready',
    time: GAME_DURATION,
    hits: 0,
    miss: 0,
    hitRate: 0,
    avgTime: 0,
    acc: 0,
    finalScore: 0
  },

  onReady() {
    audio.init();
    this.initCanvas();
  },

  onUnload() {
    this.stopLoop();
    this.clearTimers();
  },

  onHide() {
    this.stopLoop();
    this.clearTimers();
  },

  clearTimers() {
    if (this.cdTimer) {
      clearTimeout(this.cdTimer);
      this.cdTimer = null;
    }
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
  },

  initCanvas() {
    const q = this.createSelectorQuery();
    q.select('#game')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          setTimeout(() => this.initCanvas(), 120);
          return;
        }
        const { node: canvas, width, height } = res[0];
        const dpr = sysInfo().pixelRatio || 2;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this.canvas = canvas;
        this.ctx = ctx;
        this.W = width;
        this.H = height;
        this.targets = [];
        this.effects = [];
        this.spawnAcc = 0;
        this.taps = 0;
        this.hits = 0;
        this.miss = 0;
        this.precSum = 0;
        this.reactions = [];
        this._ended = false;
        this.draw(0);
      });
  },

  startGame() {
    audio.click();
    this.setData({ state: 'countdown' });
    this.countdown = 3;
    this.lastT = 0;
    this.startLoop();
    this.tickCountdown();
  },

  tickCountdown() {
    audio.countdown();
    if (this.countdown === 0) {
      audio.go();
      this.playStart = Date.now();
      this.setData({ state: 'playing' });
      return;
    }
    this.cdTimer = setTimeout(() => {
      this.countdown -= 1;
      this.tickCountdown();
    }, 800);
  },

  startLoop() {
    this.stopLoop();
    if (!this.canvas) return;
    this.rafId = this.canvas.requestAnimationFrame((t) => this.tick(t));
  },

  stopLoop() {
    if (this.rafId) {
      try {
        this.canvas.cancelAnimationFrame(this.rafId);
      } catch (e) {}
      this.rafId = null;
    }
  },

  tick(t) {
    this.rafId = this.canvas.requestAnimationFrame((tt) => this.tick(tt));
    if (!this.lastT) this.lastT = t;
    const dt = clamp((t - this.lastT) / 1000, 0.001, 0.05);
    this.lastT = t;
    if (this.data.state === 'playing') this.update(dt);
    this.draw(t);
  },

  update(dt) {
    const elapsed = (Date.now() - this.playStart) / 1000;
    this.spawnAcc += dt;
    const interval = Math.max(0.45, 1.0 - (elapsed / GAME_DURATION) * 0.6);
    if (this.spawnAcc >= interval && this.targets.length < 6) {
      this.spawnAcc -= interval;
      this.spawnTarget(elapsed);
    }
    const now = Date.now();
    for (const t of this.targets) {
      if (now - t.born >= t.dur * 1000) {
        t.active = false;
        this.miss++;
        audio.vibrate('light');
      }
    }
    this.targets = this.targets.filter((t) => t.active);
    for (const fx of this.effects) fx.life -= dt;
    this.effects = this.effects.filter((fx) => fx.life > 0);
    this.refreshHUD();
    if (elapsed >= GAME_DURATION) this.endGame();
  },

  spawnTarget(elapsed) {
    const prog = elapsed / GAME_DURATION;
    const r = 30 + Math.random() * (70 - 30 - prog * 26);
    const x = r + 12 + Math.random() * (this.W - 2 * r - 24);
    const y = Math.max(r + 70, r + 12 + Math.random() * (this.H - 2 * r - 84));
    const dur = Math.max(0.55, 1.5 - prog * 1.0);
    this.targets.push({
      x,
      y,
      r,
      dur,
      born: Date.now(),
      active: true,
      color: COLORS[(Math.random() * COLORS.length) | 0]
    });
  },

  onTap(e) {
    if (this.data.state !== 'playing') return;
    const t = e.touches[0];
    const px = t.x,
      py = t.y;
    this.taps++;
    let best = null,
      bestD = Infinity;
    for (const tg of this.targets) {
      if (!tg.active) continue;
      const d = Math.hypot(px - tg.x, py - tg.y);
      if (d <= tg.r + 6 && d < bestD) {
        bestD = d;
        best = tg;
      }
    }
    if (best) {
      best.active = false;
      this.hits++;
      const prec = clamp(1 - Math.max(0, bestD - 8) / Math.max(1, best.r + 6 - 8), 0, 1);
      this.precSum += prec;
      this.reactions.push(Date.now() - best.born);
      this.effects.push({ x: best.x, y: best.y, r: best.r, life: 0.3, color: best.color, prec });
      audio.combo();
      audio.vibrate('light');
    } else {
      this.effects.push({ x: px, y: py, r: 6, life: 0.2, color: '#f87171' });
      audio.click();
    }
    this.refreshHUD();
  },

  refreshHUD() {
    const elapsed = Math.max(0.001, (Date.now() - (this.playStart || 0)) / 1000);
    const remaining = Math.max(0, Math.ceil(GAME_DURATION - elapsed));
    const hitRate = this.taps ? Math.round((this.hits / this.taps) * 100) : 0;
    const avg = this.reactions.length
      ? Math.round(this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length)
      : 0;
    const acc = this.hits ? Math.round((this.precSum / this.hits) * 100) : 0;
    if (
      remaining !== this.data.time ||
      this.hits !== this.data.hits ||
      this.miss !== this.data.miss ||
      hitRate !== this.data.hitRate ||
      avg !== this.data.avgTime ||
      acc !== this.data.acc
    ) {
      this.setData({
        time: remaining,
        hits: this.hits,
        miss: this.miss,
        hitRate,
        avgTime: avg,
        acc
      });
    }
  },

  endGame() {
    if (this._ended) return;
    this._ended = true;
    const elapsed = GAME_DURATION;
    const hitRate = this.taps ? this.hits / this.taps : 0;
    const avgMs = this.reactions.length
      ? this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length
      : 900;
    const centerAcc = this.hits ? this.precSum / this.hits : 0;
    const reactionComp = this.reactions.length ? Math.max(0, 1 - avgMs / 900) : 0;
    const raw = Math.round(hitRate * 30 + centerAcc * 50 + reactionComp * 20);
    const perfect = hitRate >= 1 && this.miss === 0 && centerAcc >= 0.999;
    const score = perfect ? 100 : Math.min(99, raw);
    getApp().globalData.result = {
      level: 'level3',
      levelName: '第三关 · 精准点击',
      score,
      metrics: [
        { label: '点击命中率', value: Math.round(hitRate * 100), unit: '%', max: 100 },
        { label: '中心精准度', value: Math.round(centerAcc * 100), unit: '%', max: 100 },
        { label: '漏点次数', value: this.miss, unit: '', max: 40 },
        { label: '平均反应时间', value: Math.round(avgMs), unit: 'ms', max: 900 }
      ]
    };
    this.setData({ state: 'over', finalScore: score });
    this.stopLoop();
    this.clearTimers();
    audio.over();
  },

  goBack() {
    if (this.data.state === 'playing') {
      wx.showModal({
        title: '返回主页',
        content: '本关进度将丢失，确定退出？',
        confirmText: '退出',
        confirmColor: '#f87171',
        success: (res) => {
          if (res.confirm) this.doBack();
        }
      });
    } else {
      this.doBack();
    }
  },

  doBack() {
    this.stopLoop();
    this.clearTimers();
    wx.reLaunch({ url: '/pages/index/index' });
  },

  toResult() {
    audio.click();
    wx.redirectTo({ url: '/pages/result/result' });
  },

  draw(t) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const W = this.W,
      H = this.H;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,229,255,0.05)';
    ctx.lineWidth = 1;
    const step = 48;
    for (let x = 0; x <= W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (const tg of this.targets) this.drawTarget(tg, t);
    for (const fx of this.effects) {
      const p = 1 - fx.life / 0.3;
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      const base = fx.prec != null ? fx.r * (0.55 + fx.prec * 0.45) : fx.r;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, base + p * 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (this.data.state === 'countdown') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,229,255,0.95)';
      ctx.font = 'bold 110px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 30;
      ctx.fillText(this.countdown === 0 ? 'GO!' : String(this.countdown), W / 2, H / 2);
      ctx.restore();
    }
  },

  drawTarget(tg, t) {
    const ctx = this.ctx;
    const { x, y, r, color } = tg;
    const pulse = 1 + Math.sin(t / 300) * 0.06;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.58 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
});

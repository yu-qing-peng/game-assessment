const audio = require('../../utils/audio');

const TOTAL_PAIRS = 20;
const TOTAL = TOTAL_PAIRS * 2;
const OB_COLORS = ['#00e5ff', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6'];

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function sysInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
}

Page({
  data: {
    state: 'ready',
    score: 0,
    success: 0,
    fail: 0,
    rate: 0,
    avgTime: 0,
    remain: TOTAL,
    showHints: false,
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
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
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
        this.resetField();
        this.drawFrame(0);
      });
  },

  resetField() {
    const W = this.W,
      H = this.H;
    this.dividerX = W / 2;
    const platLen = Math.min(120, W * 0.16);
    const platThick = Math.min(48, H * 0.18);
    this.baseLen = platLen;
    this.leftP = { x: W / 4 - platLen / 2, y: H - platThick - 30, w: platLen, h: platThick };
    this.rightP = { x: W - platThick - 30, y: H / 2 - platLen / 2, w: platThick, h: platLen };
    this.obstacles = [];
    this.effects = [];
    this.pairsSpawned = 0;
    this.spawnAcc = 0.5;
    this.success = 0;
    this.fail = 0;
    this.reactions = [];
    this.resolved = 0;
    this.score = 0;
    this.elapsed = 0;
    this._ended = false;
  },

  startGame() {
    audio.click();
    this.resetField();
    this.setData({
      state: 'countdown',
      score: 0,
      success: 0,
      fail: 0,
      rate: 0,
      avgTime: 0,
      remain: TOTAL,
      showHints: false
    });
    this.countdown = 3;
    this.lastT = 0;
    this.startLoop();
    this.tickCountdown();
  },

  tickCountdown() {
    audio.countdown();
    if (this.countdown === 0) {
      audio.go();
      this.setData({ state: 'playing', showHints: true });
      this.playStart = Date.now();
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => {
        this.setData({ showHints: false });
        this.hintTimer = null;
      }, 4000);
      return;
    }
    this.cdTimer = setTimeout(() => {
      this.countdown -= 1;
      this.tickCountdown();
    }, 800);
  },

  togglePause() {
    if (this.data.state !== 'playing') return;
    this.setData({ state: 'paused' });
    audio.click();
  },

  resumeGame() {
    this.setData({ state: 'playing' });
    this.lastT = 0;
    audio.click();
  },

  quitGame() {
    this.doBack();
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
    this.drawFrame(t);
  },

  update(dt) {
    this.elapsed += dt;
    const progress = this.pairsSpawned / TOTAL_PAIRS;
    const shrink = 1 - progress * 0.45;
    const newW = this.baseLen * shrink;
    if (this.leftP.w !== newW) {
      const c = this.leftP.x + this.leftP.w / 2;
      this.leftP.w = newW;
      this.leftP.x = clamp(c - newW / 2, 0, this.dividerX - newW);
    }
    if (this.rightP.h !== newW) {
      const c = this.rightP.y + this.rightP.h / 2;
      this.rightP.h = newW;
      this.rightP.y = clamp(c - newW / 2, 0, this.H - newW);
    }
    this.spawnAcc += dt;
    const base = Math.max(0.75, 1.45 - progress * 0.7);
    const interval = Math.max(0.65, base * (0.9 + Math.random() * 0.2));
    if (this.spawnAcc >= interval) {
      this.spawnAcc -= interval;
      this.spawnPair(progress);
    }
    const now = Date.now();
    for (const ob of this.obstacles) {
      if (ob.state !== 'active') continue;
      if (ob.side === 'left') ob.y += ob.speed * dt;
      else ob.x += ob.speed * dt;
    }
    for (const ob of this.obstacles) {
      if (ob.state !== 'active') continue;
      if (ob.side === 'left') {
        if (this.hitTest(ob, this.leftP)) this.catchOb(ob, now);
        else if (ob.y > this.H + 20) this.missOb(ob);
      } else {
        if (this.hitTest(ob, this.rightP)) this.catchOb(ob, now);
        else if (ob.x > this.W + 20) this.missOb(ob);
      }
    }
    for (const fx of this.effects) fx.life -= dt;
    this.effects = this.effects.filter((fx) => fx.life > 0);
  },

  spawnPair(progress) {
    const size = 34 + Math.random() * 16;
    const lx = 20 + Math.random() * (this.dividerX - size - 40);
    const ry = 20 + Math.random() * (this.H - size - 40);
    const speed = (0.9 + Math.random() * 0.3) * (230 + progress * 330);
    this.obstacles.push(
      {
        side: 'left',
        x: lx,
        y: -size,
        size,
        speed,
        state: 'active',
        born: Date.now(),
        color: OB_COLORS[(Math.random() * OB_COLORS.length) | 0]
      },
      {
        side: 'right',
        x: this.dividerX + 16,
        y: ry,
        size,
        speed,
        state: 'active',
        born: Date.now(),
        color: OB_COLORS[(Math.random() * OB_COLORS.length) | 0]
      }
    );
    this.pairsSpawned++;
  },

  hitTest(ob, p) {
    return ob.x + ob.size > p.x && ob.x < p.x + p.w && ob.y + ob.size > p.y && ob.y < p.y + p.h;
  },

  catchOb(ob, now) {
    ob.state = 'caught';
    this.success++;
    this.score += 10;
    this.reactions.push(now - ob.born);
    this.effects.push({
      x: ob.x + ob.size / 2,
      y: ob.y + ob.size / 2,
      color: ob.color,
      life: 0.35,
      r: ob.size / 2
    });
    audio.success();
    audio.vibrate('light');
    this.resolved++;
    this.refreshHUD();
    if (this.resolved >= TOTAL) this.endGame();
  },

  missOb(ob) {
    ob.state = 'missed';
    this.fail++;
    audio.fail();
    audio.vibrate('light');
    this.resolved++;
    this.refreshHUD();
    if (this.resolved >= TOTAL) this.endGame();
  },

  refreshHUD() {
    const resolved = this.success + this.fail;
    const rate = resolved ? Math.round((this.success / resolved) * 100) : 0;
    const avg = this.reactions.length
      ? Math.round(this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length)
      : 0;
    this.setData({
      score: this.score,
      success: this.success,
      fail: this.fail,
      rate,
      avgTime: avg,
      remain: TOTAL - resolved
    });
  },

  onTouchStart(e) {
    this.control(e);
  },

  onTouchMove(e) {
    this.control(e);
  },

  onTouchEnd() {},

  control(e) {
    if (this.data.state !== 'playing' || !this.leftP) return;
    const touches = e.touches || [];
    for (const t of touches) {
      if (t.x < this.dividerX) {
        this.leftP.x = clamp(t.x - this.leftP.w / 2, 0, this.dividerX - this.leftP.w);
      } else {
        this.rightP.y = clamp(t.y - this.rightP.h / 2, 0, this.H - this.rightP.h);
      }
    }
  },

  endGame() {
    if (this._ended) return;
    this._ended = true;
    const successRate = this.success / TOTAL;
    const avgMs = this.reactions.length
      ? this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length
      : 1200;
    let score = 100;
    if (successRate < 1) {
      const reactScore = this.success ? Math.max(0, 1 - avgMs / 1200) : 0;
      score = Math.round(successRate * 60 + reactScore * 25 + (this.success > 0 ? 15 : 0));
      score = Math.max(0, Math.min(99, score));
    }
    getApp().globalData.result = {
      level: 'level1',
      levelName: '第一关 · 左右手协调',
      score,
      metrics: [
        { label: '成功次数', value: this.success, unit: '', max: TOTAL },
        { label: '失误次数', value: this.fail, unit: '', max: TOTAL },
        { label: '完成率', value: Math.round(successRate * 100), unit: '%', max: 100 },
        { label: '平均反应时间', value: Math.round(avgMs), unit: 'ms', max: 1200 }
      ]
    };
    this.setData({ state: 'over', finalScore: score });
    this.stopLoop();
    this.clearTimers();
    audio.over();
  },

  drawFrame() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const W = this.W,
      H = this.H;
    ctx.clearRect(0, 0, W, H);
    const st = this.data.state;
    if (st === 'playing') {
      this.drawBackground();
      for (const ob of this.obstacles) {
        if (ob.state === 'active') this.drawObstacle(ob);
      }
      this.drawPlatform(this.leftP, true);
      this.drawPlatform(this.rightP, false);
      for (const fx of this.effects) {
        const p = 1 - fx.life / 0.35;
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r + p * 42, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (st === 'countdown') {
      this.drawBackground();
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

  drawBackground() {
    const ctx = this.ctx;
    const W = this.W,
      H = this.H;
    ctx.fillStyle = 'rgba(0,229,255,0.03)';
    ctx.fillRect(0, 0, this.dividerX, H);
    ctx.fillStyle = 'rgba(139,92,246,0.03)';
    ctx.fillRect(this.dividerX, 0, W - this.dividerX, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(this.dividerX, 0);
    ctx.lineTo(this.dividerX, H);
    ctx.stroke();
    ctx.setLineDash([]);
  },

  drawObstacle(ob) {
    const ctx = this.ctx;
    const { x, y, size, color } = ob;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    this.roundRect(x + 3, y + 3, size - 6, size - 6, 6);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
  },

  drawPlatform(p, horizontal) {
    const ctx = this.ctx;
    const c1 = horizontal ? '#00e5ff' : '#a78bfa';
    const c2 = horizontal ? '#2563eb' : '#7c3aed';
    const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.save();
    ctx.shadowColor = c1;
    ctx.shadowBlur = 18;
    ctx.fillStyle = grad;
    this.roundRect(p.x, p.y, p.w, p.h, 12);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    this.roundRect(p.x, p.y, p.w, p.h, 12);
    ctx.stroke();
  },

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }
});

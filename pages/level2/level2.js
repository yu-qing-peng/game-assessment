const audio = require('../../utils/audio');

const POOL = ['#22d3ee', '#ec4899', '#8b5cf6', '#4ade80', '#fde047', '#ef4444', '#3b82f6', '#fb923c', '#a3e635'];
const MIN_COLOR_DIST = 110;
const ROUND_COUNTS = [3, 4, 5, 6, 7];
const TOTAL_TARGETS = ROUND_COUNTS.reduce((a, b) => a + b, 0);
const MAX_PER_COL = 3;

function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function colorDist(a, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 255) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 255) * (b1 - b2) ** 2);
}

function colorsDistinct(colors) {
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (colors[i] !== colors[j] && colorDist(colors[i], colors[j]) < MIN_COLOR_DIST) return false;
    }
  }
  return true;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
function range(n) {
  const r = [];
  for (let i = 0; i < n; i++) r.push(i);
  return r;
}
function sysInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
}

Page({
  data: {
    state: 'ready',
    round: 0,
    targetCount: 0,
    correct: 0,
    wrong: 0,
    time: 0,
    accuracy: 100,
    W: 0,
    H: 0,
    gridX: 0,
    gridY: 0,
    gridSize: 0,
    cell: 0,
    blockSize: 84,
    phaseLocked: false,
    finalScore: 0,
    cells: [],
    blocks: [],
    slots: []
  },

  onLoad() {
    const info = sysInfo();
    this.W = info.windowWidth;
    this.H = info.windowHeight;
    this.computeLayout();
  },

  onReady() {
    audio.init();
  },

  onUnload() {
    this.clearTimers();
  },

  onHide() {
    this.clearTimers();
  },

  clearTimers() {
    const ids = [this.timer, this.roundTimer, this.showTimer, this.endTimer];
    for (const t of ids) {
      if (t) {
        clearInterval(t);
        clearTimeout(t);
      }
    }
    this.timer = this.roundTimer = this.showTimer = this.endTimer = null;
  },

  computeLayout() {
    const W = this.W,
      H = this.H;
    const blockSize = Math.max(60, Math.min(92, Math.round(H * 0.26)));
    const gridSize = Math.max(215, Math.min(320, H - 135));
    const cell = gridSize / 3;
    const colW = blockSize + 12;
    const paletteW = 3 * colW + 24;
    const total = gridSize + 70 + paletteW;
    const gridX = Math.max(6, Math.round((W - total) / 2));
    const gridY = Math.max(74, Math.round((H - gridSize) / 2));
    const paletteX = gridX + gridSize + 70;
    this.blockSize = blockSize;
    this.cell = cell;
    this.gridX = gridX;
    this.gridY = gridY;
    this.paletteX = paletteX;
    this.cellRects = [];
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3),
        c = i % 3;
      this.cellRects.push({ x: gridX + c * cell, y: gridY + r * cell });
    }
    this.setData({
      W,
      H,
      gridX,
      gridY,
      gridSize,
      cell,
      blockSize
    });
  },

  startGame() {
    audio.click();
    this.correct = 0;
    this.wrong = 0;
    this.round = 0;
    this._pos = {};
    this.startTs = Date.now();
    this._frozenMs = 0;
    this._pauseStart = null;
    this.setData({ state: 'rounding', correct: 0, wrong: 0, time: 0, accuracy: 100 });
    this.startTimer();
    this.nextRound();
  },

  startTimer() {
    this.clearTimers();
    this.timer = setInterval(() => {
      const st = this.data.state;
      if (st === 'playing' || st === 'show' || st === 'rounding') {
        const frozen = this._frozenMs + (this._pauseStart ? Date.now() - this._pauseStart : 0);
        const s = Math.round((Date.now() - this.startTs - frozen) / 1000);
        if (s !== this._lastTime) {
          this._lastTime = s;
          this.setData({ time: s });
        }
      }
    }, 500);
  },

  nextRound() {
    this.round++;
    if (this.round > ROUND_COUNTS.length) {
      this.finish();
      return;
    }
    this.placedCount = 0;
    const { blocks, slots, blockSize } = this.buildRound(this.round);
    this.slots = slots;
    this._pos = {};
    this.showing = false;
    this.setData({
      round: this.round,
      targetCount: blocks.length,
      state: 'rounding',
      phaseLocked: true,
      cells: this.decorateCells(false),
      blocks,
      slots,
      blockSize
    });
    audio.countdown();
    this.roundTimer = setTimeout(() => {
      if (this.round > ROUND_COUNTS.length) return;
      this.showing = true;
      audio.go();
      this._pauseStart = Date.now();
      this.setData({ state: 'show', cells: this.decorateCells(true) });
      this.showTimer = setTimeout(() => {
        if (this.round > ROUND_COUNTS.length) return;
        this.showing = false;
        if (this._pauseStart) {
          this._frozenMs += Date.now() - this._pauseStart;
          this._pauseStart = null;
        }
        this.setData({
          state: 'playing',
          phaseLocked: false,
          cells: this.decorateCells(false)
        });
        this.roundStart = Date.now();
      }, 1800 + (this.round - 1) * 200);
    }, 800);
  },

  buildRound(roundIdx) {
    const count = ROUND_COUNTS[roundIdx - 1];
    const colors = this.pickColors(count);
    const positions = shuffle(range(9)).slice(0, count);
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const pi = positions.indexOf(i);
      cells.push({
        index: i,
        color: pi >= 0 ? colors[pi] : '',
        target: pi >= 0,
        filled: false
      });
    }
    this.cells = cells;
    const gap = 12;
    const cols = Math.ceil(count / MAX_PER_COL);
    const colRows = Math.ceil(count / cols);
    let bSize = this.blockSize;
    const maxByH = (this.H - 40 - (colRows - 1) * gap) / colRows;
    if (maxByH < bSize) bSize = Math.max(46, Math.floor(maxByH));
    if (bSize > this.cell) bSize = Math.max(42, Math.floor(this.cell));
    this.curBlockSize = bSize;
    const colW = bSize + gap;
    const slotH = colRows * bSize + (colRows - 1) * gap;
    const slotTop = Math.round((this.H - slotH) / 2);
    const order = shuffle(range(count));
    const blocks = [];
    const slots = [];
    for (let i = 0; i < count; i++) {
      const bi = order[i];
      const col = Math.floor(bi / colRows);
      const row = bi % colRows;
      const x = this.paletteX + 12 + col * colW;
      const y = slotTop + row * (bSize + gap);
      blocks.push({
        id: 'b' + roundIdx + '_' + i,
        color: colors[i],
        x,
        y,
        placed: false,
        disabled: false
      });
      slots.push({ id: 's' + roundIdx + '_' + i, x, y });
    }
    return { blocks, slots, blockSize: bSize };
  },

  pickColors(count) {
    let base = shuffle(POOL).slice(0, count);
    for (let tries = 0; tries < 30 && !colorsDistinct(base); tries++) {
      base = shuffle(POOL).slice(0, count);
    }
    let dupN = 0;
    if (count === 5) {
      dupN = Math.random() < 0.5 ? 1 : 0;
    } else if (count >= 6) {
      dupN = 1;
      if (count >= 7 && Math.random() < 0.5) dupN = 2;
    }
    for (let k = 0; k < dupN; k++) {
      const i = 1 + ((Math.random() * (count - 1)) | 0);
      base[i] = base[(Math.random() * i) | 0];
    }
    return base;
  },

  decorateCells(show) {
    return this.cells.map((c) => {
      let s = 'width:' + this.cell + 'px;height:' + this.cell + 'px;';
      if (show && c.target && !c.filled) s += 'background:' + c.color + ';';
      return {
        index: c.index,
        color: c.color,
        target: c.target,
        filled: c.filled,
        show,
        style: s
      };
    });
  },

  onBlockMove(e) {
    const i = e.currentTarget.dataset.index;
    this._pos = this._pos || {};
    this._pos[i] = { x: e.detail.x, y: e.detail.y };
  },

  onBlockDrop(e) {
    if (this.data.state !== 'playing') return;
    const i = e.currentTarget.dataset.index;
    const b = this.data.blocks[i];
    if (!b || b.placed || b.disabled) return;
    const p = (this._pos && this._pos[i]) || null;
    if (!p) return;
    this.handleDrop(i, b, p);
  },

  handleDrop(i, b, p) {
    const bs = this.curBlockSize || this.blockSize;
    const cx = p.x + bs / 2;
    const cy = p.y + bs / 2;
    let cellIdx = -1;
    for (let k = 0; k < 9; k++) {
      const r = this.cellRects[k];
      if (cx >= r.x && cx <= r.x + this.cell && cy >= r.y && cy <= r.y + this.cell) {
        cellIdx = k;
        break;
      }
    }
    if (cellIdx < 0) {
      this.returnToSlot(i);
      return;
    }
    const cell = this.cells[cellIdx];
    if (cell.target && !cell.filled && cell.color === b.color) {
      cell.filled = true;
      const blocks = this.data.blocks.slice();
      blocks[i] = Object.assign({}, blocks[i], {
        placed: true,
        disabled: true,
        x: this.cellRects[cellIdx].x + (this.cell - bs) / 2,
        y: this.cellRects[cellIdx].y + (this.cell - bs) / 2
      });
      this.correct++;
      this.placedCount++;
      audio.success();
      audio.vibrate('light');
      this.setData({ blocks, cells: this.decorateCells(this.showing) });
      this.refreshHUD();
      this.checkRoundClear();
    } else {
      this.wrong++;
      audio.fail();
      audio.vibrate('light');
      this.returnToSlot(i);
      this.refreshHUD();
    }
  },

  returnToSlot(i) {
    const slot = this.slots[i];
    if (!slot) return;
    const blocks = this.data.blocks.slice();
    blocks[i] = Object.assign({}, blocks[i], { x: slot.x, y: slot.y });
    this.setData({ blocks });
  },

  checkRoundClear() {
    if (this.placedCount === ROUND_COUNTS[this.round - 1]) {
      audio.roundClear();
      this.setData({ state: 'clear' });
      this.roundTimer = setTimeout(() => this.nextRound(), 900);
    }
  },

  refreshHUD() {
    const acc =
      this.correct + this.wrong > 0
        ? Math.round((this.correct / (this.correct + this.wrong)) * 100)
        : 100;
    this.setData({ correct: this.correct, wrong: this.wrong, accuracy: acc });
  },

  finish() {
    this.clearTimers();
    const totalMs = Date.now() - this.startTs - (this._frozenMs || 0);
    const acc = this.correct + this.wrong > 0 ? this.correct / (this.correct + this.wrong) : 1;
    const timeScore = Math.max(0, 1 - totalMs / 120000);
    const score = Math.round(acc * 50 + timeScore * 30 + 20 * (this.correct / TOTAL_TARGETS));
    getApp().globalData.result = {
      level: 'level2',
      levelName: '第二关 · 位置与颜色匹配',
      score,
      metrics: [
        { label: '正确放置', value: this.correct, unit: '', max: TOTAL_TARGETS },
        { label: '错误拖拽', value: this.wrong, unit: '', max: TOTAL_TARGETS },
        { label: '完成时间', value: Math.round(totalMs / 1000), unit: 's', max: 120 },
        { label: '匹配准确率', value: Math.round(acc * 100), unit: '%', max: 100 }
      ]
    };
    this.setData({ state: 'over', finalScore: score });
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
    this.clearTimers();
    wx.reLaunch({ url: '/pages/index/index' });
  },

  toResult() {
    audio.click();
    wx.redirectTo({ url: '/pages/result/result' });
  }
});

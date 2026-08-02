const app = getApp();
const store = require('../../utils/store');
const audio = require('../../utils/audio');

Page({
  data: {
    muted: false,
    levels: [
      { id: 'level1', name: '左右手协调', desc: '双手同步操控 · 接住落物', icon: 'icon-hands', best: '-' },
      { id: 'level2', name: '位置与颜色', desc: '拖拽匹配 · 五轮递进', icon: 'icon-grid', best: '-' },
      { id: 'level3', name: '精准点击', desc: '30 秒极速点击', icon: 'icon-target', best: '-' }
    ],
    avg: '-'
  },

  onShow() {
    audio.init();
    const scores = store.getBestScores();
    const levels = this.data.levels.map((l) => ({
      ...l,
      best: scores[l.id] != null ? scores[l.id] : '-'
    }));
    const arr = levels.filter((l) => typeof l.best === 'number');
    const avg = arr.length
      ? Math.round(arr.reduce((s, l) => s + l.best, 0) / arr.length)
      : '-';
    this.setData({ levels, avg, muted: audio.isMuted() });
  },

  toggleMute() {
    const muted = !audio.isMuted();
    audio.setMuted(muted);
    this.setData({ muted });
  },

  enterLevel(e) {
    const idx = e.currentTarget.dataset.index;
    const id = this.data.levels[idx].id;
    audio.click();
    wx.navigateTo({ url: '/pages/' + id + '/' + id });
  }
});

const audio = require('../../utils/audio');
const store = require('../../utils/store');

Page({
  data: {
    levelName: '',
    score: 0,
    grade: 'D',
    gradeClass: 'D',
    starArr: [0, 1, 2, 3, 4],
    starFilled: 1,
    isNewRecord: false,
    best: 0,
    metrics: []
  },

  onLoad() {
    const res = getApp().globalData.result || {
      level: '',
      levelName: '成绩单',
      score: 0,
      metrics: []
    };
    this.result = res;
    const saved = store.saveScore(res.level, res.score);
    const grade = store.grade(res.score);
    const metrics = (res.metrics || []).map((m) => ({
      label: m.label,
      text: m.unit ? m.value + m.unit : String(m.value),
      percent: m.max ? Math.min(100, Math.round((m.value / m.max) * 100)) : 0
    }));
    this.setData({
      levelName: res.levelName,
      grade,
      gradeClass: grade,
      starFilled: store.starCount(res.score),
      isNewRecord: saved.isNewRecord,
      best: saved.best,
      metrics
    });
    this.animateScore();
  },

  animateScore() {
    const target = this.result.score;
    let cur = 0;
    const step = Math.max(1, Math.round(target / 40));
    this.scoreTimer = setInterval(() => {
      cur += step;
      if (cur >= target) {
        cur = target;
        clearInterval(this.scoreTimer);
        this.scoreTimer = null;
      }
      this.setData({ score: cur });
    }, 30);
  },

  onUnload() {
    if (this.scoreTimer) {
      clearInterval(this.scoreTimer);
      this.scoreTimer = null;
    }
  },

  retry() {
    audio.click();
    wx.redirectTo({ url: '/pages/' + this.result.level + '/' + this.result.level });
  },

  done() {
    audio.click();
    wx.reLaunch({ url: '/pages/index/index' });
  }
});

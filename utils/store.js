const KEY = 'cga_best_scores';

function getBestScores() {
  try {
    return wx.getStorageSync(KEY) || {};
  } catch (e) {
    return {};
  }
}

function saveScore(levelId, score) {
  const all = getBestScores();
  const best = all[levelId] || 0;
  const isNewRecord = score > best;
  if (isNewRecord) {
    all[levelId] = score;
    try {
      wx.setStorageSync(KEY, all);
    } catch (e) {}
  }
  return { best: Math.max(best, score), isNewRecord };
}

function grade(score) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function starCount(score) {
  if (score >= 90) return 5;
  if (score >= 80) return 4;
  if (score >= 70) return 3;
  if (score >= 60) return 2;
  return 1;
}

module.exports = {
  getBestScores,
  saveScore,
  grade,
  starCount
};

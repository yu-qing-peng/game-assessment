const audio = require('./utils/audio');

App({
  globalData: {
    result: null
  },
  onLaunch() {
    audio.init();
  }
});

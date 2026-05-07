const { textTemplates, imageTemplates } = require('../../utils/ai-image-templates.js');

Page({
  data: {
    activeMode: 'text',
    textTemplates,
    imageTemplates,
    templates: textTemplates
  },

  onLoad: function (options) {
    const activeMode = options && options.mode === 'image' ? 'image' : 'text';
    this.setData({
      activeMode,
      templates: activeMode === 'image' ? imageTemplates : textTemplates
    });
  },

  onSwitchMode: function (event) {
    const activeMode = event.currentTarget.dataset.mode;
    this.setData({
      activeMode,
      templates: activeMode === 'image' ? imageTemplates : textTemplates
    });
  },

  onSelectTemplate: function (event) {
    const template = event.currentTarget.dataset.template;
    if (!template) return;

    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && eventChannel.emit) {
      eventChannel.emit('selectTemplate', template);
    } else {
      wx.setStorageSync('aiImageSelectedTemplate', template);
    }

    wx.navigateBack();
  }
});

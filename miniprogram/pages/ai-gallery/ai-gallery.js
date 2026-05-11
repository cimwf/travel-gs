const api = require('../../utils/api.js');
const { formatAiImageErrorMessage } = require('../../utils/ai-image-error.js');

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

Page({
  data: {
    loading: false,
    deletingId: '',
    summaryReady: false,
    summary: {
      total: 3,
      used: 0,
      remaining: 3,
      generatedCount: 0
    },
    works: [],
    isEmpty: true
  },

  onLoad: function () {
    this.loadWorks();
  },

  onPullDownRefresh: function () {
    this.loadWorks().finally(() => wx.stopPullDownRefresh());
  },

  loadWorks: async function () {
    this.setData({ loading: true });
    try {
      const res = await api.aiImageList();
      const works = (res.images || []).map(item => this.formatWork(item));
      this.setData({
        summary: res.summary ? this.normalizeSummary(res.summary) : this.data.summary,
        summaryReady: Boolean(res.summary),
        works,
        isEmpty: works.length === 0
      });
    } catch (err) {
      console.error('加载 AI 作品失败', err);
      wx.showToast({
        title: this.formatAiImageErrorText(err, '加载失败'),
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatWork: function (item) {
    const images = (item.images || []).map((image, index) => {
      const publicUrl = this.normalizeImageUrl(image.publicUrl);
      const status = image.status || item.status || (publicUrl ? 'completed' : 'queued');
      return {
        ...image,
        id: image.id || `${item.taskId || item._id || 'image'}_${index}`,
        status,
        imageUrl: publicUrl,
        saveUrl: publicUrl,
        copyUrl: publicUrl,
        metaText: this.formatImageMeta(image),
        errorText: this.formatAiImageErrorText(image.error || item.error)
      };
    });
    const firstImage = images[0] || {};
    const status = item.status || firstImage.status || 'queued';
    return {
      ...item,
      status,
      statusText: this.getStatusText(status),
      statusDesc: this.getStatusDesc(status),
      imageUrl: firstImage.imageUrl || this.normalizeImageUrl(item.publicUrl) || this.normalizeImageUrl(item.imageUrl) || '',
      saveUrl: firstImage.saveUrl || this.normalizeImageUrl(item.publicUrl) || this.normalizeImageUrl(item.imageUrl) || '',
      copyUrl: firstImage.copyUrl || this.normalizeImageUrl(item.publicUrl) || this.normalizeImageUrl(item.imageUrl) || '',
      images,
      createdText: this.formatTime(item.createdAt),
      channelName: item.channelName || '',
      styleText: item.style || '默认风格',
      metaText: firstImage.metaText || '',
      errorText: this.formatAiImageErrorText(item.error || firstImage.errorText)
    };
  },

  normalizeSummary: function (summary = {}) {
    const total = toSafeNumber(summary.total, 3);
    const used = toSafeNumber(summary.used, toSafeNumber(summary.generatedCount));

    return {
      total,
      used,
      remaining: typeof summary.remaining === 'number' ? toSafeNumber(summary.remaining) : Math.max(0, total - used),
      generatedCount: toSafeNumber(summary.generatedCount, used)
    };
  },

  normalizeImageUrl: function (url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!value) return '';
    if (value.startsWith('https://') || value.startsWith('http://') || value.startsWith('wxfile://')) {
      return value;
    }
    if (value.startsWith('//')) {
      return `https:${value}`;
    }
    if (value.includes('.') && value.includes('/')) {
      return `https://${value}`;
    }
    return value;
  },

  formatImageMeta: function (image) {
    const parts = [];
    if (image.width && image.height) {
      parts.push(`${image.width} x ${image.height}`);
    }
    if (image.format) {
      parts.push(String(image.format).toUpperCase());
    }
    if (image.bytes) {
      const mb = image.bytes / 1024 / 1024;
      parts.push(`${mb >= 1 ? mb.toFixed(1) : (image.bytes / 1024).toFixed(0)}${mb >= 1 ? 'MB' : 'KB'}`);
    }
    return parts.join(' · ');
  },

  getStatusText: function (status) {
    if (status === 'completed') return '生成完成';
    if (status === 'failed' || status === 'cancelled') return '生成失败';
    return '生成中';
  },

  getStatusDesc: function (status) {
    if (status === 'completed') return '点击图片可放大查看';
    if (status === 'failed' || status === 'cancelled') return '这次没有生成成功，可以换个描述再试';
    return '高清图片正在生成，请稍后刷新作品集';
  },

  formatTime: function (timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  onPreviewImage: function (event) {
    const url = event.currentTarget.dataset.url;
    const urls = this.data.works
      .filter(item => item.status === 'completed' && item.imageUrl)
      .map(item => item.imageUrl);

    if (!url) return;
    wx.previewImage({ current: url, urls });
  },

  onSaveImage: function (event) {
    const url = event.currentTarget.dataset.url;
    const fallbackUrl = event.currentTarget.dataset.fallbackUrl;
    if (!url) return;

    wx.getSetting({
      success: (settingRes) => {
        if (settingRes.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '请允许保存图片到相册。',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) wx.openSetting();
            }
          });
          return;
        }

        this.downloadAndSaveImage(url, fallbackUrl);
      },
      fail: () => this.downloadAndSaveImage(url, fallbackUrl)
    });
  },

  downloadAndSaveImage: function (url, fallbackUrl) {
    wx.showLoading({ title: '保存中' });
    wx.downloadFile({
      url,
      success: (downloadRes) => {
        if (downloadRes.statusCode !== 200) {
          if (fallbackUrl && fallbackUrl !== url) {
            wx.hideLoading();
            this.downloadAndSaveImage(fallbackUrl, '');
            return;
          }
          wx.showToast({
            title: downloadRes.statusCode === 401 || downloadRes.statusCode === 403 ? '图片链接已过期，请刷新后重试' : `图片下载失败(${downloadRes.statusCode})`,
            icon: 'none',
            duration: 3000
          });
          return;
        }

        wx.saveImageToPhotosAlbum({
          filePath: downloadRes.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: (err) => {
            console.error('保存图片到相册失败', err);
            wx.showToast({
              title: this.formatSaveError(err, '保存失败，请检查相册权限'),
              icon: 'none',
              duration: 3000
            });
          }
        });
      },
      fail: (err) => {
        console.error('下载图片失败', err);
        if (fallbackUrl && fallbackUrl !== url) {
          wx.hideLoading();
          this.downloadAndSaveImage(fallbackUrl, '');
          return;
        }
        wx.showToast({
          title: this.formatDownloadError(err),
          icon: 'none',
          duration: 3000
        });
      },
      complete: () => wx.hideLoading()
    });
  },

  onCopyLink: function (event) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;

    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    });
  },

  collectWorkFileIDs: function (work = {}) {
    const fileIDs = [];
    const add = (value) => {
      if (!value || typeof value !== 'string') return;
      const next = value.trim();
      if (next && !fileIDs.includes(next)) {
        fileIDs.push(next);
      }
    };

    add(work.referenceFileID);
    (work.images || []).forEach((image) => {
      add(image.key);
      add(image.fileID);
      add(image.cloudPath);
      add(image.url);
      add(image.signedUrl);
      add(image.publicUrl);
      add(image.imageUrl);
      add(image.saveUrl);
      add(image.copyUrl);
    });
    add(work.imageUrl);
    add(work.saveUrl);
    add(work.copyUrl);
    add(work.publicUrl);
    return fileIDs;
  },

  onDeleteWork: function (event) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.deletingId) return;
    const work = this.data.works.find(item => item._id === id || item.taskId === id) || {};
    const fileIDs = this.collectWorkFileIDs(work);

    wx.showModal({
      title: '删除作品',
      content: '删除后不可恢复，确认是否删除。',
      confirmText: '删除',
      confirmColor: '#D92D20',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;

        this.setData({ deletingId: id });
        wx.showLoading({ title: '删除中' });
        try {
          const res = await api.aiImageDelete(id, fileIDs);
          const works = this.data.works.filter(item => item._id !== id && item.taskId !== id);
          const nextData = {
            works,
            isEmpty: works.length === 0
          };
          if (res.summary) {
            nextData.summary = this.normalizeSummary(res.summary);
            nextData.summaryReady = true;
          }
          this.setData(nextData);
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          console.error('删除 AI 作品失败', err);
          wx.showToast({
            title: this.formatAiImageErrorText(err, '删除失败'),
            icon: 'none'
          });
        } finally {
          wx.hideLoading();
          this.setData({ deletingId: '' });
        }
      }
    });
  },

  formatAiImageErrorText: function (message, fallback = '这次没有生成成功，可以换个描述或换张参考图再试') {
    return formatAiImageErrorMessage(message, fallback);
  },

  formatDownloadError: function (err) {
    const message = err && (err.errMsg || err.message || String(err));
    if (message && (message.includes('domain') || message.includes('合法域名'))) {
      return '请配置 downloadFile 合法域名';
    }
    if (message && message.includes('url not in domain list')) {
      return '请配置下载合法域名';
    }
    if (message && message.includes('timeout')) {
      return '图片下载超时';
    }
    return '图片下载失败';
  },

  formatSaveError: function (err, fallback) {
    const message = err && (err.errMsg || err.message || String(err));
    if (message && (message.includes('auth deny') || message.includes('authorize'))) {
      return '请允许保存到相册';
    }
    return fallback;
  }
});

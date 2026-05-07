const api = require('../../utils/api.js');

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

Page({
  data: {
    loading: false,
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
        title: this.formatErrorMessage(err, '加载失败'),
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatWork: function (item) {
    const images = (item.images || []).map((image, index) => {
      const signedUrl = this.normalizeImageUrl(image.signedUrl);
      const url = this.normalizeImageUrl(image.url);
      const publicUrl = this.normalizeImageUrl(image.publicUrl);
      const imageUrl = signedUrl || url || publicUrl || '';
      const saveUrl = url || signedUrl || publicUrl || imageUrl || '';
      const status = image.status || item.status || (imageUrl ? 'completed' : 'queued');
      return {
        ...image,
        id: image.id || `${item.taskId || item._id || 'image'}_${index}`,
        status,
        imageUrl,
        saveUrl,
        copyUrl: url || signedUrl || publicUrl || imageUrl || '',
        metaText: this.formatImageMeta(image),
        errorText: image.error || item.error || '请重新生成'
      };
    });
    const firstImage = images[0] || {};
    const status = item.status || firstImage.status || 'queued';
    return {
      ...item,
      status,
      statusText: this.getStatusText(status),
      statusDesc: this.getStatusDesc(status),
      imageUrl: firstImage.imageUrl || this.normalizeImageUrl(item.imageUrl) || '',
      saveUrl: firstImage.saveUrl || firstImage.imageUrl || this.normalizeImageUrl(item.imageUrl) || '',
      copyUrl: firstImage.copyUrl || this.normalizeImageUrl(item.imageUrl) || this.normalizeImageUrl(item.publicUrl) || '',
      images,
      createdText: this.formatTime(item.createdAt),
      metaText: firstImage.metaText || '',
      errorText: item.error || firstImage.errorText || '请重新生成'
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

  formatErrorMessage: function (err, fallback) {
    const message = err && (err.message || err.errMsg || err.error || String(err));
    if (!message) return fallback;
    return message.length > 60 ? message.slice(0, 60) : message;
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

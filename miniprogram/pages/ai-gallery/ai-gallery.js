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
    editMode: false,
    selectedIds: [],
    selectedCount: 0,
    allSelectableSelected: false,
    summaryReady: false,
    summary: {
      total: 3,
      used: 0,
      remaining: 3,
      generatedCount: 0
    },
    page: 1,
    pageSize: 5,
    hasMore: true,
    loadingMore: false,
    works: [],
    isEmpty: true
  },

  onLoad: function () {
    this.loadWorks(true);
  },

  onPullDownRefresh: function () {
    this.loadWorks(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom: function () {
    this.loadMoreWorks();
  },

  loadWorks: async function (reset = false) {
    const page = reset ? 1 : this.data.page;
    this.setData({
      loading: reset,
      loadingMore: !reset
    });
    try {
      const res = await api.aiImageList(page, this.data.pageSize);
      const nextWorks = (res.images || []).map(item => this.formatWork(item));
      const mergedWorks = reset ? nextWorks : this.data.works.concat(nextWorks);
      const works = this.decorateWorks(mergedWorks, this.data.selectedIds);
      this.setData({
        summary: res.summary ? this.normalizeSummary(res.summary) : this.data.summary,
        summaryReady: Boolean(res.summary),
        page,
        hasMore: Boolean(res.hasMore),
        works,
        isEmpty: works.length === 0,
        selectedIds: works.filter(item => item.selected).map(item => this.getWorkId(item)),
        selectedCount: works.filter(item => item.selected).length,
        allSelectableSelected: this.areAllSelectableSelected(works),
        editMode: works.length === 0 ? false : this.data.editMode
      });
    } catch (err) {
      if (!reset) {
        this.setData({ page: Math.max(page - 1, 1) });
      }
      console.error('加载 AI 作品失败', err);
      wx.showToast({
        title: this.formatAiImageErrorText(err, '加载失败'),
        icon: 'none'
      });
    } finally {
      this.setData({
        loading: false,
        loadingMore: false
      });
    }
  },

  loadMoreWorks: function () {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore || this.data.editMode) return;
    this.setData({
      page: this.data.page + 1
    }, () => {
      this.loadWorks(false);
    });
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
      deletable: this.isDeletableStatus(status),
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

  decorateWorks: function (works = [], selectedIds = []) {
    return works.map((work) => {
      const id = this.getWorkId(work);
      return {
        ...work,
        selected: Boolean(id) && selectedIds.includes(id)
      };
    });
  },

  getWorkId: function (work = {}) {
    return work._id || work.taskId || '';
  },

  isDeletableStatus: function (status) {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
  },

  areAllSelectableSelected: function (works = []) {
    const selectable = works.filter(item => item.deletable);
    return selectable.length > 0 && selectable.every(item => item.selected);
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

  onPrimaryAction: function () {
    if (this.data.editMode) {
      this.onDeleteSelected();
      return;
    }
    this.onToggleEditMode();
  },

  onSecondaryAction: function () {
    if (this.data.editMode) {
      this.onToggleEditMode();
      return;
    }
    if (this.data.loading || this.data.loadingMore) return;
    this.loadWorks(true);
  },

  onToggleEditMode: function () {
    const nextEditMode = !this.data.editMode;
    this.setData({
      editMode: nextEditMode,
      selectedIds: nextEditMode ? this.data.selectedIds : [],
      selectedCount: nextEditMode ? this.data.selectedCount : 0,
      allSelectableSelected: nextEditMode ? this.data.allSelectableSelected : false,
      works: nextEditMode ? this.data.works : this.decorateWorks(this.data.works, [])
    });
  },

  onCardTap: function (event) {
    const id = event.currentTarget.dataset.id;
    const url = event.currentTarget.dataset.url;

    if (this.data.editMode) {
      this.toggleSelectById(id);
      return;
    }

    if (!url) return;
    this.onPreviewImage({ currentTarget: { dataset: { url } } });
  },

  onToggleSelect: function (event) {
    const id = event.currentTarget.dataset.id;
    this.toggleSelectById(id);
  },

  toggleSelectById: function (id) {
    if (!id || this.data.deletingId) return;
    const work = this.data.works.find(item => this.getWorkId(item) === id);
    if (!work || !work.deletable) return;

    const selectedIds = this.data.selectedIds.includes(id)
      ? this.data.selectedIds.filter(item => item !== id)
      : this.data.selectedIds.concat(id);

    const works = this.decorateWorks(this.data.works, selectedIds);
    this.setData({
      selectedIds,
      works,
      selectedCount: selectedIds.length,
      allSelectableSelected: this.areAllSelectableSelected(works)
    });
  },

  onToggleSelectAll: function () {
    if (this.data.deletingId) return;
    const selectableIds = this.data.works
      .filter(item => item.deletable)
      .map(item => this.getWorkId(item))
      .filter(Boolean);

    const selectedIds = this.data.allSelectableSelected ? [] : selectableIds;
    const works = this.decorateWorks(this.data.works, selectedIds);
    this.setData({
      selectedIds,
      works,
      selectedCount: selectedIds.length,
      allSelectableSelected: this.areAllSelectableSelected(works)
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

  onDeleteSelected: function () {
    if (this.data.deletingId || this.data.selectedCount === 0) return;

    const selectedWorks = this.data.works.filter(item => item.selected && item.deletable);
    if (!selectedWorks.length) return;

    wx.showModal({
      title: '删除所选作品',
      content: `已选择 ${selectedWorks.length} 张作品，删除后不可恢复，确认继续吗？`,
      confirmText: '删除',
      confirmColor: '#D92D20',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;

        this.setData({ deletingId: 'batch' });
        wx.showLoading({ title: '删除中' });
        try {
          for (const work of selectedWorks) {
            // 串行删除，避免并发请求导致状态提示混乱。
            await api.aiImageDelete(this.getWorkId(work), this.collectWorkFileIDs(work));
          }

          await this.loadWorks(true);
          this.setData({
            editMode: false,
            selectedIds: [],
            selectedCount: 0,
            allSelectableSelected: false,
            works: this.decorateWorks(this.data.works, [])
          });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          console.error('批量删除 AI 作品失败', err);
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
  }
});

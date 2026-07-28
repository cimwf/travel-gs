// pages/community-publish/community-publish.js
var app = getApp();
var auth = require('../../utils/auth.js');
var api = require('../../utils/api.js');
var cosUpload = require('../../utils/cos-upload.js');

function normalizeMimeType(type) {
  var normalized = String(type || '').toLowerCase();
  if (normalized === 'jpg' || normalized === 'jpeg' || normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  if (normalized === 'png') return 'image/png';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return normalized;
  }
  return '';
}

Page({
  data: {
    content: '',
    contentLength: 0,
    maxContentLength: 300,
    images: [],          // { id, path, status, cosKey, url, width, height, size, mimeType, progress, errorMsg }
    maxImages: 9,
    location: null,
    hasLocation: false,
    submitting: false,
    uploadStage: '',
    uploadProgress: 0,
    uploadTotal: 0,
    errorMsg: '',
    authorName: '',
    authorAvatar: ''
  },

  onLoad: function () {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1500);
      return;
    }
    // Set author info for display
    var userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    this.setData({
      authorName: userInfo.nickname || '我',
      authorAvatar: userInfo.avatar || ''
    });
  },

  // ========== content ==========
  onContentInput: function (e) {
    var v = e.detail.value || '';
    if (v.length > this.data.maxContentLength) {
      this.setData({ content: v.slice(0, this.data.maxContentLength), contentLength: this.data.maxContentLength });
      return;
    }
    this.setData({ content: v, contentLength: v.length });
  },

  // ========== images ==========
  onAddImages: function () {
    var remaining = this.data.maxImages - this.data.images.length;
    if (remaining <= 0) return;
    var self = this;
    wx.chooseMedia({
      count: remaining, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'],
      success: function (res) {
        var newImages = res.tempFiles.map(function (f, i) {
          return { id: 'img_' + Date.now() + '_' + i, path: f.tempFilePath, status: 'compressing', size: f.size, progress: 0 };
        });
        self._invalidateUploadSession(self.data.images.concat(newImages));
        self.compressImages(newImages);
      }
    });
  },

  compressImages: function (images) {
    var self = this;
    images.forEach(function (img) {
      wx.compressImage({
        src: img.path, quality: 80,
        success: function (compressRes) {
          // Re-read actual file info after compression
          wx.getFileInfo({
            filePath: compressRes.tempFilePath,
            success: function (fileInfo) {
              wx.getImageInfo({
                src: compressRes.tempFilePath,
                success: function (info) {
                  var mime = normalizeMimeType(info.type || 'jpg');
                  if (!mime) {
                    self.updateImage(img.id, {
                      status: 'failed',
                      errorMsg: '仅支持 JPG、PNG 和 WebP 图片'
                    });
                    return;
                  }
                  self.updateImage(img.id, {
                    path: compressRes.tempFilePath,
                    size: fileInfo.size,
                    width: info.width,
                    height: info.height,
                    mimeType: mime,
                    status: 'pending'
                  });
                },
                fail: function () {
                  self.updateImage(img.id, {
                    path: compressRes.tempFilePath,
                    size: fileInfo.size,
                    status: 'failed',
                    errorMsg: '无法识别图片格式，请重试或更换图片'
                  });
                }
              });
            },
            fail: function () {
              self.updateImage(img.id, {
                path: compressRes.tempFilePath,
                status: 'failed',
                errorMsg: '无法读取图片，请重试或更换图片'
              });
            }
          });
        },
        fail: function () {
          // Fallback: use original
          wx.getFileInfo({
            filePath: img.path,
            success: function (fileInfo) {
              wx.getImageInfo({
                src: img.path,
                success: function (info) {
                  var mime = normalizeMimeType(info.type || 'jpg');
                  if (!mime) {
                    self.updateImage(img.id, {
                      status: 'failed',
                      errorMsg: '仅支持 JPG、PNG 和 WebP 图片'
                    });
                    return;
                  }
                  self.updateImage(img.id, {
                    size: fileInfo.size, width: info.width, height: info.height,
                    mimeType: mime,
                    status: 'pending'
                  });
                },
                fail: function () {
                  self.updateImage(img.id, {
                    status: 'failed',
                    errorMsg: '无法识别图片格式，请重试或更换图片'
                  });
                }
              });
            },
            fail: function () {
              self.updateImage(img.id, {
                status: 'failed',
                errorMsg: '无法读取图片，请重试或更换图片'
              });
            }
          });
        }
      });
    });
  },

  updateImage: function (id, updates) {
    var images = this.data.images.map(function (img) {
      return img.id === id ? Object.assign({}, img, updates) : img;
    });
    this.setData({ images: images });
  },

  onRemoveImage: function (e) {
    var id = e.currentTarget.dataset.id;
    var remainingImages = this.data.images.filter(function (img) { return img.id !== id; });
    this._invalidateUploadSession(remainingImages);
  },

  onPreviewImage: function (e) {
    var urls = this.data.images.map(function (img) { return img.path || img.url || ''; }).filter(Boolean);
    var current = e.currentTarget.dataset.src;
    wx.previewImage({ urls: urls, current: current || urls[0] });
  },

  onRetryImage: function (e) {
    var id = e.currentTarget.dataset.id;
    var img = this.data.images.find(function (i) { return i.id === id; });
    if (!img || img.status !== 'failed') return;
    this.updateImage(id, { status: 'pending', progress: 0, errorMsg: '' });
  },

  _invalidateUploadSession: function (images) {
    this._uploadSession = null;
    var resetImages = (images || this.data.images).map(function (img) {
      if (img.status === 'compressing') return img;
      return Object.assign({}, img, {
        status: 'pending',
        progress: 0,
        cosKey: '',
        key: '',
        url: '',
        uploadIndex: undefined
      });
    });
    this.setData({ images: resetImages });
  },

  // ========== location ==========
  onChooseLocation: function () {
    var self = this;
    wx.chooseLocation({
      success: function (res) {
        self.setData({
          location: { name: res.name || '', address: res.address || '', latitude: res.latitude, longitude: res.longitude },
          hasLocation: true
        });
      }
    });
  },

  onRemoveLocation: function () {
    this.setData({ location: null, hasLocation: false });
  },

  // ========== submit ==========
  onSubmit: function () {
    if (this.data.submitting) return;
    var self = this;
    var content = this.data.content;
    var images = this.data.images;
    var location = this.data.location;

    var hasContent = !!(content && content.trim());
    var hasImages = images.length > 0;
    var hasLocation = !!(location && location.name);

    if (!hasContent && !hasImages && !hasLocation) {
      wx.showToast({ title: '请填写正文、图片或定位', icon: 'none' }); return;
    }
    if (content.length > this.data.maxContentLength) {
      wx.showToast({ title: '正文不能超过 300 字', icon: 'none' }); return;
    }
    // Check oversized images using real file size after compression
    var oversized = images.some(function (img) { return (img.size || 0) > 10 * 1024 * 1024; });
    if (oversized) {
      wx.showToast({ title: '单张图片不能超过 10MB', icon: 'none' }); return;
    }

    this.setData({ submitting: true, errorMsg: '' });
    this._publishLoadingVisible = true;
    wx.showLoading({ title: hasImages ? '上传并发布中...' : '发布中...', mask: true });

    // Use async wrapper
    return (async function () {
      try {
        var uploadedImages = [];
        var draftId = '';

        if (hasImages) {
          // Wait for compression, fail on timeout
          var compressed = await self.waitForCompression(15000);
          if (!compressed) {
            throw new Error('图片处理超时，请重试');
          }

          // Check for pre-existing failed images
          var hasFailed = self.data.images.some(function (img) { return img.status === 'failed'; });
          if (hasFailed) {
            throw new Error('有图片处理失败，请重试或删除');
          }

          var result = await self.uploadImages();
          uploadedImages = result.images;
          draftId = result.draftId;
        }

        await self.createPost(uploadedImages, draftId);
      } catch (err) {
        console.error('Publish failed:', err);
        self.hidePublishLoading();
        self.setData({ submitting: false, uploadStage: '', errorMsg: err.message || '发布失败，请重试' });
        wx.showToast({ title: err.message || '发布失败，请重试', icon: 'none' });
      }
    })();
  },

  // Returns boolean: true if compression complete, false if timeout
  waitForCompression: function (timeoutMs) {
    var self = this;
    var startTime = Date.now();
    return new Promise(function (resolve) {
      function check() {
        var stillCompressing = self.data.images.some(function (img) { return img.status === 'compressing'; });
        if (!stillCompressing) { resolve(true); return; }
        if (Date.now() - startTime >= timeoutMs) { resolve(false); return; }
        setTimeout(check, 300);
      }
      check();
    });
  },

  // Upload images. Always returns { images: [...], draftId: '...' }
  uploadImages: function () {
    var self = this;

    // Reuse existing session if we have one and it hasn't expired
    if (self._uploadSession && self._uploadSession.expiresAt > Date.now()) {
      return self._doUpload(self._uploadSession);
    }

    // If we have an old expired session, all done images need re-upload
    if (self._uploadSession && self._uploadSession.expiresAt <= Date.now()) {
      // Reset all done images to pending for new session
      var resetImages = self.data.images.map(function (img) {
        return Object.assign({}, img, {
          status: img.status === 'compressing' ? 'compressing' : 'pending',
          progress: 0,
          cosKey: '',
          key: '',
          url: '',
          uploadIndex: undefined
        });
      });
      self.setData({ images: resetImages });
      self._uploadSession = null;
    }

    // Create one upload slot per selected image. Upload slots stay bound to
    // their original indexes for retry safety.
    var fileMetas = self.data.images.map(function (img) {
      return { mimeType: img.mimeType || 'image/jpeg', size: img.size || 0 };
    });

    return api.communityCreateUploadSession({ files: fileMetas }).then(function (session) {
      var expiredTime = Number(session.credentials && session.credentials.expiredTime) || 0;
      session.expiresAt = expiredTime > 0
        ? Math.max(Date.now(), (expiredTime - 60) * 1000)
        : Date.now() + 14 * 60 * 1000;
      self._uploadSession = session;
      self.setData({
        images: self.data.images.map(function (img, index) {
          return Object.assign({}, img, { uploadIndex: index });
        })
      });
      return self._doUpload(session);
    }).catch(function (err) {
      if (err.result && err.result.errorCode === 'COS_NOT_CONFIGURED') {
        throw new Error('COS 尚未配置，暂时只能发布文字和定位');
      }
      throw err;
    });
  },

  _doUpload: function (session) {
    var self = this;
    var pendingImages = self.data.images.filter(function (img) { return img.status === 'pending'; });

    if (pendingImages.length === 0) {
      // All images already done - collect results
      var doneResultImages = self.data.images.map(function (img) {
        return { key: img.cosKey || img.key, url: img.url, width: img.width || 0, height: img.height || 0, size: img.size || 0, mimeType: img.mimeType || 'image/jpeg' };
      });
      return Promise.resolve({ images: doneResultImages, draftId: session.draftId });
    }

    self.setData({ uploadStage: 'uploading', uploadTotal: pendingImages.length, uploadProgress: 0 });

    // Match uploadItems to pending images
    var uploadItems = session.uploadItems || [];
    var maxConcurrency = 3;
    var completedCount = 0;
    var hasFailure = false;

    function uploadSingle(img, uploadItem) {
      if (!uploadItem) {
        hasFailure = true;
        self.updateImage(img.id, { status: 'failed', errorMsg: '没有可用的上传位置' });
        return Promise.resolve();
      }
      self.updateImage(img.id, { status: 'uploading', progress: 0 });
      return cosUpload.uploadImage(img.path, uploadItem, session, function (progress) {
        self.updateImage(img.id, { progress: progress });
      }).then(function (result) {
        self.updateImage(img.id, { status: 'done', cosKey: result.key, key: result.key, url: result.url, progress: 100 });
        completedCount++;
        self.setData({ uploadProgress: completedCount });
      }).catch(function (err) {
        hasFailure = true;
        self.updateImage(img.id, { status: 'failed', errorMsg: err.message || '上传失败', progress: 0 });
      });
    }

    var queue = [];
    for (var i = 0; i < pendingImages.length; i++) {
      queue.push({
        img: pendingImages[i],
        uploadItem: uploadItems[pendingImages[i].uploadIndex] || null
      });
    }

    function processQueue() {
      var next;
      while (queue.length > 0) {
        next = queue.shift();
        return uploadSingle(next.img, next.uploadItem).then(function () { return processQueue(); });
      }
      return Promise.resolve();
    }

    var workers = [];
    for (var w = 0; w < Math.min(maxConcurrency, pendingImages.length); w++) {
      workers.push(processQueue());
    }

    return Promise.all(workers).then(function () {
      if (hasFailure) {
        throw new Error('部分图片上传失败，请重试或删除');
      }
      var resultImages = self.data.images.map(function (img) {
        return { key: img.cosKey || img.key || '', url: img.url || '', width: img.width || 0, height: img.height || 0, size: img.size || 0, mimeType: img.mimeType || 'image/jpeg' };
      });
      return { images: resultImages, draftId: session.draftId };
    });
  },

  // Create post
  createPost: function (uploadedImages, draftId) {
    var self = this;
    var content = this.data.content;
    var location = this.data.location;
    var hasImages = this.data.images.length > 0;

    this.setData({ uploadStage: 'submitting' });

    var postData = {
      draftId: hasImages ? draftId : undefined,
      content: (content || '').trim(),
      location: location || undefined,
      images: hasImages ? uploadedImages : undefined
    };

    return api.communityCreate(postData).then(function () {
      app.globalData._communityPublishSuccess = true;
      self.hidePublishLoading();
      wx.showToast({ title: hasImages ? '已提交审核' : '发布成功', icon: 'success' });
      setTimeout(function () { wx.navigateBack(); }, 800);
    });
  },

  hidePublishLoading: function () {
    if (!this._publishLoadingVisible) return;
    this._publishLoadingVisible = false;
    wx.hideLoading();
  },

  onUnload: function () {
    this.hidePublishLoading();
  }
});

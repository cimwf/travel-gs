var api = require('./api.js');
var cosUpload = require('./cos-upload.js');

function normalizeMimeType(type, filePath) {
  var normalized = String(type || '').toLowerCase();
  if (normalized === 'jpg' || normalized === 'jpeg' || normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'png') return 'image/png';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') return normalized;
  var match = String(filePath || '').toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  var ext = match && match[1] || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function getFileInfo(filePath) {
  return new Promise(function (resolve, reject) {
    wx.getFileInfo({
      filePath: filePath,
      success: resolve,
      fail: function () { reject(new Error('无法读取图片，请重新选择')); }
    });
  });
}

function getImageInfo(filePath) {
  return new Promise(function (resolve) {
    wx.getImageInfo({
      src: filePath,
      success: resolve,
      fail: function () { resolve({ width: 0, height: 0, type: '' }); }
    });
  });
}

function prepareFile(file, index) {
  var filePath = file && (file.filePath || file.tempFilePath || file.tempUrl || file.url) || '';
  if (!filePath) return Promise.reject(new Error('图片路径无效'));
  return Promise.all([getFileInfo(filePath), getImageInfo(filePath)]).then(function (results) {
    var fileInfo = results[0] || {};
    var imageInfo = results[1] || {};
    var size = Number(fileInfo.size || file.size) || 0;
    if (size <= 0 || size > 10 * 1024 * 1024) throw new Error('单张图片必须小于10MB');
    return {
      index: index,
      filePath: filePath,
      size: size,
      width: Number(imageInfo.width) || 0,
      height: Number(imageInfo.height) || 0,
      mimeType: normalizeMimeType(imageInfo.type || file.type, filePath)
    };
  });
}

function uploadFiles(options) {
  options = options || {};
  var files = Array.isArray(options.files) ? options.files : [];
  if (files.length === 0) return Promise.resolve({ sessionId: '', media: [] });

  return Promise.all(files.map(prepareFile)).then(function (prepared) {
    return api.tripMediaCreateUploadSession({
      tripId: options.tripId,
      purpose: options.purpose,
      files: prepared.map(function (item) {
        return { mimeType: item.mimeType, size: item.size };
      })
    }).then(function (session) {
      var queue = prepared.slice();
      var results = new Array(prepared.length);
      var maxConcurrency = Math.min(3, queue.length);

      function worker() {
        var item = queue.shift();
        if (!item) return Promise.resolve();
        var uploadItem = (session.uploadItems || [])[item.index];
        return cosUpload.uploadImage(item.filePath, uploadItem, session, function (progress) {
          if (typeof options.onProgress === 'function') options.onProgress(item.index, progress);
        }).then(function (result) {
          results[item.index] = {
            provider: 'cos',
            key: result.key,
            url: result.url,
            width: item.width,
            height: item.height,
            size: item.size,
            mimeType: item.mimeType,
            sort: item.index
          };
          return worker();
        });
      }

      var workers = [];
      for (var i = 0; i < maxConcurrency; i++) workers.push(worker());
      return Promise.all(workers).then(function () {
        return { sessionId: session.sessionId, media: results };
      });
    });
  });
}

module.exports = { uploadFiles: uploadFiles };

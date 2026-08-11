var tripMediaUpload = require('./trip-media-upload.js');

function uploadAvatar(filePath, onProgress) {
  if (!filePath) return Promise.reject(new Error('头像路径无效'));
  return tripMediaUpload.uploadFiles({
    purpose: 'user_avatar',
    files: [{ filePath: filePath }],
    onProgress: function (index, progress) {
      if (typeof onProgress === 'function') onProgress(progress);
    }
  }).then(function (result) {
    var media = result.media && result.media[0];
    if (!result.sessionId || !media || !media.url) throw new Error('头像上传失败');
    return {
      sessionId: result.sessionId,
      media: media,
      url: media.url
    };
  });
}

module.exports = { uploadAvatar: uploadAvatar };

/**
 * COS Upload Utility
 *
 * Uploads images to Tencent Cloud COS using cos-wx-sdk-v5.
 * Uses server-generated per-file uploadItems with precise STS keys.
 *
 * SDK: cos-wx-sdk-v5 1.8.0
 * Source: https://github.com/tencentyun/cos-wx-sdk-v5
 * File: miniprogram/vendor/cos-wx-sdk-v5.min.js
 */

let COS = null;

try {
  COS = require('../vendor/cos-wx-sdk-v5.min.js');
} catch (e) {
  console.warn('cos-wx-sdk-v5 not available. Image upload requires: miniprogram/vendor/cos-wx-sdk-v5.min.js');
}

/**
 * Upload a single image to COS using the server-issued uploadItem.
 *
 * @param {string} filePath  - Local wxfile:// path
 * @param {object} uploadItem - From server: { cosKey, uploadUrl, authorization }
 * @param {object} session    - Upload session { bucket, region, credentials }
 * @returns {Promise<{key: string, url: string}>}
 */
function uploadImage(filePath, uploadItem, session, onProgress) {
  return new Promise(function (resolve, reject) {
    if (!COS) {
      reject(new Error('COS 上传组件未安装'));
      return;
    }
    if (!session || !session.credentials) {
      reject(new Error('没有获取到图片上传凭证'));
      return;
    }
    if (!uploadItem || !uploadItem.cosKey) {
      reject(new Error('没有可用的图片上传位置'));
      return;
    }

    var cos = new COS({
      SimpleUploadMethod: 'putObject',
      getAuthorization: function (options, callback) {
        callback({
          TmpSecretId: session.credentials.tmpSecretId,
          TmpSecretKey: session.credentials.tmpSecretKey,
          SecurityToken: session.credentials.sessionToken,
          StartTime: session.credentials.startTime,
          ExpiredTime: session.credentials.expiredTime,
          ScopeLimit: true
        });
      }
    });

    // Images are capped at 10 MB, so call putObject directly. uploadFile()
    // first runs FileSystemManager.stat() to choose between simple and
    // multipart upload. On macOS DevTools, chooseMedia/compressImage may
    // return an http://tmp/... path that readFile() accepts but stat() does
    // not, producing "stat:fail no such file or directory".
    cos.putObject({
      Bucket: session.bucket,
      Region: session.region,
      Key: uploadItem.cosKey,
      FilePath: filePath,
      ContentType: uploadItem.allowedMime || 'image/jpeg',
      onProgress: function (progressData) {
        if (typeof onProgress === 'function') {
          onProgress(Math.round((progressData.percent || 0) * 100));
        }
      }
    }, function (err, data) {
      if (err) {
        console.error('COS upload failed:', err.message || err);
        reject(new Error(err.message || '图片上传失败'));
      } else {
        resolve({
          key: uploadItem.cosKey,
          url: session.baseUrl + '/' + uploadItem.cosKey
        });
      }
    });
  });
}

module.exports = { uploadImage };

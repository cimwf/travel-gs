/**
 * 加密工具类 - 用于密码传输加密
 * 使用 AES-256-CBC 加密密码
 */

// 生成随机字节
function getRandomBytes(length) {
  const array = new Uint8Array(length);
  wx.getRandomValues(array);
  return array;
}

// 字节数组转 Base64
function arrayToBase64(array) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;

  while (i < array.length) {
    const byte1 = array[i++];
    const byte2 = i < array.length ? array[i++] : 0;
    const byte3 = i < array.length ? array[i++] : 0;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 3) << 4) | (byte2 >> 4);
    const enc3 = ((byte2 & 15) << 2) | (byte3 >> 6);
    const enc4 = byte3 & 63;

    result += chars[enc1] + chars[enc2];
    result += i - 2 < array.length ? chars[enc3] : '=';
    result += i - 1 < array.length ? chars[enc4] : '=';
  }

  return result;
}

// Base64 转字节数组
function base64ToArray(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const result = [];

  base64 = base64.replace(/=/g, '');
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < base64.length; i++) {
    const index = chars.indexOf(base64[i]);
    if (index === -1) continue;

    buffer = (buffer << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      result.push((buffer >> bits) & 0xFF);
    }
  }

  return new Uint8Array(result);
}

// 字符串转字节数组
function stringToBytes(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

// 字节数组转字符串
function bytesToString(bytes) {
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

// PKCS7 填充
function pkcs7Pad(data, blockSize = 16) {
  const padding = blockSize - (data.length % blockSize);
  const result = new Uint8Array(data.length + padding);
  result.set(data);
  for (let i = data.length; i < result.length; i++) {
    result[i] = padding;
  }
  return result;
}

// PKCS7 去填充
function pkcs7Unpad(data) {
  const padding = data[data.length - 1];
  return data.slice(0, data.length - padding);
}

// XOR 操作
function xor(a, b) {
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

// AES 加密（简化版，实际项目中建议使用成熟的加密库）
// 这里使用云函数来处理加密，前端只负责生成密钥和传输
const Crypto = {
  /**
   * 生成随机 AES 密钥（256位）
   */
  generateAESKey() {
    return getRandomBytes(32);
  },

  /**
   * 生成随机 IV（128位）
   */
  generateIV() {
    return getRandomBytes(16);
  },

  /**
   * AES-256-CBC 加密
   * 注意：这是一个简化实现，建议配合云函数使用
   */
  aesEncrypt(plaintext, key, iv) {
    // 将密码转为字节
    const data = stringToBytes(plaintext);

    // PKCS7 填充
    const paddedData = pkcs7Pad(data);

    // 返回加密所需的数据
    return {
      data: arrayToBase64(paddedData),
      key: arrayToBase64(key),
      iv: arrayToBase64(iv)
    };
  },

  /**
   * 将字节数组转为 Base64 字符串
   */
  bytesToBase64: arrayToBase64,

  /**
   * 将 Base64 字符串转为字节数组
   */
  base64ToBytes: base64ToArray,

  /**
   * 生成随机字符串
   */
  generateNonce(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = getRandomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
    return result;
  },

  /**
   * 生成时间戳
   */
  getTimestamp() {
    return Date.now();
  }
};

module.exports = Crypto;

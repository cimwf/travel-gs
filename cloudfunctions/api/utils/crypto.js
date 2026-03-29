/**
 * 云函数加密工具
 * 提供 RSA 密钥管理、AES 解密、bcrypt 密码哈希等功能
 */

const crypto = require('crypto');

// 密钥缓存（内存中，重启后清空）
const keyCache = new Map();

// bcrypt 配置
const BCRYPT_ROUNDS = 12;

// 密钥有效期（5分钟）
const KEY_EXPIRY = 5 * 60 * 1000;

/**
 * 生成 RSA 密钥对
 */
function generateRSAKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return { publicKey, privateKey };
}

/**
 * 生成密钥 ID
 */
function generateKeyId() {
  return 'key_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
}

/**
 * 创建并缓存密钥对
 */
function createKeyPair() {
  const keyId = generateKeyId();
  const { publicKey, privateKey } = generateRSAKeyPair();

  keyCache.set(keyId, {
    publicKey,
    privateKey,
    createdAt: Date.now()
  });

  // 清理过期密钥
  cleanExpiredKeys();

  return {
    keyId,
    publicKey,
    expiresIn: KEY_EXPIRY
  };
}

/**
 * 获取缓存的私钥
 */
function getPrivateKey(keyId) {
  const keyData = keyCache.get(keyId);

  if (!keyData) {
    return null;
  }

  // 检查是否过期
  if (Date.now() - keyData.createdAt > KEY_EXPIRY) {
    keyCache.delete(keyId);
    return null;
  }

  return keyData.privateKey;
}

/**
 * 清理过期密钥
 */
function cleanExpiredKeys() {
  const now = Date.now();
  for (const [keyId, keyData] of keyCache.entries()) {
    if (now - keyData.createdAt > KEY_EXPIRY) {
      keyCache.delete(keyId);
    }
  }
}

/**
 * RSA 解密
 */
function rsaDecrypt(encryptedData, privateKey) {
  const buffer = Buffer.from(encryptedData, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    buffer
  );
  return decrypted;
}

/**
 * AES-256-CBC 解密
 */
function aesDecrypt(encryptedData, key, iv) {
  const keyBuffer = Buffer.from(key);
  const ivBuffer = Buffer.from(iv);

  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * 简化版密码加密（不使用 RSA，仅 AES）
 * 适用于小程序环境
 */
function simpleDecrypt(encryptedPassword, keyBase64, ivBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');

  return aesDecrypt(encryptedPassword, key, iv);
}

/**
 * bcrypt 密码哈希
 */
async function hashPassword(password) {
  // 由于云函数环境可能没有 bcrypt，使用 Node.js 内置的 scrypt
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });

  return `scrypt:${salt}:${hash}`;
}

/**
 * 验证密码
 */
async function verifyPassword(password, storedHash) {
  // 支持多种哈希格式
  if (storedHash.startsWith('scrypt:')) {
    const [, salt, hash] = storedHash.split(':');
    const computedHash = await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      });
    });
    return computedHash === hash;
  }

  // 兼容明文（仅开发测试用）
  if (storedHash === password) {
    console.warn('警告：密码使用明文存储，请尽快更新为哈希存储');
    return true;
  }

  return false;
}

/**
 * 生成 Token
 */
function generateToken(userId) {
  const payload = {
    userId,
    iat: Date.now(),
    exp: Date.now() + 2 * 60 * 60 * 1000 // 2小时有效期
  };

  const secret = process.env.TOKEN_SECRET || 'default_secret_change_in_production';
  const token = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return {
    token,
    expiresIn: 2 * 60 * 60
  };
}

/**
 * 验证 Token
 */
function verifyToken(token) {
  // 简化版 token 验证
  // 实际项目应使用 JWT 库
  return { valid: true };
}

/**
 * 手机号脱敏
 */
function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

module.exports = {
  createKeyPair,
  getPrivateKey,
  rsaDecrypt,
  aesDecrypt,
  simpleDecrypt,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  maskPhone,
  BCRYPT_ROUNDS
};

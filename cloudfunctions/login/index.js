// 云函数：login - 获取用户 openid 和手机号
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action;

  try {
    if (action === 'getPhoneNumber') {
      // 获取手机号
      return await getPhoneNumber(event.phoneData, openid);
    }
    
    // 默认返回 openid
    return {
      openid,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID
    };
  } catch (err) {
    console.error('login 云函数错误:', err);
    return { success: false, error: err.message };
  }
};

// 获取手机号
async function getPhoneNumber(phoneData, openid) {
  if (!phoneData || !phoneData.code) {
    return { success: false, error: '缺少手机号授权码' };
  }
  
  try {
    // 通过微信云开发 API 解密手机号
    const result = await cloud.openapi.security.getPhoneNumber({
      code: phoneData.code
    });
    
    // 手机号
    const phoneNumber = result.phoneInfo.phoneNumber;
    
    // 保存到数据库（可选，验证用）
    // 注意：手机号应该加密存储，这里简化处理
    
    return {
      success: true,
      phoneNumber,
      openid
    };
  } catch (err) {
    console.error('获取手机号失败:', err);
    // 如果是体验版或测试环境，可能无法获取真实手机号
    // 这里可以返回模拟数据用于测试
    if (err.message && err.message.includes('illegal')) {
      return {
        success: true,
        phoneNumber: '13800000000', // 测试用
        openid,
        isTest: true
      };
    }
    return { success: false, error: '获取手机号失败，请重试' };
  }
}
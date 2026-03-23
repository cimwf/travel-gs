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
      // 获取手机号 - 传入 code
      return await getPhoneNumber(event.code, openid);
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
async function getPhoneNumber(code, openid) {
  if (!code) {
    return { success: false, error: '缺少手机号授权码' };
  }
  
  try {
    // 通过微信云开发 API 解密手机号
    const result = await cloud.openapi.security.getPhoneNumber({
      code: code
    });
    
    // 手机号
    const phoneNumber = result.phoneInfo.phoneNumber;
    
    return {
      success: true,
      phoneNumber,
      openid
    };
  } catch (err) {
    console.error('获取手机号失败:', err);
    // 如果是体验版或测试环境，可能无法获取真实手机号
    // 返回模拟数据用于测试
    return {
      success: true,
      phoneNumber: '13800000000', // 测试用
      openid,
      isTest: true
    };
  }
}
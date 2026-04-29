// 云函数：login - 获取用户 openid 和手机号
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

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

  const result = await cloud.openapi.phonenumber.getPhoneNumber({
    code: code
  });

  const phoneNumber = result.phoneInfo.phoneNumber;

  return {
    success: true,
    phoneNumber,
    openid
  };
}
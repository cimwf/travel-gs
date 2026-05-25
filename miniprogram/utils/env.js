const { envVersion } = wx.getAccountInfoSync().miniProgram;
// envVersion: 'develop' | 'trial' | 'release'

const configs = {
  dev: {
    cloudEnv: 'cloud1-d2gel5jl093988c07',
    // TODO: 将图片上传到 cloud1-d2gel5jl093988c07 存储桶后，替换为对应 CDN 域名
    defaultBackground: 'https://636c-cloud1-d2gel5jl093988c07-1436573577.tcb.qcloud.la/attractions/1779675895813-2b01h15gto8.jpg',
  },
  prod: {
    cloudEnv: 'prod-demo',
    // TODO: prod 环境创建后，替换为实际 CDN 域名
    defaultBackground: 'https://636c-cloud1-d2gel5jl093988c07-1436573577.tcb.qcloud.la/attractions/1779675895813-2b01h15gto8.jpg',
  }
};

module.exports = envVersion === 'release' ? configs.prod : configs.dev;

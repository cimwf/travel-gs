const { envVersion } = wx.getAccountInfoSync().miniProgram;
// envVersion: 'develop' | 'trial' | 'release'

const configs = {
  dev: {
    cloudEnv: 'cloud1-d2gel5jl093988c07',
    // TODO: 将图片上传到 cloud1-d2gel5jl093988c07 存储桶后，替换为对应 CDN 域名
    defaultBackground: 'https://7072-prod-d2gkmbquec074b1df-1427058553.tcb.qcloud.la/attractions/1778050814136-42heznfom6q.JPG',
  },
  prod: {
    cloudEnv: 'prod-demo',
    // TODO: prod 环境创建后，替换为实际 CDN 域名
    defaultBackground: 'https://7072-prod-demo-1427058553.tcb.qcloud.la/attractions/1778050814136-42heznfom6q.JPG',
  }
};

module.exports = envVersion === 'release' ? configs.prod : configs.dev;

let envVersion = 'develop';
if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
  try {
    const accountInfo = wx.getAccountInfoSync();
    envVersion = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion || 'develop';
  } catch (error) {
    console.warn('获取小程序运行版本失败，按开发版处理', error);
  }
}
// envVersion: 'develop' | 'trial' | 'release'

// 业务数据环境与云开发环境相互独立。
// 如需在某个版本中同时查看其他环境的数据，只修改对应 readEnvs 即可。
const dataEnvironmentConfigs = {
  develop: {
    writeEnv: 'dev',
    readEnvs: ['dev']
  },
  trial: {
    writeEnv: 'test',
    readEnvs: ['test']
  },
  release: {
    writeEnv: 'prod',
    readEnvs: ['prod']
  }
};

// 三种小程序运行版本共用同一个云环境和数据库，业务数据由 dataEnv 隔离。
const SHARED_CLOUD_ENV = 'cloud1-d2gel5jl093988c07';

const configs = {
  dev: {
    cloudEnv: SHARED_CLOUD_ENV,
    // TODO: 将图片上传到 cloud1-d2gel5jl093988c07 存储桶后，替换为对应 CDN 域名
    defaultBackground: 'https://636c-cloud1-d2gel5jl093988c07-1436573577.tcb.qcloud.la/attractions/1780280232049-fc1xsvx50g9.png',
  },
  prod: {
    cloudEnv: SHARED_CLOUD_ENV,
    defaultBackground: 'https://636c-cloud1-d2gel5jl093988c07-1436573577.tcb.qcloud.la/attractions/1779675895813-2b01h15gto8.jpg',
  }
};

const runtimeEnv = dataEnvironmentConfigs[envVersion] ? envVersion : 'develop';
const cloudConfig = runtimeEnv === 'release' ? configs.prod : configs.dev;
const dataEnvironment = dataEnvironmentConfigs[runtimeEnv];

module.exports = Object.assign({}, cloudConfig, {
  runtimeEnv,
  dataEnvironment: {
    writeEnv: dataEnvironment.writeEnv,
    readEnvs: dataEnvironment.readEnvs.slice()
  }
});

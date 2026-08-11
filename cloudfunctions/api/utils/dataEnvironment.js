const VALID_DATA_ENVS = ['dev', 'test', 'prod'];

const RUNTIME_DEFAULTS = {
  develop: { writeEnv: 'dev', readEnvs: ['dev'] },
  trial: { writeEnv: 'test', readEnvs: ['test'] },
  release: { writeEnv: 'prod', readEnvs: ['prod'] }
};

function uniqueValidEnvs(values) {
  const result = [];
  (Array.isArray(values) ? values : []).forEach(value => {
    if (VALID_DATA_ENVS.includes(value) && !result.includes(value)) {
      result.push(value);
    }
  });
  return result;
}

function resolveDataEnvironment(event = {}) {
  const runtimeEnv = RUNTIME_DEFAULTS[event.runtimeEnv] ? event.runtimeEnv : 'develop';
  const defaults = RUNTIME_DEFAULTS[runtimeEnv];
  const requested = event.dataEnvironment || {};
  const writeEnv = VALID_DATA_ENVS.includes(requested.writeEnv)
    ? requested.writeEnv
    : defaults.writeEnv;
  const readEnvs = uniqueValidEnvs(requested.readEnvs);

  return {
    runtimeEnv,
    writeEnv,
    readEnvs: readEnvs.length > 0 ? readEnvs : defaults.readEnvs.slice()
  };
}

function createReadCondition(command, readEnvs) {
  const normalizedReadEnvs = uniqueValidEnvs(readEnvs);
  if (normalizedReadEnvs.length === 0) normalizedReadEnvs.push('dev');
  const conditions = normalizedReadEnvs.map(dataEnv => ({ dataEnv }));

  // 开发阶段已有数据没有 dataEnv，按产品约定仅归入 dev。
  if (normalizedReadEnvs.includes('dev')) {
    conditions.push({ dataEnv: command.exists(false) });
  }

  return conditions.length === 1 ? conditions[0] : command.or(conditions);
}

module.exports = {
  VALID_DATA_ENVS,
  RUNTIME_DEFAULTS,
  resolveDataEnvironment,
  createReadCondition
};

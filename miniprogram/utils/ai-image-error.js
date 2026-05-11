const MODERATION_ERROR_PATTERN = /content[_\s-]*(policy|filter|moderation|violation)|safety|moderation/i;
const INVALID_REQUEST_PATTERN = /(^|\b)(400|bad request|invalid)(\b|$)/i;

function getErrorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err.message || err.errMsg || err.error || String(err);
}

function formatAiImageErrorMessage(err, fallback, options = {}) {
  const message = getErrorMessage(err);
  if (!message) return fallback;

  const text = String(message);
  const lower = text.toLowerCase();

  if (
    options.includeChannel &&
    (text.includes('渠道不存在') || text.includes('渠道未配置') || text.includes('渠道已停用'))
  ) {
    return '所选渠道不可用，请重新选择';
  }
  if (text.includes('次数已用完')) return 'AI 生图次数已用完';
  if (text.includes('创作描述不能为空')) return '请先填写创作描述';
  if (text.includes('参考图片不能为空')) return '请先上传参考图';
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return '当前渠道已满，请换个渠道后再试';
  }
  if (
    lower.includes('timeout') ||
    text.includes('超时') ||
    lower.includes('timed out') ||
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('500') ||
    lower.includes('econnreset') ||
    lower.includes('socket hang up') ||
    text.includes('服务连接失败') ||
    text.includes('服务请求失败')
  ) {
    return '当前渠道已满，请换个渠道后再试';
  }
  if (
    INVALID_REQUEST_PATTERN.test(text) ||
    MODERATION_ERROR_PATTERN.test(text) ||
    text.includes('不支持') ||
    text.includes('违规') ||
    text.includes('敏感')
  ) {
    return '这次没有生成成功，可以换个描述或换张参考图再试';
  }
  if (
    text.includes('图片下载失败') ||
    text.includes('图片获取失败') ||
    text.includes('COS 上传失败') ||
    text.includes('云存储')
  ) {
    return '图片保存失败，请稍后重试';
  }

  return text.length > 60 ? text.slice(0, 60) : text;
}

module.exports = {
  MODERATION_ERROR_PATTERN,
  formatAiImageErrorMessage
};

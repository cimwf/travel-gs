const {
  MODERATION_ERROR_PATTERN,
  formatAiImageSharedErrorMessage
} = require('./ai-image-error-rules.js');

function getErrorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err.message || err.errMsg || err.error || String(err);
}

function formatAiImageErrorMessage(err, fallback, options = {}) {
  const message = getErrorMessage(err);
  return formatAiImageSharedErrorMessage(message, fallback, {
    ...options,
    scope: 'miniprogram',
    unknown: 'text60'
  });
}

module.exports = {
  MODERATION_ERROR_PATTERN,
  formatAiImageErrorMessage
};

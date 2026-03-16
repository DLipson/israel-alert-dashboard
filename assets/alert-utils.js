(function (root, factory) {
  const utils = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = utils;
  }
  if (root) {
    root.AlertUtils = utils;
  }
})(typeof window !== 'undefined' ? window : global, function () {
  function normalizeValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function serializeAlert(alert) {
    return [
      normalizeValue(alert?.alertDate),
      normalizeValue(alert?.category),
      normalizeValue(alert?.title),
      normalizeValue(alert?.data),
    ].join('|');
  }

  function getAlertsFingerprint(alerts) {
    if (!Array.isArray(alerts) || alerts.length === 0) return null;
    return alerts.map(serializeAlert).join('||');
  }

  return {
    getAlertsFingerprint,
  };
});

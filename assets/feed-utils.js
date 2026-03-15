(function (root, factory) {
  const utils = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = utils;
  }
  if (root) {
    root.FeedUtils = utils;
  }
})(typeof window !== 'undefined' ? window : global, function () {
  function parseFeedDate(value) {
    const timestamp = Date.parse(value ?? '');
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function sortFeedItemsByDateDesc(items) {
    return [...items].sort((a, b) => parseFeedDate(b.date) - parseFeedDate(a.date));
  }

  function getMostRecentFeedId(items) {
    if (!items.length) return null;
    const mostRecent = items[0];
    return `${mostRecent.user_name}|${mostRecent.content}|${mostRecent.date}`;
  }

  return {
    sortFeedItemsByDateDesc,
    getMostRecentFeedId,
  };
});

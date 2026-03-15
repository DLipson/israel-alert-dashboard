const assert = require('assert');

const { sortFeedItemsByDateDesc, getMostRecentFeedId } = require('../assets/feed-utils.js');

const items = [
  { user_name: 'A', content: 'Old', date: '2024-01-01 10:00:00' },
  { user_name: 'B', content: 'New', date: '2024-01-01 12:00:00' },
  { user_name: 'C', content: 'Mid', date: '2024-01-01 11:00:00' },
];

const sorted = sortFeedItemsByDateDesc(items);
assert.strictEqual(sorted[0].content, 'New');
assert.strictEqual(sorted[1].content, 'Mid');
assert.strictEqual(sorted[2].content, 'Old');

const mostRecentId = getMostRecentFeedId(sorted);
assert.ok(mostRecentId.includes('New'));

console.log('feed-utils tests passed');

const assert = require('assert');

const { getAlertsFingerprint } = require('../assets/alert-utils.js');

const baseAlerts = [
  { alertDate: '2026-03-16 10:00:00', category: 1, title: 'Alert A', data: 'City One' },
  { alertDate: '2026-03-16 09:59:00', category: 1, title: 'Alert B', data: 'City Two' },
];

const sameMostRecentChangedOlder = [
  { alertDate: '2026-03-16 10:00:00', category: 1, title: 'Alert A', data: 'City One' },
  { alertDate: '2026-03-16 09:59:00', category: 1, title: 'Alert B', data: 'City Two (updated)' },
];

assert.notStrictEqual(
  getAlertsFingerprint(baseAlerts),
  getAlertsFingerprint(sameMostRecentChangedOlder),
  'fingerprint should change when older alerts update'
);

console.log('alert-utils tests passed');

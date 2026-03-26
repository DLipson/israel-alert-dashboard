import assert from 'assert';
import { _test } from '../proxy.mjs';

const { parseLiveAlertDate, getLiveAlertDate, finalizeAlerts } = _test;

const filetimeId = '134189040150000000';
const expectedFiletimeIso = new Date('2026-03-25T11:20:15+02:00').toISOString();
assert.strictEqual(
  parseLiveAlertDate(filetimeId),
  expectedFiletimeIso,
  'FILETIME string timestamps should parse to ISO'
);

const fallbackItem = { id: 'ALERT-ABC-1' };
assert.strictEqual(
  getLiveAlertDate(fallbackItem),
  'ALERT-ABC-1',
  'non-parseable ids should remain stable for repeat alerts'
);

const makeAlert = (index) => {
  const day = String(1 + Math.floor(index / 60)).padStart(2, '0');
  const minute = String(index % 60).padStart(2, '0');
  return {
    alertDate: `2026-03-${day} 10:${minute}:00`,
    category: 1,
    title: `Alert ${index}`,
    data: `City ${index}`,
  };
};

const manyAlerts = Array.from({ length: 150 }, (_, i) => makeAlert(i));
const defaultLimited = finalizeAlerts(manyAlerts);
assert.strictEqual(defaultLimited.length, 100, 'default limit should be 100');

const limited = finalizeAlerts(manyAlerts, 140);
assert.strictEqual(limited.length, 140, 'limit parameter should control result size');

const unlimited = finalizeAlerts(manyAlerts, 0);
assert.strictEqual(unlimited.length, manyAlerts.length, 'limit 0 should return all alerts');

console.log('proxy tests passed');

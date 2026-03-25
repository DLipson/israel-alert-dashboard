import assert from 'assert';
import { _test } from '../proxy.mjs';

const { parseLiveAlertDate, getLiveAlertDate } = _test;

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

console.log('proxy tests passed');

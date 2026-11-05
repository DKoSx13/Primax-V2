import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateForDisplay, parseDisplayDate } from '../js/date-input.js';

test('parses a valid display date into the API format', () => {
  assert.equal(parseDisplayDate('05/11/2026'), '2026-11-05');
});

test('rejects malformed and impossible calendar dates', () => {
  assert.equal(parseDisplayDate('31/02/2026'), null);
  assert.equal(parseDisplayDate('1/02/2026'), null);
  assert.equal(parseDisplayDate('29/02/2026'), null);
});

test('accepts leap day only in leap years', () => {
  assert.equal(parseDisplayDate('29/02/2024'), '2024-02-29');
  assert.equal(parseDisplayDate('29/02/2100'), null);
  assert.equal(parseDisplayDate('29/02/2000'), '2000-02-29');
});

test('formats API dates for the user and preserves optional empty filters', () => {
  assert.equal(formatDateForDisplay('2026-11-05'), '05/11/2026');
  assert.equal(formatDateForDisplay('2026-02-31'), '');
  assert.equal(parseDisplayDate(''), '');
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTime, getLocaleForLanguage } from './dateFormat.js';

describe('dateFormat', () => {
  const sampleDate = '2026-05-07T07:35:00.000Z';
  const timeZone = 'Asia/Bangkok';

  it('formats English dates with en-US month and 12-hour time', () => {
    assert.equal(
      formatDateTime(sampleDate, 'en', { timeZone }),
      'May 7, 2026, 2:35 PM'
    );
  });

  it('formats Indonesian dates with id-ID month and 24-hour time', () => {
    assert.equal(
      formatDateTime(sampleDate, 'id', { timeZone }),
      '7 Mei 2026, 14.35'
    );
  });

  it('returns an empty string for missing or invalid dates', () => {
    assert.equal(formatDateTime('', 'en', { timeZone }), '');
    assert.equal(formatDateTime('not-a-date', 'id', { timeZone }), '');
  });

  it('maps active app language to a stable locale', () => {
    assert.equal(getLocaleForLanguage('en'), 'en-US');
    assert.equal(getLocaleForLanguage('id'), 'id-ID');
  });
});

import { describe, expect, it } from 'vitest';

import { dateFormatCache } from './date-format-cache.ts';

const dayAndTime = dateFormatCache({ weekday: 'short', hour: '2-digit', minute: '2-digit' });
const instant = new Date('2026-10-03T13:05:00Z');

describe('dateFormatCache (D-062)', () => {
  it('builds one formatter per locale and time zone, then reuses it', () => {
    const first = dayAndTime('en-GB', 'Europe/Lisbon');
    expect(dayAndTime('en-GB', 'Europe/Lisbon')).toBe(first);
    expect(dayAndTime('en-GB', 'Asia/Tokyo')).not.toBe(first);
    expect(dayAndTime('pt-PT', 'Europe/Lisbon')).not.toBe(first);
  });

  it('formats exactly like a new Intl.DateTimeFormat with the same options', () => {
    const fresh = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(dayAndTime('en-GB', 'Asia/Tokyo').format(instant)).toBe(fresh.format(instant));
  });

  it('keeps each set of options apart', () => {
    const yearOnly = dateFormatCache({ year: 'numeric' });
    expect(yearOnly('en-GB', 'UTC').format(instant)).toBe('2026');
    expect(dayAndTime('en-GB', 'UTC').format(instant)).toBe('Sat 13:05');
  });
});

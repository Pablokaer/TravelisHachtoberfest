import { addMonths, isoDate, monthGrid, parseIsoDate } from '@/lib/calendar';

describe('calendar (D-081)', () => {
  test('isoDate writes year, month and day with leading zeros', () => {
    expect(isoDate(2026, 12, 5)).toBe('2026-12-05');
    expect(isoDate(2027, 1, 31)).toBe('2027-01-31');
  });

  test('parseIsoDate reads a date back, and refuses anything else naming it', () => {
    expect(parseIsoDate('2026-12-05')).toEqual({ year: 2026, month: 12, day: 5 });
    expect(() => parseIsoDate('5 December')).toThrow(/"5 December".*YYYY-MM-DD/);
    expect(() => parseIsoDate('2026-02-30')).toThrow(/"2026-02-30"/);
  });

  test('addMonths moves across the year', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 });
  });

  test('monthGrid lists the weeks of a month starting on Monday, padded with nulls', () => {
    // December 2026 starts on a Tuesday and has 31 days.
    const weeks = monthGrid(2026, 12);
    expect(weeks[0]).toEqual([
      null,
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.at(-1)!.at(-1)).toBeNull();
  });

  test('a month starting on a Monday has no padding in its first week', () => {
    // June 2026 starts on a Monday.
    expect(monthGrid(2026, 6)[0]![0]).toBe('2026-06-01');
  });

  test('February of a leap year has 29 days', () => {
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2027, 2).flat().filter(Boolean)).toHaveLength(28);
  });
});

import { dropIndex, rowShift, type RowBox } from '@/features/route/stop-drag';

/** Four 60 px rows, 10 px apart. */
const rows: RowBox[] = [0, 70, 140, 210].map((y) => ({ y, height: 60 }));

describe('dropIndex', () => {
  test('a short drag keeps the row in place', () => {
    expect(dropIndex(rows, 1, 20)).toBe(1);
    expect(dropIndex(rows, 1, -20)).toBe(1);
  });

  test('dragging past a neighbour centre takes its place', () => {
    expect(dropIndex(rows, 0, 80)).toBe(1);
    expect(dropIndex(rows, 3, -150)).toBe(1);
  });

  test('dragging beyond the ends clamps to the first and last place', () => {
    expect(dropIndex(rows, 2, -999)).toBe(0);
    expect(dropIndex(rows, 0, 999)).toBe(3);
  });

  test('an unmeasured row stays where it is', () => {
    expect(dropIndex([], 2, 100)).toBe(2);
  });
});

describe('rowShift', () => {
  test('rows between the start and the drop slide towards the start', () => {
    expect(rowShift(1, 0, 2, 60, 4)).toBe(-64);
    expect(rowShift(2, 0, 2, 60, 4)).toBe(-64);
    expect(rowShift(3, 0, 2, 60, 4)).toBe(0);
  });

  test('dragging up pushes the rows it passes down', () => {
    expect(rowShift(1, 3, 1, 60, 4)).toBe(64);
    expect(rowShift(0, 3, 1, 60, 4)).toBe(0);
  });
});

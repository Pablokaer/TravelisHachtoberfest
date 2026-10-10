import { gridColumns, gridItemWidth } from '@/theme/grid';

describe('gridColumns', () => {
  test('fits as many minimum-width items as the width allows', () => {
    expect(gridColumns(1200, 240, 24)).toBe(4);
    expect(gridColumns(1440, 240, 24)).toBe(5);
    expect(gridColumns(536, 240, 24)).toBe(2);
  });

  test('never returns fewer than one or more than the maximum', () => {
    expect(gridColumns(0, 240, 24)).toBe(1);
    expect(gridColumns(350, 240, 24)).toBe(1);
    expect(gridColumns(5000, 240, 24, 6)).toBe(6);
  });
});

describe('gridItemWidth', () => {
  test('splits the width left after the gaps', () => {
    expect(gridItemWidth(1200, 4, 24)).toBe(282);
    expect(gridItemWidth(350, 1, 24)).toBe(350);
  });
});

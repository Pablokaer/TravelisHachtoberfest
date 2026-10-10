/**
 * Columns of at least `minItem` px that fit in `width`, so a grid follows the space it really
 * has (the desktop side rail takes part of the window) instead of the window width.
 * @example gridColumns(1200, 240, 24) // 4
 */
export function gridColumns(width: number, minItem: number, gap: number, max = 6): number {
  const fit = Math.floor((width + gap) / (minItem + gap));
  return Math.max(1, Math.min(max, fit));
}

/**
 * Width of each item when `columns` items and their gaps share `width`.
 * @example gridItemWidth(1200, 4, 24) // 282
 */
export function gridItemWidth(width: number, columns: number, gap: number): number {
  return (width - gap * (columns - 1)) / columns;
}

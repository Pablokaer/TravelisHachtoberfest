import { useEffect, useState } from 'react';

/**
 * `value`, once it has stopped changing for `delayMs` (e.g. a search typed into a field, so
 * the server is asked once per pause instead of once per key).
 * @example const search = useDebouncedValue(query, 300);
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

// Intl.DateTimeFormat is slow to build (it resolves the locale and the time zone's rules), and
// meetup times, countdown rows and time-zone maths format on every render (D-062).

/** Formatter options without the time zone, which is part of the cache key instead. */
export type DateFormatOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'>;

/**
 * A getter of formatters with fixed `options`, built once per (locale, time zone) and reused.
 * @example
 * const meetupStart = dateFormatCache({ weekday: 'short', hour: '2-digit', minute: '2-digit' });
 * meetupStart('en-GB', 'Europe/Lisbon').format(new Date()) // 'Sat 15:05'
 */
export function dateFormatCache(
  options: DateFormatOptions,
): (locale: string, timeZone: string) => Intl.DateTimeFormat {
  const formatters = new Map<string, Intl.DateTimeFormat>();
  return (locale, timeZone) => {
    const key = `${locale}|${timeZone}`;
    let formatter = formatters.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone });
      formatters.set(key, formatter);
    }
    return formatter;
  };
}

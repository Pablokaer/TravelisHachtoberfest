import type { Units } from '@wayfarer/shared';

export function formatTemperature(celsius: number | null | undefined, units: Units) {
  if (celsius == null) return '–';
  return units === 'imperial'
    ? `${Math.round((celsius * 9) / 5 + 32)}°F`
    : `${Math.round(celsius)}°C`;
}

export function formatPrecipitation(mm: number | null | undefined, units: Units) {
  if (mm == null) return '–';
  return units === 'imperial' ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(1)} mm`;
}

export function formatDistance(meters: number, units: Units, locale: string) {
  if (units === 'imperial') {
    const miles = meters / 1609.344;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(miles)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

/** "1 h 25 min" / "40 min". */
export function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatDate(isoDate: string, locale: string, options?: Intl.DateTimeFormatOptions) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
    ...options,
  }).format(d);
}

export function formatNumber(value: number, locale: string, digits = 2) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** WMO weather interpretation code → i18n bucket. */
export function weatherBucket(code: number | null | undefined) {
  if (code == null) return 'unknown';
  if (code === 0) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunderstorm';
  return 'unknown';
}

/**
 * Flag emoji from an ISO 3166-1 alpha-2 code (regional indicator symbols).
 * @example flagEmoji('pt') // '🇵🇹'
 */
export function flagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));
}

/**
 * Up to two initials for an avatar, from a name or an email address.
 * @example initials('Ana Traveller') // 'AT'
 */
export function initials(name: string): string {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * A star average with exactly one decimal, in the UI language.
 * @example formatRating(4.56, 'pt') // '4,6'
 */
export function formatRating(average: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average);
}

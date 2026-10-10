import { FREE_MOVEMENT_COUNTRIES, SCHENGEN_COUNTRIES } from '../constants/index.ts';

/**
 * Passport validity rules for the launch destinations. Sources (checked 2026-09):
 * - Schengen: Regulation (EU) 2016/399 art. 6 — valid ≥ 3 months after the intended departure.
 * - United Kingdom: GOV.UK "Entering the UK" — valid for the whole stay.
 * - Türkiye: GOV.UK foreign travel advice — valid ≥ 150 days from arrival.
 * - Anything else: the common "6 months from arrival" airline rule, shown as generic advice.
 * EU/EEA/Swiss citizens travelling inside the free-movement area only need a valid document.
 */
export type PassportRule =
  | 'free_movement'
  | 'schengen_3m_after_departure'
  | 'whole_stay'
  | 'tr_150d_after_arrival'
  | 'generic_6m_after_arrival';

export type PassportCheck = {
  rule: PassportRule;
  /** The passport must be valid at least until this date (inclusive), ISO YYYY-MM-DD. */
  requiredUntil: string;
  status: 'ok' | 'warning' | 'problem' | 'unknown';
  passportExpiry: string | null;
};

const includes = (list: readonly string[], code: string) => list.includes(code);

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function passportRuleFor(
  destination: string,
  nationalities: readonly string[],
): PassportRule {
  const freeMover = nationalities.some((n) => includes(FREE_MOVEMENT_COUNTRIES, n));
  if (freeMover && includes(FREE_MOVEMENT_COUNTRIES, destination)) return 'free_movement';
  if (includes(SCHENGEN_COUNTRIES, destination)) return 'schengen_3m_after_departure';
  if (destination === 'GB') return 'whole_stay';
  if (destination === 'TR') return 'tr_150d_after_arrival';
  return 'generic_6m_after_arrival';
}

/**
 * @param arrival ISO date of arrival
 * @param departure ISO date of departure (defaults to arrival + 7 days)
 * @param passportExpiry optional ISO expiry date of the passport used; absent = assumed valid
 */
export function checkPassportValidity(input: {
  destination: string;
  nationalities: readonly string[];
  arrival: string;
  departure?: string | null;
  passportExpiry?: string | null;
}): PassportCheck {
  const departure = input.departure ?? addDays(input.arrival, 7);
  const rule = passportRuleFor(input.destination, input.nationalities);
  const requiredUntil = {
    free_movement: departure,
    whole_stay: departure,
    schengen_3m_after_departure: addMonths(departure, 3),
    tr_150d_after_arrival: addDays(input.arrival, 150),
    generic_6m_after_arrival: addMonths(input.arrival, 6),
  }[rule];

  const expiry = input.passportExpiry ?? null;
  // Sign-up no longer asks for the expiry date: without one the passport is assumed valid.
  let status: PassportCheck['status'] = 'ok';
  if (expiry) {
    if (expiry < requiredUntil) status = 'problem';
    // Warn when there is less than a month of margin: airlines apply rules strictly.
    else if (expiry < addMonths(requiredUntil, 1)) status = 'warning';
  }
  return { rule, requiredUntil, status, passportExpiry: expiry };
}

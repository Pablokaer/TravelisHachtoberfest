import { VISA_RANK, type VisaRequirement } from '../constants/index.ts';

export type VisaOption = {
  nationality: string;
  requirement: VisaRequirement;
  maxStayDays: number | null;
};

export type VisaVerdict = VisaOption & { isCitizen: boolean };

/**
 * Picks the most convenient entry option among all passports the traveller holds.
 * A passport of the destination itself always wins. Ties on requirement are broken by the
 * longest allowed stay (unknown stay counts as shortest).
 */
export function bestVisaOption(
  destination: string,
  nationalities: readonly string[],
  options: readonly VisaOption[],
): VisaVerdict | null {
  if (nationalities.includes(destination)) {
    return {
      nationality: destination,
      requirement: 'freedom_of_movement',
      maxStayDays: null,
      isCitizen: true,
    };
  }
  const held = options.filter((o) => nationalities.includes(o.nationality));
  if (held.length === 0) return null;
  const sorted = [...held].sort(
    (a, b) =>
      VISA_RANK[a.requirement] - VISA_RANK[b.requirement] ||
      (b.maxStayDays ?? 0) - (a.maxStayDays ?? 0) ||
      a.nationality.localeCompare(b.nationality),
  );
  const best = sorted[0]!;
  return { ...best, isCitizen: false };
}

/** True when the requirement means the traveller must do something before flying. */
export function needsPreTravelAction(requirement: VisaRequirement): boolean {
  return requirement === 'eta' || requirement === 'e_visa' || requirement === 'visa_required';
}

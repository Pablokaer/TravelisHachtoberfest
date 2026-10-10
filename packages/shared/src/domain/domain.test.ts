import { describe, expect, it } from 'vitest';

import { haversineMeters } from './geo.ts';
import { appleMapsLegUrl, googleMapsDirectionsUrl } from './navigation.ts';
import { checkPassportValidity, passportRuleFor } from './passport.ts';
import { checkPower } from './power.ts';
import { estimateLegs, optimizeOrder, type RoutePoint } from './route.ts';
import { bestVisaOption } from './visa.ts';

describe('visa', () => {
  const options = [
    { nationality: 'BR', requirement: 'eta', maxStayDays: 180 },
    { nationality: 'IN', requirement: 'visa_required', maxStayDays: null },
    { nationality: 'US', requirement: 'eta', maxStayDays: 90 },
  ] as const;

  it('picks the best requirement and breaks ties by stay length', () => {
    expect(bestVisaOption('GB', ['IN', 'US', 'BR'], options)).toMatchObject({
      nationality: 'BR',
      requirement: 'eta',
    });
  });

  it('citizens of the destination always win', () => {
    expect(bestVisaOption('GB', ['GB', 'IN'], options)).toMatchObject({
      isCitizen: true,
      requirement: 'freedom_of_movement',
    });
  });

  it('returns null when no data covers the passports', () => {
    expect(bestVisaOption('GB', ['XX'], options)).toBeNull();
  });
});

describe('passport validity', () => {
  it('uses free movement for EU citizens in the EU', () => {
    expect(passportRuleFor('PT', ['BR', 'IT'])).toBe('free_movement');
  });

  it('applies the Schengen 3-month rule after departure', () => {
    const r = checkPassportValidity({
      destination: 'FR',
      nationalities: ['BR'],
      arrival: '2026-11-01',
      departure: '2026-11-10',
      passportExpiry: '2027-01-15',
    });
    expect(r.rule).toBe('schengen_3m_after_departure');
    expect(r.requiredUntil).toBe('2027-02-10');
    expect(r.status).toBe('problem');
  });

  it('warns when the margin is under a month', () => {
    const r = checkPassportValidity({
      destination: 'TR',
      nationalities: ['BR'],
      arrival: '2026-01-01',
      passportExpiry: '2026-06-15',
    });
    expect(r.requiredUntil).toBe('2026-05-31');
    expect(r.status).toBe('warning');
  });

  // The expiry date is no longer asked at sign-up, so a passport without one counts as valid.
  it('assumes a valid passport without an expiry date and clamps month ends', () => {
    const r = checkPassportValidity({
      destination: 'US',
      nationalities: ['BR'],
      arrival: '2026-08-31',
    });
    expect(r.status).toBe('ok');
    expect(r.requiredUntil).toBe('2027-02-28');
  });
});

describe('power', () => {
  it('Brazilian N/C plugs work in Portugal (C/F) at the same voltage band', () => {
    expect(
      checkPower({
        homePlugs: ['C', 'N'],
        homeVoltage: 220,
        destinationPlugs: ['C', 'F'],
        destinationVoltage: 230,
      }),
    ).toEqual({ adapterNeeded: false, voltageDiffers: false, compatiblePlugs: ['C'] });
  });

  it('US plugs need an adapter in the UK and voltage differs', () => {
    expect(
      checkPower({
        homePlugs: ['A', 'B'],
        homeVoltage: 120,
        destinationPlugs: ['G'],
        destinationVoltage: 230,
      }),
    ).toMatchObject({ adapterNeeded: true, voltageDiffers: true });
  });

  it('is unknown when data is missing', () => {
    expect(
      checkPower({
        homePlugs: [],
        homeVoltage: null,
        destinationPlugs: ['G'],
        destinationVoltage: 230,
      }),
    ).toMatchObject({ adapterNeeded: null, voltageDiffers: null });
  });
});

describe('route fallback', () => {
  // Lisbon: Belém tower, Jerónimos, Praça do Comércio, Castelo, and back west to LX Factory.
  const pts: RoutePoint[] = [
    { id: 'tower', lat: 38.6916, lng: -9.216 },
    { id: 'castle', lat: 38.7139, lng: -9.1335 },
    { id: 'jeronimos', lat: 38.6979, lng: -9.2068 },
    { id: 'lxfactory', lat: 38.7036, lng: -9.1783 },
    { id: 'comercio', lat: 38.7075, lng: -9.1364 },
  ];

  it('keeps the first stop and walks roughly west to east', () => {
    expect(optimizeOrder(pts).map((p) => p.id)).toEqual([
      'tower',
      'jeronimos',
      'lxfactory',
      'comercio',
      'castle',
    ]);
  });

  it('orders 2 to 20 stops and rejects fewer or more', () => {
    const line = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${i}`, lat: 0, lng: i / 100 }));
    expect(() => optimizeOrder(pts.slice(0, 1))).toThrow(RangeError);
    expect(optimizeOrder(line(13))).toHaveLength(13);
    expect(optimizeOrder(line(20))).toHaveLength(20);
    expect(() => optimizeOrder(line(21))).toThrow(/between 2 and 20 stops, got 21/);
  });

  it('estimates legs with a detour factor', () => {
    const [leg] = estimateLegs(pts.slice(0, 2));
    const straight = haversineMeters(pts[0]!, pts[1]!);
    expect(leg!.distanceM).toBe(Math.round(straight * 1.3));
    expect(leg!.durationS).toBeGreaterThan(0);
  });
});

describe('navigation links', () => {
  it('builds a Google Maps walking URL with waypoints', () => {
    const url = googleMapsDirectionsUrl([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
      { lat: 5, lng: 6 },
    ]);
    expect(url).toContain('travelmode=walking');
    expect(url).toContain(`waypoints=${encodeURIComponent('3.000000,4.000000')}`);
  });

  it('builds an Apple Maps walking leg URL', () => {
    expect(appleMapsLegUrl({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).toContain('dirflg=w');
  });
});

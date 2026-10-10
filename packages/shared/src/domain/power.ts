/**
 * Which plug types (IEC letters) physically fit which socket types. Europlug (C) fits most
 * round-pin sockets; E and F are interchangeable through the common hybrid "E/F" plug.
 */
const PLUG_FITS_SOCKETS: Record<string, readonly string[]> = {
  A: ['A', 'B'],
  B: ['B'],
  C: ['C', 'E', 'F', 'J', 'K', 'L', 'N'],
  D: ['D'],
  E: ['E', 'F'],
  F: ['E', 'F'],
  G: ['G'],
  H: ['H'],
  I: ['I'],
  J: ['J'],
  K: ['K'],
  L: ['L'],
  M: ['M'],
  N: ['N'],
};

export type PowerCheck = {
  adapterNeeded: boolean | null;
  /** True when home and destination mains voltages are in different bands (100–127 V vs 220–240 V). */
  voltageDiffers: boolean | null;
  compatiblePlugs: string[];
};

const band = (v: number) => (v < 170 ? 'low' : 'high');

export function checkPower(input: {
  homePlugs: readonly string[];
  homeVoltage: number | null;
  destinationPlugs: readonly string[];
  destinationVoltage: number | null;
}): PowerCheck {
  const { homePlugs, destinationPlugs, homeVoltage, destinationVoltage } = input;
  const compatiblePlugs = homePlugs.filter((p) =>
    (PLUG_FITS_SOCKETS[p] ?? [p]).some((s) => destinationPlugs.includes(s)),
  );
  return {
    adapterNeeded:
      homePlugs.length === 0 || destinationPlugs.length === 0 ? null : compatiblePlugs.length === 0,
    voltageDiffers:
      homeVoltage == null || destinationVoltage == null
        ? null
        : band(homeVoltage) !== band(destinationVoltage),
    compatiblePlugs,
  };
}

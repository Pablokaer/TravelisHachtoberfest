// Test double: a clock the test moves by hand (for cool-downs and expiries).

/** Milliseconds since the epoch, starting at a fixed instant; `advance` moves it forward. */
export class FakeClock {
  ms = Date.parse('2026-10-03T12:00:00Z');
  now = (): number => this.ms;
  advance = (seconds: number): void => void (this.ms += seconds * 1000);
}

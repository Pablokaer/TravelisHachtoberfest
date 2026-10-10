import { assertEquals } from 'jsr:@std/assert@1';

import { logEvent, type LogLine } from './log.ts';

/** Captures what would go to the console. */
class FakeConsole {
  readonly lines: { level: LogLine['level']; text: string }[] = [];
  write = (level: LogLine['level'], text: string): void => void this.lines.push({ level, text });
}

Deno.test('logEvent writes one JSON line with the event, level and fields', () => {
  const sink = new FakeConsole();
  logEvent({ level: 'warn', event: 'auth_email_failed', status: 422 }, sink.write);
  assertEquals(sink.lines.length, 1);
  assertEquals(sink.lines[0]!.level, 'warn');
  assertEquals(JSON.parse(sink.lines[0]!.text), {
    level: 'warn',
    event: 'auth_email_failed',
    status: 422,
  });
});

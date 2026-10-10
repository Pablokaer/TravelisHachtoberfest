// Structured logs (CLAUDE.md → Logging): one JSON object per line, so the Supabase log explorer
// can filter by `event` and fields instead of parsing prose.

export type LogLine = { level: 'info' | 'warn' | 'error'; event: string } & Record<string, unknown>;
export type LogSink = (level: LogLine['level'], text: string) => void;

const consoleSink: LogSink = (level, text) => console[level](text);

/**
 * Writes one structured log line.
 * @example logEvent({ level: 'info', event: 'welcome_email_sent', userId })
 */
export function logEvent(line: LogLine, sink: LogSink = consoleSink): void {
  sink(line.level, JSON.stringify(line));
}

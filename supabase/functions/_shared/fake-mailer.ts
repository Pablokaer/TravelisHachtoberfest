// Test double: a mailer that keeps what it was asked to send, or fails like a provider would.
import type { EmailMessage, Mailer } from './mailer.ts';

export class FakeMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  constructor(private readonly failure?: Error) {}

  send(message: EmailMessage): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    this.sent.push(message);
    return Promise.resolve();
  }
}

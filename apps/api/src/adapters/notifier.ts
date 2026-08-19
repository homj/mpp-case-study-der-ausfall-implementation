/**
 * The one door for patient messages. Nothing outside this port may send.
 * The case study runs `FakeNotifier`: the outbox row is the record of what the
 * practice would have sent, and the UI shows it.
 */
import type { NotificationPayload } from '@ausfall/db';

export interface NotifierResult {
  ok: true;
}

export interface Notifier {
  send(notification: NotificationPayload): Promise<NotifierResult>;
}

export class FakeNotifier implements Notifier {
  async send(): Promise<NotifierResult> {
    return { ok: true };
  }
}

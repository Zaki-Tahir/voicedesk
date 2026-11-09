import twilio from "twilio";

export interface SmsSender {
  send(to: string, from: string, body: string): Promise<void>;
}

export class TwilioSmsSender implements SmsSender {
  private readonly client: ReturnType<typeof twilio>;

  constructor(accountSid: string, authToken: string) {
    this.client = twilio(accountSid, authToken);
  }

  async send(to: string, from: string, body: string) {
    await this.client.messages.create({ to, from, body });
  }
}

/** Local development: print instead of sending. */
export class ConsoleSmsSender implements SmsSender {
  async send(to: string, from: string, body: string) {
    console.log(`[sms] ${from} -> ${to}: ${body}`);
  }
}

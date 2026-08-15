declare module "nodemailer" {
  export interface TransportOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
    logger?: boolean;
    debug?: boolean;
  }

  export interface SentMessageInfo {
    messageId?: string;
  }

  export interface Transporter {
    sendMail(mail: {
      from: string;
      to: string;
      subject: string;
      text: string;
      messageId?: string;
      headers?: Record<string, string>;
    }): Promise<SentMessageInfo>;
  }

  export function createTransport(options: TransportOptions): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}

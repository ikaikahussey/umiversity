import { Resend } from "resend";

export type Email = { to: string; subject: string; text: string; html?: string };
export type EmailSender = (email: Email) => Promise<{ ok: boolean; error?: string }>;

/** Sends with Resend when RESEND_API_KEY is set; otherwise reports that email is disabled. */
export function defaultEmailSender(): EmailSender {
  const key = process.env.RESEND_API_KEY;
  if (!key) return async () => ({ ok: false, error: "RESEND_API_KEY not set" });
  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM ?? "Umiversity <noreply@umiversity.org>";
  return async ({ to, subject, text, html }) => {
    const { error } = await resend.emails.send({ from, to, subject, text, html: html ?? undefined });
    return error ? { ok: false, error: error.message } : { ok: true };
  };
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
  return `${base}${path}`;
}

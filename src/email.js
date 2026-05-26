import { badRequest } from './errors.js';

export function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, replyTo, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_FROM_EMAIL || 'ReadySend <onboarding@resend.dev>';

  if (!apiKey) {
    throw badRequest('email_not_configured', 'Email is not configured yet. Add RESEND_API_KEY to the backend environment.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw badRequest('email_send_failed', payload?.message || 'Could not send email.');
  }

  return payload;
}

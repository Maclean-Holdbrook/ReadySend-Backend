import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { sendEmail } from '../email.js';

export const contactRouter = Router();

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(3000)
});

contactRouter.post('/', async (req, res, next) => {
  try {
    const input = contactSchema.parse(req.body);
    const toEmail = process.env.CONTACT_TO_EMAIL;

    if (!toEmail) {
      throw badRequest(
        'contact_email_not_configured',
        'Contact email is not configured yet. Add CONTACT_TO_EMAIL to the backend environment.'
      );
    }

    const payload = await sendEmail({
      to: toEmail,
      replyTo: input.email,
      subject: `ReadySend contact: ${input.subject}`,
      text: `Name: ${input.name}\nEmail: ${input.email}\n\n${input.message}`
    });

    res.status(202).json({ ok: true, id: payload.id });
  } catch (error) {
    next(error);
  }
});

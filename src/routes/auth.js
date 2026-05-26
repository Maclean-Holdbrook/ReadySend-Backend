import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../errors.js';
import { hashPassword, verifyPassword } from '../passwords.js';
import { createSessionToken, verifySessionToken } from '../sessionTokens.js';
import { createSellerSlug, ensureSellerSlug } from '../slugs.js';
import { supabase } from '../supabase.js';
import { sellerSchema } from '../validation.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(1).max(120)
});

const authSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(120)
});

const signupSchema = authSchema.merge(sellerSchema);

function toSeller(data) {
  return {
    id: data.id,
    businessName: data.business_name,
    whatsappPhone: data.whatsapp_phone,
    category: data.category,
    mainChannel: data.main_channel,
    logoUrl: data.logo_url,
    sellerSlug: data.seller_slug,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

authRouter.post('/signup', async (req, res, next) => {
  let sellerId = null;

  try {
    const input = signupSchema.parse(req.body);
    const email = input.email.toLowerCase();

    const { data: existing } = await supabase
      .from('seller_accounts')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      throw badRequest('email_taken', 'An account already exists for this email.');
    }

    const { data: seller, error: sellerError } = await supabase
      .from('sellers')
      .insert({
        business_name: input.businessName,
        whatsapp_phone: input.whatsappPhone,
        category: input.category,
        main_channel: input.mainChannel,
        logo_url: input.logoUrl || null,
        seller_slug: createSellerSlug(input.businessName)
      })
      .select()
      .single();

    if (sellerError) throw badRequest('seller_create_failed', sellerError.message);
    sellerId = seller.id;

    const passwordHash = await hashPassword(input.password);
    const { data: account, error: accountError } = await supabase
      .from('seller_accounts')
      .insert({
        seller_id: seller.id,
        email,
        password_hash: passwordHash
      })
      .select()
      .single();

    if (accountError) {
      await supabase.from('sellers').delete().eq('id', sellerId);
      throw badRequest('account_create_failed', accountError.message);
    }

    const token = createSessionToken({ sellerId: seller.id, accountId: account.id, email });
    res.status(201).json({ token, seller: toSeller(seller) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const email = input.email.toLowerCase();

    const { data: account, error } = await supabase
      .from('seller_accounts')
      .select('*, sellers(*)')
      .eq('email', email)
      .maybeSingle();

    if (error) throw badRequest('login_failed', error.message);
    if (!account || !(await verifyPassword(input.password, account.password_hash))) {
      throw badRequest('invalid_credentials', 'Email or password is incorrect.');
    }

    const sellerSlug = await ensureSellerSlug(account.sellers);
    const token = createSessionToken({ sellerId: account.seller_id, accountId: account.id, email });
    res.json({ token, seller: toSeller({ ...account.sellers, seller_slug: sellerSlug }) });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', async (req, res, next) => {
  try {
    const session = verifySessionToken(getBearerToken(req));
    if (!session) throw badRequest('invalid_session', 'Please log in again.');

    const { data: seller, error } = await supabase
      .from('sellers')
      .select('*')
      .eq('id', session.sellerId)
      .maybeSingle();

    if (error) throw badRequest('session_lookup_failed', error.message);
    if (!seller) throw notFound('Seller profile not found.');

    const sellerSlug = await ensureSellerSlug(seller);
    res.json({ seller: toSeller({ ...seller, seller_slug: sellerSlug }) });
  } catch (error) {
    next(error);
  }
});

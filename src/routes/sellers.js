import { Router } from 'express';
import { sellerSchema } from '../validation.js';
import { supabase } from '../supabase.js';
import { badRequest, notFound } from '../errors.js';
import { createSellerSlug, ensureSellerSlug } from '../slugs.js';

export const sellersRouter = Router();

function toSellerResponse(data) {
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

sellersRouter.post('/', async (req, res, next) => {
  try {
    const input = sellerSchema.parse(req.body);

    const { data, error } = await supabase
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

    if (error) {
      throw badRequest('seller_create_failed', error.message);
    }

    res.status(201).json({
      seller: toSellerResponse(data)
    });
  } catch (error) {
    next(error);
  }
});

sellersRouter.post('/:id/slug', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('sellers')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw badRequest('seller_fetch_failed', error.message);
    if (!data) throw notFound('Seller profile not found.');

    const sellerSlug = await ensureSellerSlug(data);
    res.json({ seller: toSellerResponse({ ...data, seller_slug: sellerSlug }) });
  } catch (error) {
    next(error);
  }
});

sellersRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = sellerSchema.parse(req.body);

    const { data, error } = await supabase
      .from('sellers')
      .update({
        business_name: input.businessName,
        whatsapp_phone: input.whatsappPhone,
        category: input.category,
        main_channel: input.mainChannel,
        logo_url: input.logoUrl || null
      })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      throw badRequest('seller_update_failed', error.message);
    }

    if (!data) {
      throw notFound('Seller profile not found.');
    }

    res.json({
      seller: toSellerResponse(data)
    });
  } catch (error) {
    next(error);
  }
});

import crypto from 'crypto';
import { supabase } from './supabase.js';

export function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug || 'seller';
}

export function createSellerSlug(businessName) {
  return `${slugify(businessName)}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function ensureSellerSlug(seller) {
  if (seller?.seller_slug) return seller.seller_slug;

  const sellerSlug = createSellerSlug(seller.business_name);
  const { error } = await supabase
    .from('sellers')
    .update({ seller_slug: sellerSlug })
    .eq('id', seller.id);

  if (error) throw error;
  return sellerSlug;
}

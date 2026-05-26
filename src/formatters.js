export function maskPhone(phone) {
  const value = String(phone || '').trim();
  if (value.length <= 4) return value;
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(3, value.length - 7))}${value.slice(-3)}`;
}

export function toPublicReceipt(order, seller, proof = null) {
  return {
    order: {
      id: order.id,
      buyerName: order.buyer_name,
      buyerPhone: maskPhone(order.buyer_phone),
      productName: order.product_name,
      productVariation: order.product_variation,
      quantity: order.quantity,
      amount: order.amount,
      currency: order.currency,
      deliveryArea: order.delivery_area,
      deliveryAddress: order.delivery_address,
      deliveryDate: order.delivery_date,
      paymentTerms: order.payment_terms,
      confirmationStatus: order.confirmation_status,
      packageReady: order.package_ready,
      fulfillmentStatus: order.fulfillment_status,
      confirmationExpiresAt: order.confirmation_expires_at
    },
    seller: {
      businessName: seller.business_name,
      whatsappPhone: maskPhone(seller.whatsapp_phone),
      category: seller.category,
      mainChannel: seller.main_channel,
      logoUrl: seller.logo_url,
      verificationNote: 'ReadySend helps this seller confirm order details. ReadySend does not verify sellers or hold payment.'
    },
    proof: proof
      ? {
          id: proof.id,
          confirmedAt: proof.confirmed_at,
          expiresAt: proof.expires_at
        }
      : null
  };
}

export function toOrderResponse(order, confirmationUrl = undefined) {
  const resolvedConfirmationUrl = confirmationUrl || order.confirmation_url || undefined;

  return {
    id: order.id,
    sellerId: order.seller_id,
    buyerName: order.buyer_name,
    buyerPhone: order.buyer_phone,
    productName: order.product_name,
    productVariation: order.product_variation,
    quantity: order.quantity,
    amount: order.amount,
    currency: order.currency,
    deliveryArea: order.delivery_area,
    deliveryAddress: order.delivery_address,
    deliveryDate: order.delivery_date,
    paymentTerms: order.payment_terms,
    confirmationStatus: order.confirmation_status,
    packageReady: order.package_ready,
    fulfillmentStatus: order.fulfillment_status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    ...(resolvedConfirmationUrl ? { confirmationUrl: resolvedConfirmationUrl } : {})
  };
}

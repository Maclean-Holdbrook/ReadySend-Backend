import { Router } from 'express';
import { mapSupabaseRpcError } from '../errors.js';
import { confirmReceiptToken, fetchPublicReceipt } from '../receiptPage.js';
import { confirmReceiptSchema } from '../validation.js';

export const receiptsRouter = Router();

receiptsRouter.get('/:token', async (req, res, next) => {
  try {
    res.json({
      receipt: await fetchPublicReceipt(req.params.token)
    });
  } catch (error) {
    next(error);
  }
});

receiptsRouter.post('/:token/confirm', async (req, res, next) => {
  try {
    const input = confirmReceiptSchema.parse({
      buyerName: req.body.buyerName || undefined,
      buyerPhone: req.body.buyerPhone || undefined,
      deliveryAddress: req.body.deliveryAddress || undefined
    });
    const { data, error } = await confirmReceiptToken(req.params.token, input);

    if (error) {
      console.error('API receipt confirmation failed', {
        token: req.params.token,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      const mappedError = mapSupabaseRpcError(error);
      mappedError.message =
        process.env.NODE_ENV === 'production'
          ? mappedError.message
          : `${mappedError.message} ${error.message || ''}`.trim();
      mappedError.details =
        process.env.NODE_ENV === 'production'
          ? mappedError.details
          : { supabase: { code: error.code, details: error.details, hint: error.hint } };
      throw mappedError;
    }

    const result = data?.[0];
    if (req.is('application/x-www-form-urlencoded')) {
      res.redirect(`/receipt/${encodeURIComponent(req.params.token)}`);
      return;
    }

    res.json({
      confirmation: {
        orderId: result.order_id,
        proofId: result.proof_id,
        status: result.status
      }
    });
  } catch (error) {
    next(error);
  }
});

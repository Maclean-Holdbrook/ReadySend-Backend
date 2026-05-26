import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, mapSupabaseRpcError } from './errors.js';
import { confirmReceiptToken, fetchPublicReceipt, renderReceiptErrorPage, renderReceiptPage } from './receiptPage.js';
import { authRouter } from './routes/auth.js';
import { billingRouter, paystackWebhookRouter } from './routes/billing.js';
import { buyerRequestsRouter, publicBuyerRequestsRouter } from './routes/buyerRequests.js';
import { contactRouter } from './routes/contact.js';
import { ordersRouter } from './routes/orders.js';
import { receiptsRouter } from './routes/receipts.js';
import { sellersRouter } from './routes/sellers.js';
import { confirmReceiptSchema } from './validation.js';

export function createApp() {
  const app = express();

  app.use('/api/billing/webhook', express.raw({ type: 'application/json', limit: '100kb' }), paystackWebhookRouter);

  app.use(
    helmet({
      crossOriginOpenerPolicy: false,
      hsts: false,
      originAgentCluster: false,
      contentSecurityPolicy: {
        directives: {
          'upgrade-insecure-requests': null
        }
      }
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'readysend-backend' });
  });

  app.get('/receipt/:token', async (req, res, next) => {
    try {
      const receipt = await fetchPublicReceipt(req.params.token);
      res.type('html').send(renderReceiptPage(receipt, req.params.token));
    } catch (error) {
      next(error);
    }
  });

  app.post('/receipt/:token/confirm', async (req, res, next) => {
    try {
      const input = confirmReceiptSchema.parse({
        buyerName: req.body.buyerName || undefined,
        buyerPhone: req.body.buyerPhone || undefined,
        deliveryAddress: req.body.deliveryAddress || undefined
      });
      const { error } = await confirmReceiptToken(req.params.token, input);

      if (error) {
        console.error('Receipt confirmation failed', {
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
        throw mappedError;
      }

      res.redirect(303, `/receipt/${encodeURIComponent(req.params.token)}`);
    } catch (error) {
      res.status(error.statusCode || 500).type('html').send(renderReceiptErrorPage(error.message || 'Please try again.'));
    }
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin not allowed by CORS'));
      }
    })
  );

  app.use('/api/auth', authRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/public', publicBuyerRequestsRouter);
  app.use('/api/buyer-requests', buyerRequestsRouter);
  app.use('/api/contact', contactRouter);
  app.use('/api/sellers', sellersRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/receipts', receiptsRouter);

  app.use(errorHandler);

  return app;
}

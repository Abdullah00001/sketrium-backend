import express from 'express';
import { webhookController } from './webhook.controller';

const router = express.Router();

router.post(
  '/wix',
  webhookController.handleWixWebhook
);

export const webhookRoutes = router;

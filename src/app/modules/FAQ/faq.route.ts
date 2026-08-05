import express from 'express';
import { FAQController } from './faq.controller';

const router = express.Router();

router.get('/faqs', FAQController.getAllFAQs);
router.post('/faqs', FAQController.createFAQ);
router.put('/faqs/:id', FAQController.updateFAQ);
router.delete('/faqs/:id', FAQController.deleteFAQ);

export const FAQRoutes = router;
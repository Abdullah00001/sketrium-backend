import { Router } from 'express';
import { authRoutes } from '../modules/auth/user.routes';
import { userRoutes } from '../modules/user/user.routes';
import { adminRoutes } from '../modules/Dashboard/admin/admin.route';
import { sosaleMediaRoutes } from '../modules/sociallink/social.routes';
import { eventRoutes } from '../modules/event/event.routes';
import { productsRoutes } from '../modules/product/product.routes';
import { ticketRoutes } from '../modules/Ticke/ticke.routes';
import { orderRoutes } from '../modules/userOrder/userOrder.routes';
import { cartRoutes } from '../modules/addtocard/addtocard.routes';
import { personalizationRoutes } from '../modules/Personalizationuser/Personalization.routes';
import { wishlistRoutes } from '../modules/Wishlist/wishlist.routes';
import { PlanRoutes } from '../modules/subPlan/subplan.routes';
import { PaymentRoutes } from '../modules/subPayment/subpayment.routes';
import { eventWishlistRoutes } from '../modules/Eventwishlist/wishlist.routes';
import { PromoCodeRoutes } from '../modules/PromoCode/promocode.routes';
import { catagoreeventRoutes } from '../modules/eventcatagore/eventcatagore.routes';
import { ProductCategoryRoutes } from '../modules/ProductCategory/ProductCategory.routes';
import { reviewRoutes } from '../modules/profilereview/profilereview.routes';
import { EventReviewReportRoutes } from '../modules/Eventreviewreport/Eventreviewreport.routes';
import { ProductReviewReportRoutes } from '../modules/Productreviewreport/Productreviewreport.routes';
import { FollowRoutes } from '../modules/Follow/follow.routes';
import { NotificationRoutes } from '../modules/Dashboard/notifications/notifications.routes';
import { SettingsRoutes } from '../modules/Settings/Settings.routes';
import { ContactRoutes } from '../modules/Contact/contact.routes';
import { WithdrawalRoutes } from '../modules/withdrawal/withdrawal.routes';
import { FAQRoutes } from '../modules/FAQ/faq.route';
import { webhookRoutes } from '../modules/webhook/webhook.routes';

// import { PromoCodeRoutes } from '../modules/PromoCode/promocode.routes';




const router = Router();
const moduleRoutes = [
  {
    path: '/users',
    route: userRoutes,
  },

  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: '/admin',
    route: adminRoutes,
  },
  {
    path: '/social',
    route: sosaleMediaRoutes,
  },
  {
    path: '/event',
    route: eventRoutes,
  },
  {
    path: '/products',
    route: productsRoutes,
  },
  {
    path: '/tickets',
    route: ticketRoutes,
  },
  {
    path: '/products',
    route: productsRoutes,
  },
  {
    path: '/order',
    route: orderRoutes,
  },
  {
    path: '/card',
    route: cartRoutes,
  },
  {
    path: '/personalization',
    route: personalizationRoutes,
  },
  {
    path: '/wishlist',
    route: wishlistRoutes,
  },
  {
    path: '/plans',
    route: PlanRoutes,
  },
  {
    path: '/subscription',
    route: PaymentRoutes,
  },
  {
    path: '/eventWishlist',
    route: eventWishlistRoutes,
  },
  {
    path: '/promocode',
    route: PromoCodeRoutes,
  },
  {
    path: '/catagore',
    route: catagoreeventRoutes,
  },
  {
    path: '/same',
    route: ProductCategoryRoutes,
  },
  {
    path: '/review',
    route: reviewRoutes,
  },

  {
    path: '/eventreport',
    route: EventReviewReportRoutes,
  },
  {
    path: '/ProductReport',
    route: ProductReviewReportRoutes,
  },
  {
    path: '/follow',
    route: FollowRoutes,
  },
  {
    path: '/notifications',
    route: NotificationRoutes,
  },
  {
    path: '/Settings',
    route: SettingsRoutes,
  },
  {
    path: '/contact',
    route: ContactRoutes,
  },
  {
    path: '/withdrawal',
    route: WithdrawalRoutes,
  },
  {
    path: '/faq',
    route: FAQRoutes,
  },
  {
    path: '/webhooks',
    route: webhookRoutes,
  },

];
// moduleRoutes.forEach((route) => router.use(route.path, route.route));

moduleRoutes.forEach(route => {
  router.use(route.path, route.route);
});

export default router;

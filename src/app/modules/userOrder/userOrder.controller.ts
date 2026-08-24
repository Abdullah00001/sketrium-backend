// order.controller.ts
import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { orderService } from './userOrder.service';
import {
  generateCancelHTML,
  generateSuccessHTML,
} from '../../utils/orderPage.helper';
import Stripe from 'stripe';
import config from '../../config';
import { Order } from './userOrder.model';
import httpStatus from 'http-status';
import { Cart } from '../addtocard/addtotocard.model';
const stripe = new Stripe(config.stripe.stripe_secret_key as string);

const createOrder = catchAsync(async (req: Request, res: Response) => {
  const result = await orderService.createOrder(req.user._id, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Order created successfully',
    data: result,
  });
});

const getOrderHistory = catchAsync(async (req: Request, res: Response) => {
  const result = await orderService.getOrderHistory(
    req.user._id,
    req.query.page ? Number(req.query.page) : 1,
    req.query.limit ? Number(req.query.limit) : 10,
    req.query.orderStatus as string, // ✅ নতুন
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Order history fetched',
    data: result,
  });
});

const getOrderDetails = catchAsync(async (req: Request, res: Response) => {
  const result = await orderService.getOrderDetails(
    req.params.id as string,
    req.user._id,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Order details fetched',
    data: result,
  });
});

// GET /api/orders/order-success
export const orderSuccessPage = catchAsync(async (req, res) => {
  const { orderId, session_id } = req.query;

  if (!orderId || !session_id) {
    return res.send(generateCancelHTML('Invalid request.'));
  }

  const order = await Order.findById(orderId).populate({
    path: 'items.product',
    select: 'name images price discountPrice',
  });

  if (!order) {
    return res.send(generateCancelHTML('Order not found.'));
  }

  let paymentIntentId: string | undefined;

  try {
    // 1️⃣ Get Stripe session
    const session = await stripe.checkout.sessions.retrieve(
      session_id as string,
    );

    if (!session) {
      return res.send(generateCancelHTML('Invalid session.'));
    }

    paymentIntentId = session.payment_intent as string;

    // 2️⃣ Already paid check (idempotency)
    if (order.paymentStatus === 'completed' || order.paymentStatus === 'paid') {
      return res.send(generateSuccessHTML(order, 'Already paid.'));
    }

    // 3️⃣ Payment not successful → no refund needed
    if (session.payment_status !== 'paid') {
      return res.send(generateCancelHTML('Payment not completed.'));
    }

    // 4️⃣ DB operations (critical section)
    const cartId = session.metadata?.cartId;

    if (cartId) {
      await Cart.findByIdAndDelete(cartId);
    }

    await Order.findByIdAndUpdate(orderId, {
      paymentStatus: 'completed',
      stripePaymentIntentId: paymentIntentId || '',
    });

    // 5️⃣ Success response
    return res.send(generateSuccessHTML(order, 'Payment successful.'));
  } catch (error) {
    console.error('Payment flow error:', error);

    // 🚨 AUTO REFUND ON ANY FAILURE
    try {
      if (paymentIntentId) {
        const paymentIntent =
          await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === 'succeeded') {
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
          });
        }
      }
    } catch (refundError) {
      console.error('Refund failed:', refundError);
    }

    return res.send(
      generateCancelHTML(
        'Something failed after payment. Refund initiated if charged.',
      ),
    );
  }
});

// GET /api/orders/cart
export const orderCancelPage = catchAsync(async (req, res) => {
  res.send(generateCancelHTML(' payment cancel'));
});

export const updateOrderStatus = catchAsync(async (req, res) => {
  const result = await orderService.updateOrderStatus(
    req.params.orderId as string,
    req.body.orderStatus,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Order status updated',
    data: result,
  });
});

const getMyProductOrders = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user._id;
  const { orderStatus, page, limit } = req.query;

  const result = await orderService.getMyProductOrders(
    userId,
    orderStatus as string | undefined,
    Number(page) || 1,
    Number(limit) || 10,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Your product orders fetched successfully',
    data: result,
  });
});

const stripeWebhook = catchAsync(async (req: Request, res: Response) => {
  await orderService.handleStripeWebhook(req);

  res.status(200).json({ received: true });
});

export const orderController = {
  createOrder,

  getOrderHistory,
  getOrderDetails,
  orderCancelPage,
  orderSuccessPage,
  updateOrderStatus,
  getMyProductOrders,
  stripeWebhook,
};

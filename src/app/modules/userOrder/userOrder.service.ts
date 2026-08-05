// order.service.ts

import config from '../../config';
import AppError from '../../error/AppError';
import { Cart } from '../addtocard/addtotocard.model';
import { Product } from '../product/product.model';
import User from '../user/user.model';
import { Order } from './userOrder.model';
import Stripe from 'stripe';
import httpStatus from 'http-status';
import { BalanceModel } from '../Balance/balance.model';
import mongoose from 'mongoose';

const stripe = new Stripe(config.stripe.stripe_secret_key as string);

const getOrderHistory = async (
  userId: string,
  page = 1,
  limit = 10,
  orderStatus?: string, // ✅ নতুন
) => {
  const skip = (page - 1) * limit;

  const filter: any = {
    user: userId,
    isDeleted: false,
  };

  // ✅ orderStatus দিলে filter করবে, না দিলে সব আসবে
  if (orderStatus && orderStatus.trim() !== '') {
    const validStatuses = ['processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(orderStatus)) {
      throw new AppError(
        400,
        `Invalid orderStatus. Must be one of: ${validStatuses.join(', ')}`,
      );
    }
    filter.orderStatus = orderStatus;
  }

  const total = await Order.countDocuments(filter);

  const orders = await Order.find(filter)
    .populate('items.product', 'name images price currency')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    orders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ─── 4. Get Single Order Details ──────────────────────────────────────────
const getOrderDetails = async (orderId: string, userId: string) => {
  const order = await Order.findOne({ _id: orderId, user: userId }).populate(
    'items.product',
    'name images price category',
  );
  if (!order) throw new Error('Order not found');
  return order;
};

// ─── 5. Cancel Order ──────────────────────────────────────────────────────
const cancelOrder = async (orderId: string, userId: string) => {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new Error('Order not found');

  if (order.orderStatus !== 'processing') {
    throw new Error('Only processing orders can be cancelled');
  }

  // Refund via Stripe if already paid
  if (order.paymentStatus === 'paid' && order.stripePaymentIntentId) {
    await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
    });
    order.paymentStatus = 'refunded';
  }

  order.orderStatus = 'cancelled';
  await order.save();
  return order;
};

export const createOrder = async (userId: string, body: any) => {
  const { shippingAddress, cartId } = body;

  const cart = await Cart.findOne({
    _id: cartId,
    user: userId,
  }).populate({
    path: 'items.product',
    select: 'name price discountPrice shippingCost stock images host currency',
  });

  if (!cart) throw new AppError(404, 'Cart not found');
  if (cart.items.length === 0) throw new AppError(400, 'Cart is empty');

  const firstProduct = cart.items[0]?.product as any;
  const orderCurrency = firstProduct?.currency
    ? firstProduct.currency.toLowerCase()
    : 'usd';

  const lineItems: any[] = [];
  let totalShipping = 0;
  let subtotal = 0;
  const orderItemsSnapshot: any[] = [];
  const vendorEarnings: Array<{ productId: string; earningAmount: number }> =
    [];

  for (const item of cart.items as any[]) {
    const product = item.product;

    if (!product) throw new AppError(404, `Product not found`);

    if (product.stock < item.quantity)
      throw new AppError(400, `${product.name} is out of stock`);

    // discountPrice > 0 হলে discountPrice, নাহলে original price
    const unitPrice =
      product.discountPrice > 0 ? product.discountPrice : product.price;

    const itemTotal = unitPrice * item.quantity;
    subtotal += itemTotal;
    totalShipping += product.shippingCost || 0;

    // অর্ডারের স্ন্যাপশট তৈরি
    orderItemsSnapshot.push({
      product: product._id,
      quantity: item.quantity,
      color: item.color,
      size: item.size,
      price: unitPrice,
    });

    vendorEarnings.push({
      productId: product._id.toString(),
      earningAmount: itemTotal, // (দাম × পরিমাণ)
    });

    lineItems.push({
      price_data: {
        currency: orderCurrency,
        product_data: {
          name: product.name,
          images: product.images?.[0]?.url ? [product.images[0].url] : [],
        },
        unit_amount: Math.round(unitPrice * 100), // Stripe সেন্টস (Cents) এ হিসাব করে
      },
      quantity: item.quantity,
    });
  }

  const total = subtotal + totalShipping;

  const generateOrderId = async (): Promise<string> => {
    let unique = false;
    let oderid = '';

    while (!unique) {
      const random = Math.floor(10000 + Math.random() * 90000);
      oderid = `#${random}`;
      const existing = await Order.findOne({ oderid });
      if (!existing) {
        unique = true;
      }
    }
    return oderid;
  };

  const oderid = await generateOrderId();

  const pendingOrder = await Order.create({
    user: userId,
    items: orderItemsSnapshot,
    shippingAddress,
    subtotal,
    oderid,
    shippingCost: totalShipping,
    total,
    currency: firstProduct?.currency || 'USD',
    paymentStatus: 'pending',
    orderStatus: 'processing',
  });

  // ৫. Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: `${config.backend_url}/order/success?orderId=${pendingOrder._id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.backend_url}/order/cancel`,
    metadata: {
      orderId: pendingOrder._id.toString(),
      userId: userId.toString(),
      cartId: cartId.toString(),
      vendorEarnings: JSON.stringify(vendorEarnings),
    },
    shipping_options:
      totalShipping > 0
        ? [
            {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: {
                  amount: Math.round(totalShipping * 100),
                  currency: orderCurrency, // 👈 শিপিং খরচের কারেন্সিও ডাইনামিক করা হলো
                },
                display_name: 'Standard Shipping',
              },
            },
          ]
        : [],
  });

  return {
    checkoutUrl: session.url,
    orderId: pendingOrder._id,
    sessionId: session.id,
  };
};

export const handleStripeWebhook = async (req: any) => {
  const sig = req.headers['stripe-signature'];
  // stripe.Event (ছোট হাতের s) অথবা সরাসরি constructEvent এর রিটার্ন টাইপ ব্যবহার করুন
  let event: ReturnType<typeof stripe.webhooks.constructEvent>;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch (err: any) {
    throw new AppError(400, `Webhook Error: ${err.message}`);
  }

  // ১. পেমেন্ট সফল হলে ব্যালেন্স এবং অর্ডার আপডেট হবে
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const orderId = session.metadata?.orderId;
    const cartId = session.metadata?.cartId;
    const vendorEarningsRaw = session.metadata?.vendorEarnings;

    const dbSession = await mongoose.startSession();

    try {
      await dbSession.startTransaction();

      // ✅ Order paid update করো
      await Order.findByIdAndUpdate(
        orderId,
        {
          paymentStatus: 'paid',
          stripePaymentIntentId: session.payment_intent,
          stripeSessionId: session.id,
        },
        { session: dbSession },
      );

      // ✅ Cart clear করো
      await Cart.findByIdAndUpdate(
        cartId,
        { items: [] },
        { session: dbSession },
      );

      // ✅ হোস্ট বা ভেন্ডরের BalanceModel আপডেট (টাকা যোগ করা)
      if (vendorEarningsRaw) {
        const vendorEarnings = JSON.parse(vendorEarningsRaw);

        for (const earning of vendorEarnings) {
          // প্রোডাক্ট আইডি দিয়ে প্রোডাক্টের মূল হোস্ট বা ইউজারের আইডি খুঁজে বের করা
          const product = await Product.findById(earning.productId).session(
            dbSession,
          );

          if (product && product.host) {
            await BalanceModel.findOneAndUpdate(
              { userId: product.host },
              {
                $inc: { currentBalance: earning.earningAmount },
              },
              {
                upsert: true,
                new: true,
                session: dbSession,
              },
            );
          }
        }
      }

      await dbSession.commitTransaction();
    } catch (error) {
      await dbSession.abortTransaction();
      throw error;
    } finally {
      dbSession.endSession();
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as any;
    const orderId = session.metadata?.orderId;

    // ✅ Order cancel করো
    await Order.findByIdAndUpdate(orderId, {
      paymentStatus: 'failed',
      orderStatus: 'cancelled',
    });
  }
};

export const updateOrderStatus = async (orderId: string, status: string) => {
  const validStatus = ['processing', 'shipped', 'delivered', 'cancelled'];
  if (!validStatus.includes(status))
    throw new AppError(400, 'Invalid order status');

  const order = await Order.findByIdAndUpdate(
    orderId,
    { orderStatus: status },
    { new: true },
  );

  if (!order) throw new AppError(404, 'Order not found');
  return order;
};

const getMyProductOrders = async (
  userId: string,
  orderStatus?: string,
  page: number = 1,
  limit: number = 10,
) => {
  // ─── Step 1: host দিয়ে আমার সব product খোঁজো ──────────────
  const myProducts = await Product.find({ host: userId }, { _id: 1 });

  const myProductIds = myProducts.map(p => p._id);

  if (myProductIds.length === 0) {
    return {
      meta: { page, limit, total: 0, totalPages: 0 },
      totalOrders: 0,
      totalQuantity: 0,
      orders: [],
    };
  }

  // ─── Step 2: filter query বানাও ─────────────────────────────
  const query: Record<string, any> = {
    'items.product': { $in: myProductIds },
  };

  if (orderStatus) {
    const validStatuses = ['processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(orderStatus)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Invalid orderStatus. Must be one of: ${validStatuses.join(', ')}`,
      );
    }
    query.orderStatus = orderStatus;
  }

  // ─── Step 3: pagination calculate ───────────────────────────
  const skip = (page - 1) * limit;
  const total = await Order.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  // ─── Step 4: order খোঁজো ────────────────────────────────────
  const orders = await Order.find(query)
    .populate('user', 'fullName email phoneNumber')
    .populate('items.product', 'name discountPrice  images host')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // ─── Step 5: শুধু আমার product এর items ফিল্টার করো ────────
  const myProductIdStrings = myProductIds.map(id => id.toString());

  const result = orders.map(order => {
    const myItems = order.items.filter(item =>
      myProductIdStrings.includes(item.product._id.toString()),
    );

    // const orderId = order._id.toString();
    // const orderNumber = '#' + orderId.substring(19, 24).toUpperCase();

    return {
      orderId: order._id,
      orderNumber: order.oderid,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      customer: order.user,
      shippingAddress: order.shippingAddress,
      myItems,
      total: order.total,
      createdAt: order.createdAt,
    };
  });

  return {
    totalQuantity: result.reduce(
      (sum, o) => sum + o.myItems.reduce((s, i) => s + i.quantity, 0),
      0,
    ),
    orders: result,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const orderService = {
  createOrder,
  handleStripeWebhook,
  getOrderHistory,
  getOrderDetails,
  cancelOrder,
  updateOrderStatus,
  getMyProductOrders,
};

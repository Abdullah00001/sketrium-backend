import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import { Cart } from './addtotocard.model';

// const getCart = async (userId: string) => {
//   const cart = await Cart.findOne({ user: userId }).populate(
//     "items.product",
//     "name price images discountPrice shippingCost"
//   );
//   return cart || { user: userId, items: [] };
// };

const getCart = async (userId: string) => {
  const cart = await Cart.findOne({ user: userId }).populate(
    'items.product',
    'name price images discountPrice currency shippingCost',
  );

  if (!cart || cart.items.length === 0) {
    return {
      user: userId,
      items: [],
      subtotal: 0,
      shippingFee: 0,
      total: 0,
    };
  }

  let subtotal = 0;
  let shippingFee = 0;

  for (const item of cart.items as any[]) {
    const product = item.product;
    if (!product) continue;

    // ✅ discountPrice > 0 হলে discountPrice, নাহলে original price
    const unitPrice =
      product.discountPrice > 0 ? product.discountPrice : product.price;

    subtotal += unitPrice * item.quantity;
    shippingFee += product.shippingCost || 0;
  }

  const total = subtotal + shippingFee;

  return {
    ...cart.toObject(),
    subtotal, // $45
    shippingFee, // $80
    total, // $125
  };
};

const addToCart = async (
  userId: string,
  productId: string,
  currency: string,
  quantity: number,
  color?: string,
  size?: string,
) => {
  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }

  if (cart.items.length > 0 && cart.items[0]?.currency !== currency)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Your cart already contains items in ${cart.items[0]?.currency}. Please complete your current order before adding items in a different currency.`,
    );
  // Check if same product+color+size already in cart
  const existingIndex = cart.items.findIndex(
    (item: any) =>
      item.product.toString() === productId &&
      item.color === (color || '') &&
      item.size === (size || ''),
  );

  if (existingIndex > -1) {
    // Update quantity
    cart.items[existingIndex].quantity += quantity;
  } else {
    cart.items.push({
      product: productId as any,
      currency,
      quantity,
      color,
      size,
    });
  }

  await cart.save();
  return cart.populate('items.product', 'name price images discount');
};

const updateCartItem = async (
  userId: string,
  productId: string,
  quantity: number,
  color?: string,
  size?: string,
) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw new Error('Cart not found');

  const item = cart.items.find((i: any) => {
    const productMatch = i.product.toString() === productId;
    const colorMatch = color ? i.color === color : true;
    const sizeMatch = size ? i.size === size : true;
    return productMatch && colorMatch && sizeMatch;
  });

  if (!item) throw new Error('Item not found in cart');

  if (quantity <= 0) {
    cart.items = cart.items.filter((i: any) => {
      const productMatch = i.product.toString() === productId;
      const colorMatch = color ? i.color === color : true;
      const sizeMatch = size ? i.size === size : true;
      return !(productMatch && colorMatch && sizeMatch);
    });
  } else {
    item.quantity = quantity;
  }

  await cart.save();
  return cart.populate('items.product', 'name price images discount');
};

const removeFromCart = async (userId: string, productId: string) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw new Error('Cart not found');

  cart.items = cart.items.filter(
    (i: any) => i.product.toString() !== productId,
  );

  await cart.save();
  return cart.populate('items.product', 'name price images discount');
};

const clearCart = async (userId: string) => {
  return await Cart.findOneAndUpdate(
    { user: userId },
    { items: [] },
    { new: true },
  );
};

export const cartService = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};

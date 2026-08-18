import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import { Cart } from './addtotocard.model';
import { Product } from '../product/product.model';

// const getCart = async (userId: string) => {
//   const cart = await Cart.findOne({ user: userId }).populate(
//     "items.product",
//     "name price images discountPrice shippingCost"
//   );
//   return cart || { user: userId, items: [] };
// };

// Helper to format cart response with totals
const formatCartResponse = (cart: any) => {
  let subtotal = 0;
  let shippingFee = 0;
  let totalQuantity = 0;

  for (const item of cart.items as any[]) {
    const product = item.product;
    totalQuantity += item.quantity;
    
    if (!product || !product.price) continue; // Skip if not populated or no price

    const unitPrice =
      product.discountPrice > 0 ? product.discountPrice : product.price;

    subtotal += unitPrice * item.quantity;
    shippingFee += product.shippingCost || 0;
  }

  const total = subtotal + shippingFee;

  return {
    ...cart.toObject ? cart.toObject() : cart,
    subtotal,
    shippingFee,
    total,
    totalQuantity,
  };
};

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
      totalQuantity: 0,
    };
  }

  return formatCartResponse(cart);
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
  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product not found');
  }

  // Check if same product+color+size already in cart
  const existingIndex = cart.items.findIndex(
    (item: any) =>
      item.product.toString() === productId &&
      item.color === (color || '') &&
      item.size === (size || ''),
  );

  let newQuantity = quantity;
  if (existingIndex > -1) {
    newQuantity = cart.items[existingIndex].quantity + quantity;
  }

  // Validate stock
  const currentStock = product.stock || 0;
  if (currentStock < newQuantity) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Only ${currentStock} items left in stock.`,
    );
  }

  if (existingIndex > -1) {
    // Update quantity
    cart.items[existingIndex].quantity = newQuantity;
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
  await cart.populate('items.product', 'name price images discountPrice currency shippingCost');
  return formatCartResponse(cart);
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
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError(httpStatus.NOT_FOUND, 'Product not found');
    }

    const currentStock = product.stock || 0;
    if (currentStock < quantity) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Only ${currentStock} items left in stock.`,
      );
    }
    
    item.quantity = quantity;
  }

  await cart.save();
  await cart.populate('items.product', 'name price images discountPrice currency shippingCost');
  return formatCartResponse(cart);
};

const removeFromCart = async (userId: string, productId: string) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) throw new Error('Cart not found');

  cart.items = cart.items.filter(
    (i: any) => i.product.toString() !== productId,
  );

  await cart.save();
  await cart.populate('items.product', 'name price images discountPrice currency shippingCost');
  return formatCartResponse(cart);
};

const clearCart = async (userId: string) => {
  const cart = await Cart.findOneAndUpdate(
    { user: userId },
    { items: [] },
    { new: true },
  );
  return {
    ...(cart ? cart.toObject() : {}),
    subtotal: 0,
    shippingFee: 0,
    total: 0,
    totalQuantity: 0,
  };
};

export const cartService = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};

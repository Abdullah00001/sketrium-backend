import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { cartService } from './addtocard.service';

const getCart = catchAsync(async (req: Request, res: Response) => {
  const result = await cartService.getCart(req.user._id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Cart fetched',
    data: result,
  });
});

const addToCart = catchAsync(async (req: Request, res: Response) => {
  const { productId, currency, quantity = 1, color, size } = req.body;
  const result = await cartService.addToCart(
    req.user._id,
    productId,
    currency,
    quantity,
    color,
    size,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Added to cart',
    data: result,
  });
});

const updateCartItem = catchAsync(async (req: Request, res: Response) => {
  const { productId, quantity, color, size } = req.body;

  const result = await cartService.updateCartItem(
    req.user._id,
    productId,
    quantity,
    color,
    size,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Cart updated',
    data: result,
  });
});

const removeFromCart = catchAsync(async (req: Request, res: Response) => {
  const result = await cartService.removeFromCart(
    req.user._id,
    req.params.productId as string,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Item removed',
    data: result,
  });
});

const clearCart = catchAsync(async (req: Request, res: Response) => {
  await cartService.clearCart(req.user._id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Cart cleared',
    data: null,
  });
});

export const cartController = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};

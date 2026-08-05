import { Router } from 'express';
import { ProductCategoryController } from './ProductCategory.controller';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from '../user/user.constant';

const router = Router();

// ─── Admin Routes ──────────────────────────────────────────────────────────────
router.post(
  '/create-category-product',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  ProductCategoryController.createProductCategory,
);

router.patch(
  '/product-update/:id',
  auth(USER_ROLE.admin),
  ProductCategoryController.updateProductCategory,
);

router.delete(
  '/product-delete/:id',
  auth(USER_ROLE.admin, USER_ROLE.admin),
  ProductCategoryController.deleteProductCategory,
);

// ─── Public Routes ─────────────────────────────────────────────────────────────
router.get(
  '/product-category',
  auth(USER_ROLE.USER, USER_ROLE.MARCHANT, USER_ROLE.admin),
  ProductCategoryController.getAllProductCategories,
);

router.get(
  '/category/:id',
  auth(USER_ROLE.USER, USER_ROLE.MARCHANT, USER_ROLE.admin),
  ProductCategoryController.getProductCategoryById,
);

router.get(
  '/products/:categoryId',
  auth(USER_ROLE.USER, USER_ROLE.MARCHANT, USER_ROLE.admin),
  ProductCategoryController.getProductsByCategoryId,
);

export const ProductCategoryRoutes = router;

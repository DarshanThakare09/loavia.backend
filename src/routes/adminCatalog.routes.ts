import { Router } from "express";
import { AdminCatalogController } from "../controllers/adminCatalog.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { validate } from "../middleware/validator";
import { UserRole } from "@prisma/client";
import {
  createCategorySchema,
  updateCategorySchema,
  createProductSchema,
  updateProductSchema,
  createCollectionSchema,
  updateCollectionSchema,
} from "../validators/catalog.validator";

const router = Router();
const controller = new AdminCatalogController();

// Apply Authentication and RBAC restrictions specifically to catalog routes to prevent cross-router middleware pollution
router.use("/categories", authenticate, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]));
router.use("/products", authenticate, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]));
router.use("/collections", authenticate, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]));

// --- Category Routes ---
router.post("/categories", validate({ body: createCategorySchema }), controller.createCategory);
router.put("/categories/:id", validate({ body: updateCategorySchema }), controller.updateCategory);
router.delete("/categories/:id", controller.deleteCategory);
router.get("/categories", controller.getCategories);

// --- Product Routes ---
router.post("/products", validate({ body: createProductSchema }), controller.createProduct);
router.put("/products/:id", validate({ body: updateProductSchema }), controller.updateProduct);
router.delete("/products/:id", controller.deleteProduct);
router.get("/products", controller.getProducts);

// --- Collection Routes ---
router.post("/collections", validate({ body: createCollectionSchema }), controller.createCollection);
router.put("/collections/:id", validate({ body: updateCollectionSchema }), controller.updateCollection);
router.delete("/collections/:id", controller.deleteCollection);
router.get("/collections", controller.getCollections);

export default router;

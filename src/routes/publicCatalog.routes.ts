import { Router } from "express";
import { PublicCatalogController } from "../controllers/publicCatalog.controller";

const router = Router();
const controller = new PublicCatalogController();

// --- Product Public Routes ---
router.get("/products", controller.getProducts);
router.get("/products/:slug", controller.getProductBySlug);

// --- Category Public Routes ---
router.get("/categories", controller.getCategories);
router.get("/categories/:slug", controller.getCategoryBySlug);

// --- Collection Public Routes ---
router.get("/collections", controller.getCollections);
router.get("/collections/:slug", controller.getCollectionBySlug);

export default router;

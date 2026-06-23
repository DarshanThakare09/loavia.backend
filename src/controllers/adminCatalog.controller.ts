import { Request, Response } from "express";
import { CategoryService } from "../services/category.service";
import { ProductService } from "../services/product.service";
import { CollectionService } from "../services/collection.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const categoryService = new CategoryService();
const productService = new ProductService();
const collectionService = new CollectionService();

export class AdminCatalogController {
  // --- Category Handlers ---
  createCategory = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const category = await categoryService.createCategory(req.body, actorId, req.ipAddress);
    sendSuccess(res, category, "Category created successfully", 201);
  });

  updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const { id } = req.params;
    const category = await categoryService.updateCategory(id, req.body, actorId, req.ipAddress);
    sendSuccess(res, category, "Category updated successfully");
  });

  deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const { id } = req.params;
    const category = await categoryService.deleteCategory(id, actorId, req.ipAddress);
    sendSuccess(res, category, "Category deleted successfully");
  });

  getCategories = asyncHandler(async (req: Request, res: Response) => {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;

    const result = await categoryService.getCategories({ isActive }, page, limit);
    sendSuccess(res, result.data, "Categories retrieved successfully", 200);
  });

  // --- Product Handlers ---
  createProduct = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const product = await productService.createProduct(req.body, actorId, req.ipAddress);
    sendSuccess(res, product, "Product created successfully", 201);
  });

  updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const { id } = req.params;
    const product = await productService.updateProduct(id, req.body, actorId, req.ipAddress);
    sendSuccess(res, product, "Product updated successfully");
  });

  deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const { id } = req.params;
    const product = await productService.deleteProduct(id, actorId, req.ipAddress);
    sendSuccess(res, product, "Product deleted successfully");
  });

  getProducts = asyncHandler(async (req: Request, res: Response) => {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    
    // Admin gets all statuses (DRAFT, PUBLISHED, ARCHIVED)
    const filters = {
      status: req.query.status as any,
      search: req.query.search as string,
      categoryId: req.query.categoryId as string,
      isFeatured: req.query.isFeatured !== undefined ? req.query.isFeatured === "true" : undefined,
    };

    const result = await productService.getProducts(filters, page, limit);
    sendSuccess(res, result.data, "Products retrieved successfully", 200);
  });

  // --- Collection Handlers ---
  createCollection = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const collection = await collectionService.createCollection(req.body, actorId, req.ipAddress);
    sendSuccess(res, collection, "Collection created successfully", 201);
  });

  updateCollection = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const { id } = req.params;
    const collection = await collectionService.updateCollection(id, req.body, actorId, req.ipAddress);
    sendSuccess(res, collection, "Collection updated successfully");
  });

  deleteCollection = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const { id } = req.params;
    const collection = await collectionService.deleteCollection(id, actorId, req.ipAddress);
    sendSuccess(res, collection, "Collection deleted successfully");
  });

  getCollections = asyncHandler(async (req: Request, res: Response) => {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;

    const result = await collectionService.getCollections({ isActive }, page, limit);
    sendSuccess(res, result.data, "Collections retrieved successfully", 200);
  });
}

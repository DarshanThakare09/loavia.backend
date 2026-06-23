import { Request, Response } from "express";
import { CategoryService } from "../services/category.service";
import { ProductService } from "../services/product.service";
import { CollectionService } from "../services/collection.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ProductStatus } from "@prisma/client";
import { ProductSortOption } from "../types/catalog.types";

const categoryService = new CategoryService();
const productService = new ProductService();
const collectionService = new CollectionService();

export class PublicCatalogController {
  // --- Product Handlers ---
  getProducts = asyncHandler(async (req: Request, res: Response) => {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    // Parse filters
    const filters = {
      search: req.query.search as string,
      categoryId: req.query.categoryId as string,
      categorySlug: req.query.categorySlug as string,
      collectionId: req.query.collectionId as string,
      collectionSlug: req.query.collectionSlug as string,
      tagSlug: req.query.tagSlug as string,
      isFeatured: req.query.isFeatured !== undefined ? req.query.isFeatured === "true" : undefined,
      isBestSeller: req.query.isBestSeller !== undefined ? req.query.isBestSeller === "true" : undefined,
      isNewArrival: req.query.isNewArrival !== undefined ? req.query.isNewArrival === "true" : undefined,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      // Public catalog is strictly locked to PUBLISHED status
      status: ProductStatus.PUBLISHED,
      sortBy: req.query.sortBy as ProductSortOption,
    };

    const result = await productService.getProducts(filters, page, limit);

    // Format envelope to match pagination DTO requirements
    res.status(200).json({
      success: true,
      message: "Products retrieved successfully",
      data: result.data,
      pagination: result.pagination,
      filters: result.filters,
    });
  });

  getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const product = await productService.getProductBySlug(slug);

    // Enforce that draft/archived products are hidden from public lookup
    if (product.status !== ProductStatus.PUBLISHED) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    sendSuccess(res, product, "Product retrieved successfully");
  });

  // --- Category Handlers ---
  getCategories = asyncHandler(async (req: Request, res: Response) => {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const result = await categoryService.getCategories({ isActive: true }, page, limit);
    sendSuccess(res, result.data, "Categories retrieved successfully");
  });

  getCategoryBySlug = asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const category = await categoryService.getCategoryBySlug(slug);

    if (!category.isActive) {
      res.status(404).json({
        success: false,
        message: "Category not found",
      });
      return;
    }

    sendSuccess(res, category, "Category retrieved successfully");
  });

  // --- Collection Handlers ---
  getCollections = asyncHandler(async (req: Request, res: Response) => {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const result = await collectionService.getCollections({ isActive: true }, page, limit);
    sendSuccess(res, result.data, "Collections retrieved successfully");
  });

  getCollectionBySlug = asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const collection = await collectionService.getCollectionBySlug(slug);

    if (!collection.isActive) {
      res.status(404).json({
        success: false,
        message: "Collection not found",
      });
      return;
    }

    sendSuccess(res, collection, "Collection retrieved successfully");
  });
}

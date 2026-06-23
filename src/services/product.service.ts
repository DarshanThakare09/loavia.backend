import { ProductRepository } from "../repositories/product.repository";
import { generateUniqueSlug } from "../utils/generateUniqueSlug";
import { NotFoundError } from "../errors/NotFoundError";
import { BadRequestError } from "../errors/BadRequestError";
import { ProductFilterInput } from "../types/catalog.types";
import { buildPagination, calculateMeta } from "../utils/pagination";
import { prisma } from "../config/prisma";
import { Product, ProductStatus } from "@prisma/client";
import { resolveAuditUser } from "../utils/audit";

const productRepository = new ProductRepository();

export class ProductService {
  async createProduct(
    data: {
      categoryId: string;
      name: string;
      slug?: string;
      shortDescription?: string | null;
      description: string;
      ingredients: string;
      calories?: string | null;
      inStock?: boolean;
      sku: string;
      status?: ProductStatus;
      isFeatured?: boolean;
      isBestSeller?: boolean;
      isNewArrival?: boolean;
      featuredOrder?: number | null;
      sortOrder?: number;
      metaTitle?: string | null;
      metaDescription?: string | null;
      ogImage?: string | null;
      canonicalUrl?: string | null;
      images?: Array<{
        url: string;
        altText?: string | null;
        sortOrder?: number;
        isPrimary?: boolean;
        fileSize?: number | null;
        mimeType?: string | null;
      }>;
      variants: Array<{
        name: string;
        sku: string;
        price: number;
        discountPrice?: number | null;
        stockQuantity?: number;
        weight?: number | null;
        isDefault?: boolean;
        displayLabel?: string | null;
      }>;
      tagIds?: string[];
      collectionIds?: string[];
    },
    actorId: string,
    ipAddress?: string | null
  ): Promise<Product> {
    // Run all creations inside a strict transaction block
    return prisma.$transaction(async (tx) => {
      // 1. Validate Category exists
      const category = await tx.category.findUnique({
        where: { id: data.categoryId },
      });
      if (!category || category.isDeleted) {
        throw new NotFoundError("Category not found");
      }

      // 2. Validate SKU uniqueness
      const skuExists = await tx.product.findFirst({
        where: { sku: data.sku, isDeleted: false },
      });
      if (skuExists) {
        throw new BadRequestError(`Product SKU '${data.sku}' is already registered`);
      }

      // 3. Generate unique slug
      const slug = data.slug || (await generateUniqueSlug(data.name, async (s) => {
        const exists = await tx.product.findFirst({ where: { slug: s, isDeleted: false } });
        return !!exists;
      }));

      // Calculate lowest pricing
      let basePrice = 0;
      let comparePrice: number | null = null;
      if (data.variants.length > 0) {
        let minPrice = Infinity;
        let lowestCompare = Infinity;
        for (const v of data.variants) {
          if (v.price < minPrice) {
            minPrice = v.price;
          }
          if (v.discountPrice !== undefined && v.discountPrice !== null) {
            if (v.discountPrice < lowestCompare) {
              lowestCompare = v.discountPrice;
            }
          }
        }
        basePrice = minPrice;
        if (lowestCompare !== Infinity) {
          comparePrice = lowestCompare;
        }
      }

      // 4. Create base Product
      const product = await tx.product.create({
        data: {
          categoryId: data.categoryId,
          name: data.name,
          slug,
          shortDescription: data.shortDescription,
          description: data.description,
          ingredients: data.ingredients,
          calories: data.calories,
          inStock: data.inStock ?? true,
          basePrice,
          comparePrice,
          sku: data.sku,
          status: data.status || ProductStatus.DRAFT,
          isFeatured: data.isFeatured ?? false,
          isBestSeller: data.isBestSeller ?? false,
          isNewArrival: data.isNewArrival ?? false,
          featuredOrder: data.featuredOrder,
          sortOrder: data.sortOrder ?? 0,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          ogImage: data.ogImage,
          canonicalUrl: data.canonicalUrl,
          tags: data.tagIds ? { connect: data.tagIds.map((id) => ({ id })) } : undefined,
          collections: data.collectionIds ? { connect: data.collectionIds.map((id) => ({ id })) } : undefined,
        },
      });

      // 5. Create nested variants & inventories
      for (const v of data.variants) {
        // Validate variant SKU uniqueness
        const variantSkuExists = await tx.productVariant.findFirst({
          where: { sku: v.sku, isDeleted: false },
        });
        if (variantSkuExists) {
          throw new BadRequestError(`Variant SKU '${v.sku}' is already registered`);
        }

        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            name: v.name,
            sku: v.sku,
            price: v.price,
            discountPrice: v.discountPrice,
            stockQuantity: v.stockQuantity ?? 0,
            weight: v.weight,
            isDefault: v.isDefault ?? false,
            displayLabel: v.displayLabel,
          },
        });

        // Authoritative inventory record
        await tx.inventory.create({
          data: {
            variantId: variant.id,
            availableQty: v.stockQuantity ?? 0,
            reservedQty: 0,
            lowStockThreshold: 10,
            status: (v.stockQuantity ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
          },
        });
      }

      // 6. Create images
      if (data.images && data.images.length > 0) {
        await tx.productImage.createMany({
          data: data.images.map((img) => ({
            productId: product.id,
            url: img.url,
            altText: img.altText,
            sortOrder: img.sortOrder ?? 0,
            isPrimary: img.isPrimary ?? false,
            fileSize: img.fileSize,
            mimeType: img.mimeType,
          })),
        });
      }

      // 7. Audit Log
      const auditUser = resolveAuditUser(actorId);
      await tx.auditLog.create({
        data: {
          userId: auditUser.userId,
          action: "PRODUCT_CREATED",
          entity: "Product",
          entityId: product.id,
          details: { name: product.name, sku: product.sku, basePrice, ...auditUser.detailsExtra },
          ipAddress,
        },
      });

      return product;
    });
  }

  async updateProduct(
    id: string,
    data: {
      categoryId?: string;
      name?: string;
      slug?: string;
      shortDescription?: string | null;
      description?: string;
      ingredients?: string;
      calories?: string | null;
      inStock?: boolean;
      sku?: string;
      status?: ProductStatus;
      isFeatured?: boolean;
      isBestSeller?: boolean;
      isNewArrival?: boolean;
      featuredOrder?: number | null;
      sortOrder?: number;
      metaTitle?: string | null;
      metaDescription?: string | null;
      ogImage?: string | null;
      canonicalUrl?: string | null;
      images?: Array<{
        url: string;
        altText?: string | null;
        sortOrder?: number;
        isPrimary?: boolean;
        fileSize?: number | null;
        mimeType?: string | null;
      }>;
      variants?: Array<{
        name: string;
        sku: string;
        price: number;
        discountPrice?: number | null;
        stockQuantity?: number;
        weight?: number | null;
        isDefault?: boolean;
        displayLabel?: string | null;
      }>;
      tagIds?: string[];
      collectionIds?: string[];
    },
    actorId: string,
    ipAddress?: string | null
  ): Promise<Product> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id, isDeleted: false },
        include: { variants: true },
      });
      if (!existing) {
        throw new NotFoundError("Product not found");
      }

      // 1. Validate Category if changed
      if (data.categoryId && data.categoryId !== existing.categoryId) {
        const category = await tx.category.findUnique({
          where: { id: data.categoryId },
        });
        if (!category || category.isDeleted) {
          throw new NotFoundError("Category not found");
        }
      }

      // 2. Validate SKU uniqueness if changed
      if (data.sku && data.sku !== existing.sku) {
        const skuExists = await tx.product.findFirst({
          where: { sku: data.sku, isDeleted: false, id: { not: id } },
        });
        if (skuExists) {
          throw new BadRequestError(`Product SKU '${data.sku}' is already registered`);
        }
      }

      // 3. Generate unique slug if changed
      let slug = existing.slug;
      if (data.name && !data.slug && data.name !== existing.name) {
        slug = await generateUniqueSlug(data.name, async (s) => {
          const exists = await tx.product.findFirst({ where: { slug: s, isDeleted: false } });
          return !!exists && exists.id !== id;
        });
      } else if (data.slug) {
        slug = data.slug;
      }

      // 4. Synchronize Variants
      if (data.variants) {
        const incomingSkus = data.variants.map((v) => v.sku);

        // Soft-delete variants not present in update
        await tx.productVariant.updateMany({
          where: {
            productId: id,
            sku: { notIn: incomingSkus },
            isDeleted: false,
          },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
          },
        });

        // Insert / Update active variants
        for (const v of data.variants) {
          const existingVariant = await tx.productVariant.findFirst({
            where: { productId: id, sku: v.sku },
          });

          if (existingVariant) {
            const updated = await tx.productVariant.update({
              where: { id: existingVariant.id },
              data: {
                name: v.name,
                price: v.price,
                discountPrice: v.discountPrice,
                stockQuantity: v.stockQuantity ?? existingVariant.stockQuantity,
                weight: v.weight,
                isDefault: v.isDefault ?? existingVariant.isDefault,
                displayLabel: v.displayLabel,
                isDeleted: false,
                deletedAt: null,
              },
            });

            // Sync Inventory available quantity
            await tx.inventory.upsert({
              where: { variantId: updated.id },
              create: {
                variantId: updated.id,
                availableQty: v.stockQuantity ?? 0,
                status: (v.stockQuantity ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
              },
              update: {
                availableQty: v.stockQuantity ?? 0,
                status: (v.stockQuantity ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
              },
            });
          } else {
            // Check variant SKU uniqueness across all active variants
            const variantSkuExists = await tx.productVariant.findFirst({
              where: { sku: v.sku, isDeleted: false },
            });
            if (variantSkuExists) {
              throw new BadRequestError(`Variant SKU '${v.sku}' is already registered`);
            }

            const newVariant = await tx.productVariant.create({
              data: {
                productId: id,
                name: v.name,
                sku: v.sku,
                price: v.price,
                discountPrice: v.discountPrice,
                stockQuantity: v.stockQuantity ?? 0,
                weight: v.weight,
                isDefault: v.isDefault ?? false,
                displayLabel: v.displayLabel,
              },
            });

            await tx.inventory.create({
              data: {
                variantId: newVariant.id,
                availableQty: v.stockQuantity ?? 0,
                status: (v.stockQuantity ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
              },
            });
          }
        }
      }

      // Calculate lowest pricing post-synchronization
      const activeVariants = await tx.productVariant.findMany({
        where: { productId: id, isDeleted: false },
      });

      let basePrice = existing.basePrice;
      let comparePrice = existing.comparePrice;

      if (activeVariants.length > 0) {
        let minPrice = Infinity;
        let lowestCompare = Infinity;
        for (const v of activeVariants) {
          if (v.price < minPrice) {
            minPrice = v.price;
          }
          if (v.discountPrice !== null && v.discountPrice !== undefined) {
            if (v.discountPrice < lowestCompare) {
              lowestCompare = v.discountPrice;
            }
          }
        }
        basePrice = minPrice;
        comparePrice = lowestCompare !== Infinity ? lowestCompare : null;
      }

      // 5. Synchronize Images
      if (data.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (data.images.length > 0) {
          await tx.productImage.createMany({
            data: data.images.map((img) => ({
              productId: id,
              url: img.url,
              altText: img.altText,
              sortOrder: img.sortOrder ?? 0,
              isPrimary: img.isPrimary ?? false,
              fileSize: img.fileSize,
              mimeType: img.mimeType,
            })),
          });
        }
      }

      // 6. Update core fields and relations
      const product = await tx.product.update({
        where: { id },
        data: {
          name: data.name,
          slug,
          shortDescription: data.shortDescription,
          description: data.description,
          ingredients: data.ingredients,
          calories: data.calories,
          inStock: data.inStock,
          sku: data.sku,
          status: data.status,
          isFeatured: data.isFeatured,
          isBestSeller: data.isBestSeller,
          isNewArrival: data.isNewArrival,
          featuredOrder: data.featuredOrder,
          sortOrder: data.sortOrder,
          basePrice,
          comparePrice,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          ogImage: data.ogImage,
          canonicalUrl: data.canonicalUrl,
          category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
          tags: data.tagIds ? {
            set: data.tagIds.map((tid) => ({ id: tid })),
          } : undefined,
          collections: data.collectionIds ? {
            set: data.collectionIds.map((cid) => ({ id: cid })),
          } : undefined,
        },
      });

      // 8. Audit Log
      const auditUser = resolveAuditUser(actorId);
      await tx.auditLog.create({
        data: {
          userId: auditUser.userId,
          action: "PRODUCT_UPDATED",
          entity: "Product",
          entityId: product.id,
          details: { changedFields: Object.keys(data), ...auditUser.detailsExtra },
          ipAddress,
        },
      });

      return product;
    });
  }

  async deleteProduct(id: string, actorId: string, ipAddress?: string | null): Promise<Product> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id, isDeleted: false },
      });
      if (!existing) {
        throw new NotFoundError("Product not found");
      }

      // Soft delete Product
      const product = await tx.product.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      // Soft delete all child variants
      await tx.productVariant.updateMany({
        where: { productId: id, isDeleted: false },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      // Audit Log
      const auditUser = resolveAuditUser(actorId);
      await tx.auditLog.create({
        data: {
          userId: auditUser.userId,
          action: "PRODUCT_DELETED",
          entity: "Product",
          entityId: id,
          details: { name: existing.name, ...auditUser.detailsExtra },
          ipAddress,
        },
      });

      return product;
    });
  }

  async getProductById(id: string): Promise<Product> {
    const product = await productRepository.findById(id);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async getProductBySlug(slug: string): Promise<Product> {
    const product = await productRepository.findBySlug(slug);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async getProducts(filters: ProductFilterInput, pageInput?: number, limitInput?: number) {
    const { page, limit, skip } = buildPagination(pageInput, limitInput);
    const { data, total } = await productRepository.findWithFilters(filters, skip, limit);
    const pagination = calculateMeta(total, page, limit);

    // Compute price range filters dynamically if requested
    let priceRange = { minPrice: 0, maxPrice: 0 };
    if (data.length > 0) {
      let min = Infinity;
      let max = -Infinity;
      for (const p of data) {
        if (p.basePrice < min) min = p.basePrice;
        if (p.basePrice > max) max = p.basePrice;
      }
      priceRange = { minPrice: min === Infinity ? 0 : min, maxPrice: max === -Infinity ? 0 : max };
    }

    return {
      data,
      pagination,
      filters: {
        priceRange,
      },
    };
  }

  // Prepares the review ratings database update
  async updateProductRating(id: string, averageRating: number, reviewCount: number): Promise<Product> {
    return productRepository.updateProductRating(id, averageRating, reviewCount);
  }

  // Atomically decrement stock quantity and synchronize variant stockQuantity cache mirror
  async decrementStock(
    variantId: string,
    quantity: number,
    actorId: string,
    ipAddress?: string | null
  ): Promise<void> {
    if (quantity <= 0) {
      throw new BadRequestError("Quantity to decrement must be positive");
    }

    await prisma.$transaction(async (tx) => {
      try {
        const updatedInventory = await tx.inventory.update({
          where: { variantId },
          data: {
            availableQty: {
              decrement: quantity,
            },
          },
        });

        // Synchronize stock mirror in ProductVariant
        await tx.productVariant.update({
          where: { id: variantId },
          data: {
            stockQuantity: updatedInventory.availableQty,
          },
        });

        // Update status if out of stock
        if (updatedInventory.availableQty === 0) {
          await tx.inventory.update({
            where: { variantId },
            data: { status: "OUT_OF_STOCK" },
          });
        }

        // Audit Log
        const auditUser = resolveAuditUser(actorId);
        await tx.auditLog.create({
          data: {
            userId: auditUser.userId,
            action: "INVENTORY_DECREMENTED",
            entity: "Inventory",
            entityId: updatedInventory.id,
            details: { variantId, quantity, remainingQty: updatedInventory.availableQty, ...auditUser.detailsExtra },
            ipAddress,
          },
        });
      } catch (error: any) {
        // If DB CHECK constraint is violated
        if (error.message?.includes("chk_available_qty_positive") || error.code === "P2009" || error.code === "P2020") {
          throw new BadRequestError("Insufficient stock available");
        }
        throw error;
      }
    });
  }
}

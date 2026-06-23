import { WishlistRepository } from "../repositories/wishlist.repository";
import { ProductRepository } from "../repositories/product.repository";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { NotFoundError } from "../errors/NotFoundError";
import { BadRequestError } from "../errors/BadRequestError";
import { ProductStatus } from "@prisma/client";

export class WishlistService {
  private wishlistRepository = new WishlistRepository();
  private productRepository = new ProductRepository();
  private auditLogRepository = new AuditLogRepository();

  // Get or create wishlist for user
  async getOrCreateWishlist(userId: string) {
    let wishlist = await this.wishlistRepository.findWishlistByUserId(userId);
    if (!wishlist) {
      await this.wishlistRepository.createWishlist(userId);
      // Fetch again to load empty items relation
      wishlist = await this.wishlistRepository.findWishlistByUserId(userId);
    }
    return wishlist;
  }

  // Add item to wishlist
  async addToWishlist(userId: string, productId: string, ipAddress?: string | null) {
    // 1. Verify product exists and is active/published
    const product = await this.productRepository.findById(productId);
    if (!product || product.isDeleted) {
      throw new NotFoundError("Product not found");
    }

    if (product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestError("Cannot add archived or unpublished products to wishlist");
    }

    // 2. Get or create user's wishlist
    const wishlist = await this.getOrCreateWishlist(userId);

    // 3. Duplicate protection: Check if product already in wishlist
    const existingItem = wishlist?.items.find((item) => item.productId === productId);
    if (existingItem) {
      return existingItem;
    }

    // 4. Add product to wishlist
    const wishlistItem = await this.wishlistRepository.addWishlistItem(wishlist!.id, productId);

    // 5. Audit Logging
    await this.auditLogRepository.create({
      userId,
      action: "WISHLIST_ITEM_ADDED",
      entity: "WishlistItem",
      entityId: wishlistItem.id,
      details: { productId, productName: product.name },
      ipAddress,
    });

    return wishlistItem;
  }

  // Remove item from wishlist
  async removeFromWishlist(userId: string, productId: string, ipAddress?: string | null) {
    const wishlist = await this.wishlistRepository.findWishlistByUserId(userId);
    if (!wishlist) {
      throw new NotFoundError("Wishlist not found");
    }

    const existingItem = wishlist.items.find((item) => item.productId === productId);
    if (!existingItem) {
      throw new NotFoundError("Product is not in the wishlist");
    }

    const removedItem = await this.wishlistRepository.removeWishlistItem(wishlist.id, productId);

    // Audit Logging
    await this.auditLogRepository.create({
      userId,
      action: "WISHLIST_ITEM_REMOVED",
      entity: "WishlistItem",
      entityId: removedItem.id,
      details: { productId },
      ipAddress,
    });

    return { success: true };
  }

  // Get wishlist directly
  async getWishlist(userId: string) {
    return this.getOrCreateWishlist(userId);
  }
}

import { prisma } from "../config/prisma";
import { Wishlist, WishlistItem } from "@prisma/client";

export class WishlistRepository {
  // Find wishlist by user ID
  async findWishlistByUserId(userId: string) {
    return prisma.wishlist.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                variants: {
                  where: { isDeleted: false },
                  orderBy: { price: "asc" },
                },
              },
            },
          },
        },
      },
    });
  }

  // Create a new empty wishlist for user
  async createWishlist(userId: string): Promise<Wishlist> {
    return prisma.wishlist.create({
      data: { userId },
    });
  }

  // Add item to wishlist
  async addWishlistItem(wishlistId: string, productId: string): Promise<WishlistItem> {
    return prisma.wishlistItem.create({
      data: {
        wishlistId,
        productId,
      },
    });
  }

  // Remove item from wishlist
  async removeWishlistItem(wishlistId: string, productId: string): Promise<WishlistItem> {
    return prisma.wishlistItem.delete({
      where: {
        wishlistId_productId: {
          wishlistId,
          productId,
        },
      },
    });
  }

  // Get wishlist items directly
  async getWishlistItems(wishlistId: string) {
    return prisma.wishlistItem.findMany({
      where: { wishlistId },
      include: {
        product: {
          include: {
            variants: {
              where: { isDeleted: false },
              orderBy: { price: "asc" },
            },
          },
        },
      },
    });
  }
}

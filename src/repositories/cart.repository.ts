import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { Cart, CartItem } from "@prisma/client";

// In-memory fallback for guest carts when Redis is offline
const memoryCart: Record<string, string> = {};

export interface GuestCartItemInput {
  variantId: string;
  quantity: number;
  isCustomBox?: boolean;
  customBoxSelections?: any;
}

export class CartRepository {
  // DB: Find cart by user ID
  async findCartByUserId(userId: string) {
    return prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: true,
            variant: {
              include: {
                inventory: true,
              },
            },
          },
        },
      },
    });
  }

  // DB: Create cart for user
  async createCart(userId: string): Promise<Cart> {
    return prisma.cart.create({
      data: { userId },
    });
  }

  // DB: Get cart by its ID
  async getCartWithItems(cartId: string) {
    return prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          include: {
            product: true,
            variant: {
              include: {
                inventory: true,
              },
            },
          },
        },
      },
    });
  }

  // DB: Find individual item in cart
  async findCartItemByVariant(cartId: string, variantId: string): Promise<CartItem | null> {
    return prisma.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId,
          variantId,
        },
      },
    });
  }

  // DB: Add item to user cart
  async addItem(
    cartId: string,
    productId: string,
    variantId: string,
    quantity: number,
    isCustomBox: boolean,
    customBoxSelections: any
  ): Promise<CartItem> {
    return prisma.cartItem.create({
      data: {
        cartId,
        productId,
        variantId,
        quantity,
        isCustomBox,
        customBoxSelections: customBoxSelections || undefined,
      },
    });
  }

  // DB: Update item quantity
  async updateItem(cartItemId: string, quantity: number): Promise<CartItem> {
    return prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });
  }

  // DB: Remove item from user cart
  async removeItem(cartItemId: string): Promise<CartItem> {
    return prisma.cartItem.delete({
      where: { id: cartItemId },
    });
  }

  // DB: Clear all items in user cart
  async clearCart(cartId: string): Promise<any> {
    return prisma.cartItem.deleteMany({
      where: { cartId },
    });
  }

  // REDIS: Find guest cart by session ID and hydrate it with DB product details
  async findCartBySessionId(sessionId: string) {
    const key = `guest_cart:${sessionId}`;
    let rawData: string | null = null;
    
    try {
      if (redis.isOpen) {
        rawData = await redis.get(key);
      } else {
        rawData = memoryCart[key] || null;
      }
    } catch (err) {
      rawData = memoryCart[key] || null;
    }
    
    if (!rawData) {
      return {
        id: sessionId,
        userId: null,
        items: [],
      };
    }

    const rawItems: GuestCartItemInput[] = JSON.parse(rawData);
    if (rawItems.length === 0) {
      return {
        id: sessionId,
        userId: null,
        items: [],
      };
    }

    // Hydrate raw items with DB product/variant/inventory data
    const variantIds = rawItems.map((item) => item.variantId);
    
    const dbVariants = await prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
        isDeleted: false,
      },
      include: {
        product: true,
        inventory: true,
      },
    });

    const hydratedItems = rawItems.map((rawItem) => {
      const dbVariant = dbVariants.find((v) => v.id === rawItem.variantId);
      if (!dbVariant) return null;

      return {
        id: `guest_item_${rawItem.variantId}`,
        cartId: sessionId,
        productId: dbVariant.productId,
        variantId: rawItem.variantId,
        quantity: rawItem.quantity,
        isCustomBox: rawItem.isCustomBox || false,
        customBoxSelections: rawItem.customBoxSelections || null,
        product: dbVariant.product,
        variant: {
          id: dbVariant.id,
          productId: dbVariant.productId,
          name: dbVariant.name,
          sku: dbVariant.sku,
          price: dbVariant.price,
          discountPrice: dbVariant.discountPrice,
          stockQuantity: dbVariant.stockQuantity,
          weight: dbVariant.weight,
          isDefault: dbVariant.isDefault,
          displayLabel: dbVariant.displayLabel,
          createdAt: dbVariant.createdAt,
          updatedAt: dbVariant.updatedAt,
          inventory: dbVariant.inventory,
        },
      };
    }).filter(Boolean);

    return {
      id: sessionId,
      userId: null,
      items: hydratedItems,
    };
  }

  // REDIS: Save guest cart
  async saveGuestCart(sessionId: string, items: GuestCartItemInput[]): Promise<void> {
    const key = `guest_cart:${sessionId}`;
    const value = JSON.stringify(items);
    try {
      if (redis.isOpen) {
        // Store with 30 days TTL (2592000 seconds)
        await redis.setEx(key, 2592000, value);
      } else {
        memoryCart[key] = value;
      }
    } catch (err) {
      memoryCart[key] = value;
    }
  }

  // REDIS: Clear guest cart
  async clearGuestCart(sessionId: string): Promise<void> {
    const key = `guest_cart:${sessionId}`;
    try {
      if (redis.isOpen) {
        await redis.del(key);
      } else {
        delete memoryCart[key];
      }
    } catch (err) {
      delete memoryCart[key];
    }
  }
}

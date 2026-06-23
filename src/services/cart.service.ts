import { CartRepository } from "../repositories/cart.repository";
import { ProductVariantRepository } from "../repositories/variant.repository";
import { ProductRepository } from "../repositories/product.repository";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { NotFoundError } from "../errors/NotFoundError";
import { BadRequestError } from "../errors/BadRequestError";
import { ProductStatus } from "@prisma/client";

export class CartService {
  private cartRepository = new CartRepository();
  private productVariantRepository = new ProductVariantRepository();
  private productRepository = new ProductRepository();
  private auditLogRepository = new AuditLogRepository();

  // Get or create database cart for authenticated user
  async getOrCreateCart(userId: string) {
    let cart = await this.cartRepository.findCartByUserId(userId);
    if (!cart) {
      await this.cartRepository.createCart(userId);
      cart = await this.cartRepository.findCartByUserId(userId);
    }
    return cart;
  }

  // Generic capacity extractor for BYOB
  private extractCapacity(name: string, sku: string): number | null {
    const nameMatch = name.match(/\b\d+\b/);
    if (nameMatch) {
      const capacity = parseInt(nameMatch[0], 10);
      if (capacity > 0) return capacity;
    }
    const skuMatch = sku.match(/\d+/);
    if (skuMatch) {
      const capacity = parseInt(skuMatch[0], 10);
      if (capacity > 0) return capacity;
    }
    return null;
  }

  // Validate item inventory and BYOB slots
  private async validateItemStockAndBYOB(
    variantId: string,
    quantity: number,
    isCustomBox: boolean,
    customBoxSelections?: any[]
  ): Promise<{ variant: any; capacity: number | null }> {
    // 1. Fetch variant details including product and inventory
    const variant = await this.productVariantRepository.findById(variantId) as any;
    if (!variant || variant.isDeleted) {
      throw new NotFoundError("Product variant not found");
    }

    const product = await this.productRepository.findById(variant.productId);
    if (!product || product.isDeleted || product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestError("Product is currently unavailable");
    }

    // 2. Validate standard product stock
    if (!variant.inventory) {
      throw new BadRequestError("Inventory configuration missing for variant");
    }

    if (variant.inventory.availableQty < quantity) {
      throw new BadRequestError(
        `Insufficient inventory. Requested ${quantity}, but only ${variant.inventory.availableQty} available.`
      );
    }

    // 3. Handle BYOB Custom Box validations
    let parsedCapacity: number | null = null;
    if (isCustomBox && customBoxSelections && customBoxSelections.length > 0) {
      parsedCapacity = this.extractCapacity(variant.name, variant.sku);
      if (parsedCapacity !== null) {
        // Validate slot counts
        const totalSelectionsCount = customBoxSelections.reduce((sum, item) => sum + item.quantity, 0);
        if (totalSelectionsCount !== parsedCapacity) {
          throw new BadRequestError(
            `Custom box selections quantity sum must exactly equal box capacity. Expected ${parsedCapacity}, got ${totalSelectionsCount}.`
          );
        }

        // Validate individual selection variants and their inventories
        for (const selection of customBoxSelections) {
          const selVariant = await this.productVariantRepository.findById(selection.variantId) as any;
          if (!selVariant || selVariant.isDeleted) {
            throw new NotFoundError(`Selection variant ${selection.variantId} not found`);
          }

          const selProduct = await this.productRepository.findById(selVariant.productId);
          if (!selProduct || selProduct.isDeleted || selProduct.status !== ProductStatus.PUBLISHED) {
            throw new BadRequestError(`Selection product ${selProduct?.name} is unavailable`);
          }

          if (!selVariant.inventory) {
            throw new BadRequestError(`Inventory missing for selection variant ${selVariant.name}`);
          }

          const requiredQty = selection.quantity * quantity;
          if (selVariant.inventory.availableQty < requiredQty) {
            throw new BadRequestError(
              `Insufficient inventory for selection ${selVariant.name}. Required ${requiredQty}, but only ${selVariant.inventory.availableQty} available.`
            );
          }
        }
      }
    }

    return { variant, capacity: parsedCapacity };
  }

  // Get Cart (User DB cart or Guest Redis cart)
  async getCart(userId?: string, sessionId?: string) {
    if (userId) {
      return this.getOrCreateCart(userId);
    }
    if (sessionId) {
      return this.cartRepository.findCartBySessionId(sessionId);
    }
    throw new BadRequestError("Either userId or sessionId must be provided to get cart");
  }

  // Add Item to Cart (handles both User DB and Guest Redis)
  async addItemToCart(
    data: {
      variantId: string;
      quantity: number;
      isCustomBox: boolean;
      customBoxSelections?: any[];
    },
    userId?: string,
    sessionId?: string,
    ipAddress?: string | null
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestError("Quantity must be greater than zero");
    }

    // 1. Validate stock and BYOB slots
    const { variant } = await this.validateItemStockAndBYOB(
      data.variantId,
      data.quantity,
      data.isCustomBox,
      data.customBoxSelections
    );

    if (userId) {
      // User DB cart addition
      const cart = await this.getOrCreateCart(userId);

      // Check if variant already exists in DB cart
      const existingItem = await this.cartRepository.findCartItemByVariant(cart!.id, data.variantId);
      let cartItem;

      if (existingItem) {
        const newQty = existingItem.quantity + data.quantity;
        // Re-validate stock for the combined quantity
        await this.validateItemStockAndBYOB(
          data.variantId,
          newQty,
          data.isCustomBox,
          data.customBoxSelections
        );
        cartItem = await this.cartRepository.updateItem(existingItem.id, newQty);

        // Audit Log
        await this.auditLogRepository.create({
          userId,
          action: "CART_ITEM_UPDATED",
          entity: "CartItem",
          entityId: cartItem.id,
          details: { variantId: data.variantId, quantity: newQty },
          ipAddress,
        });
      } else {
        cartItem = await this.cartRepository.addItem(
          cart!.id,
          variant.productId,
          data.variantId,
          data.quantity,
          data.isCustomBox,
          data.customBoxSelections
        );

        // Audit Log
        await this.auditLogRepository.create({
          userId,
          action: "CART_ITEM_ADDED",
          entity: "CartItem",
          entityId: cartItem.id,
          details: { variantId: data.variantId, quantity: data.quantity },
          ipAddress,
        });
      }

      return this.getOrCreateCart(userId);
    } else if (sessionId) {
      // Guest Redis cart addition
      const guestCart = await this.cartRepository.findCartBySessionId(sessionId);
      const existingItem = guestCart.items.find((item: any) => item.variantId === data.variantId);

      if (existingItem) {
        const newQty = existingItem.quantity + data.quantity;
        // Re-validate stock for combined quantity
        await this.validateItemStockAndBYOB(
          data.variantId,
          newQty,
          data.isCustomBox,
          data.customBoxSelections
        );
        existingItem.quantity = newQty;
      } else {
        guestCart.items.push({
          variantId: data.variantId,
          quantity: data.quantity,
          isCustomBox: data.isCustomBox,
          customBoxSelections: data.customBoxSelections || null,
        } as any);
      }

      // Save raw inputs to Redis
      const redisPayload = guestCart.items.map((item: any) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        isCustomBox: item.isCustomBox,
        customBoxSelections: item.customBoxSelections,
      }));

      await this.cartRepository.saveGuestCart(sessionId, redisPayload);
      return this.cartRepository.findCartBySessionId(sessionId);
    }

    throw new BadRequestError("Either userId or sessionId must be provided");
  }

  // Update Cart Item (handles both User DB and Guest Redis)
  async updateCartItem(
    cartItemId: string,
    quantity: number,
    userId?: string,
    sessionId?: string,
    ipAddress?: string | null
  ) {
    if (quantity <= 0) {
      throw new BadRequestError("Quantity must be greater than zero");
    }

    if (userId) {
      // User DB cart update
      const cart = await this.getOrCreateCart(userId);
      const existingItem = cart!.items.find((item) => item.id === cartItemId);
      if (!existingItem) {
        throw new NotFoundError("Cart item not found in your cart");
      }

      // Validate stock for the new quantity
      await this.validateItemStockAndBYOB(
        existingItem.variantId,
        quantity,
        existingItem.isCustomBox,
        existingItem.customBoxSelections as any[]
      );

      const updatedItem = await this.cartRepository.updateItem(cartItemId, quantity);

      // Audit Log
      await this.auditLogRepository.create({
        userId,
        action: "CART_ITEM_UPDATED",
        entity: "CartItem",
        entityId: updatedItem.id,
        details: { variantId: existingItem.variantId, quantity },
        ipAddress,
      });

      return this.getOrCreateCart(userId);
    } else if (sessionId) {
      // Guest Redis cart update. For guests, cartItemId is mapped to `guest_item_${variantId}`
      const variantId = cartItemId.replace("guest_item_", "");
      const guestCart = await this.cartRepository.findCartBySessionId(sessionId);
      const existingItem = guestCart.items.find((item: any) => item.variantId === variantId);
      if (!existingItem) {
        throw new NotFoundError("Cart item not found in guest cart");
      }

      // Validate stock for the new quantity
      await this.validateItemStockAndBYOB(
        variantId,
        quantity,
        existingItem.isCustomBox,
        existingItem.customBoxSelections
      );

      existingItem.quantity = quantity;

      const redisPayload = guestCart.items.map((item: any) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        isCustomBox: item.isCustomBox,
        customBoxSelections: item.customBoxSelections,
      }));

      await this.cartRepository.saveGuestCart(sessionId, redisPayload);
      return this.cartRepository.findCartBySessionId(sessionId);
    }

    throw new BadRequestError("Either userId or sessionId must be provided");
  }

  // Remove Cart Item
  async removeCartItem(cartItemId: string, userId?: string, sessionId?: string, ipAddress?: string | null) {
    if (userId) {
      const cart = await this.getOrCreateCart(userId);
      const existingItem = cart!.items.find((item) => item.id === cartItemId);
      if (!existingItem) {
        throw new NotFoundError("Cart item not found in your cart");
      }

      await this.cartRepository.removeItem(cartItemId);

      // Audit Log
      await this.auditLogRepository.create({
        userId,
        action: "CART_ITEM_REMOVED",
        entity: "CartItem",
        entityId: cartItemId,
        details: { variantId: existingItem.variantId },
        ipAddress,
      });

      return this.getOrCreateCart(userId);
    } else if (sessionId) {
      const variantId = cartItemId.replace("guest_item_", "");
      const guestCart = await this.cartRepository.findCartBySessionId(sessionId);
      const filteredItems = guestCart.items.filter((item: any) => item.variantId !== variantId);

      const redisPayload = filteredItems.map((item: any) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        isCustomBox: item.isCustomBox,
        customBoxSelections: item.customBoxSelections,
      }));

      await this.cartRepository.saveGuestCart(sessionId, redisPayload);
      return this.cartRepository.findCartBySessionId(sessionId);
    }

    throw new BadRequestError("Either userId or sessionId must be provided");
  }

  // Clear Cart
  async clearCart(userId?: string, sessionId?: string) {
    if (userId) {
      const cart = await this.getOrCreateCart(userId);
      await this.cartRepository.clearCart(cart!.id);
      return this.getOrCreateCart(userId);
    } else if (sessionId) {
      await this.cartRepository.clearGuestCart(sessionId);
      return { id: sessionId, userId: null, items: [] };
    }
    throw new BadRequestError("Either userId or sessionId must be provided");
  }

  // Merge Guest Cart into User DB Cart
  async mergeGuestCart(
    userId: string,
    guestItems: Array<{
      variantId: string;
      quantity: number;
      isCustomBox: boolean;
      customBoxSelections?: any[];
    }>,
    ipAddress?: string | null
  ) {
    const cart = await this.getOrCreateCart(userId);
    const clampedItems: Array<{ variantId: string; originalQty: number; clampedQty: number }> = [];

    for (const guestItem of guestItems) {
      const dbItem = cart!.items.find((item) => item.variantId === guestItem.variantId);
      const combinedQty = dbItem ? dbItem.quantity + guestItem.quantity : guestItem.quantity;
      const isCustom = guestItem.isCustomBox || false;
      const customSelections = guestItem.customBoxSelections || [];

      // Calculate maximum possible quantity based on stock
      let maxPossible = combinedQty;

      try {
        const variant = await this.productVariantRepository.findById(guestItem.variantId) as any;
        if (variant && !variant.isDeleted) {
          const avail = variant.inventory?.availableQty ?? 0;
          let calculatedMax = avail;

          // Check custom box selection capacities
          if (isCustom && customSelections.length > 0) {
            const capacity = this.extractCapacity(variant.name, variant.sku);
            if (capacity !== null) {
              for (const selection of customSelections) {
                const selVariant = await this.productVariantRepository.findById(selection.variantId) as any;
                const selAvail = selVariant?.inventory?.availableQty ?? 0;
                const limitBySel = Math.floor(selAvail / selection.quantity);
                if (limitBySel < calculatedMax) {
                  calculatedMax = limitBySel;
                }
              }
            }
          }

          if (calculatedMax < combinedQty) {
            maxPossible = calculatedMax;
          }
        } else {
          maxPossible = 0;
        }
      } catch (err) {
        maxPossible = 0;
      }

      if (maxPossible < combinedQty) {
        clampedItems.push({
          variantId: guestItem.variantId,
          originalQty: combinedQty,
          clampedQty: maxPossible,
        });
      }

      if (dbItem) {
        if (maxPossible > 0) {
          await this.cartRepository.updateItem(dbItem.id, maxPossible);
        } else {
          await this.cartRepository.removeItem(dbItem.id);
        }
      } else {
        if (maxPossible > 0) {
          // Fetch product ID
          const variant = await this.productVariantRepository.findById(guestItem.variantId) as any;
          if (variant) {
            await this.cartRepository.addItem(
              cart!.id,
              variant.productId,
              guestItem.variantId,
              maxPossible,
              isCustom,
              customSelections
            );
          }
        }
      }
    }

    // Audit Logging
    await this.auditLogRepository.create({
      userId,
      action: "CART_MERGED",
      entity: "Cart",
      entityId: cart!.id,
      details: {
        mergedItemsCount: guestItems.length,
        clampedCount: clampedItems.length,
        clampedDetails: clampedItems,
      },
      ipAddress,
    });

    const updatedCart = await this.getOrCreateCart(userId);
    return {
      cart: updatedCart,
      clampedItems,
    };
  }
}

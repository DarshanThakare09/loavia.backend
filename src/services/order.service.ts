import { OrderRepository } from "../repositories/order.repository";
import { razorpay } from "../utils/razorpay";
import { env } from "../config/env";
import { CouponRepository } from "../repositories/coupon.repository";
import { CartRepository } from "../repositories/cart.repository";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { ShipmentService } from "./shipment.service";
import { InventoryService } from "./inventory.service";
import { prisma } from "../config/prisma";
import { NotFoundError } from "../errors/NotFoundError";
import { BadRequestError } from "../errors/BadRequestError";
import { Order, OrderStatus, ShipmentStatus, Coupon, UserRole } from "@prisma/client";
import { AdminService } from "./admin.service";

export class OrderService {
  private orderRepository = new OrderRepository();
  private couponRepository = new CouponRepository();
  private cartRepository = new CartRepository();
  private shipmentService = new ShipmentService();
  private inventoryService = new InventoryService();
  private auditLogRepository = new AuditLogRepository();

  // Validate coupon details
  async validateCoupon(code: string, subtotal: number): Promise<Coupon> {
    const coupon = await this.couponRepository.findByCode(code);
    if (!coupon) {
      throw new BadRequestError("Invalid or expired coupon code");
    }

    if (subtotal < coupon.minOrderValue) {
      const minValRs = (coupon.minOrderValue / 100).toFixed(2);
      throw new BadRequestError(`Minimum order value of ₹${minValRs} is required to apply this coupon`);
    }

    return coupon;
  }

  // Calculate checkout totals (in Paise)
  async calculateTotals(
    items: Array<{ price: number; quantity: number }>,
    couponCode?: string
  ): Promise<{
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    shippingFee: number;
    totalAmount: number;
    appliedCoupon?: Coupon;
  }> {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let discountAmount = 0;
    let appliedCoupon: Coupon | undefined;

    if (couponCode) {
      appliedCoupon = await this.validateCoupon(couponCode, subtotal);
      if (appliedCoupon.discountType === "PERCENTAGE") {
        discountAmount = Math.floor((subtotal * appliedCoupon.value) / 100);
        if (appliedCoupon.maxDiscount && discountAmount > appliedCoupon.maxDiscount) {
          discountAmount = appliedCoupon.maxDiscount;
        }
      } else {
        discountAmount = appliedCoupon.value;
      }
      // Ensure discount doesn't exceed subtotal
      if (discountAmount > subtotal) {
        discountAmount = subtotal;
      }
    }

    const netTaxable = subtotal - discountAmount;
    // 18% GST calculation on net taxable amount
    const taxAmount = Math.floor(netTaxable * 0.18);

    // Retrieve shipping settings from DB (stored in Paise)
    const dbShippingCharge = await prisma.setting.findUnique({ where: { key: "shipping_charge" } });
    const dbFreeShippingThreshold = await prisma.setting.findUnique({ where: { key: "free_shipping_threshold" } });

    const shippingCharge = dbShippingCharge ? Number(dbShippingCharge.value) : 10000; // default ₹100 (10000 Paise)
    const freeShippingThreshold = dbFreeShippingThreshold ? Number(dbFreeShippingThreshold.value) : 99900; // default ₹999 (99900 Paise)

    const shippingFee = netTaxable > freeShippingThreshold ? 0 : shippingCharge;

    const totalAmount = netTaxable + taxAmount + shippingFee;

    return {
      subtotal,
      discountAmount,
      taxAmount,
      shippingFee,
      totalAmount,
      appliedCoupon,
    };
  }

  // Place Order inside a transaction block with error recovery for stock reservations
  async placeOrder(
    userId?: string,
    sessionId?: string,
    couponCode?: string,
    shippingAddressInput?: any,
    addressId?: string,
    guestItemsInput?: any[],
    ipAddress?: string | null,
    customGiftNote?: string
  ): Promise<Order> {
    if (userId) {
      const isSuspended = await AdminService.isCustomerSuspended(userId);
      if (isSuspended) {
        throw new BadRequestError("Your account has been suspended and you cannot place orders");
      }
    }

    // 1. Resolve Shipping Address
    let shippingAddress: any = null;
    if (userId && addressId) {
      const dbAddress = await prisma.address.findUnique({
        where: { id: addressId, userId },
      });
      if (!dbAddress) {
        throw new NotFoundError("Selected address not found");
      }
      shippingAddress = {
        recipientName: dbAddress.recipientName,
        street: dbAddress.street,
        city: dbAddress.city,
        state: dbAddress.state,
        postalCode: dbAddress.postalCode,
        country: dbAddress.country,
        phone: dbAddress.phone,
        email: null,
      };
    } else if (shippingAddressInput) {
      shippingAddress = shippingAddressInput;
      if (!userId && !shippingAddress.email) {
        throw new BadRequestError("Guest email address is required");
      }
    } else {
      throw new BadRequestError("Shipping address or addressId is required");
    }

    // 2. Resolve Items & Quantities
    let cartItems: any[] = [];
    if (userId) {
      const dbCart = await this.cartRepository.findCartByUserId(userId);
      if (!dbCart || dbCart.items.length === 0) {
        throw new BadRequestError("Cannot place order with an empty cart");
      }
      cartItems = dbCart.items.map((item: any) => ({
        variantId: item.variantId,
        productId: item.productId,
        quantity: item.quantity,
        isCustomBox: item.isCustomBox,
        customBoxSelections: item.customBoxSelections,
        name: `${item.product.name} - ${item.variant.name}`,
        price: item.variant.discountPrice !== null ? item.variant.discountPrice : item.variant.price,
      }));
    } else if (guestItemsInput && guestItemsInput.length > 0) {
      // Validate guest items and fetch details from DB
      const variantIds = guestItemsInput.map((i) => i.variantId);
      const dbVariants = await prisma.productVariant.findMany({
        where: { id: { in: variantIds }, isDeleted: false },
        include: { product: true },
      });

      for (const item of guestItemsInput) {
        const v = dbVariants.find((dbV) => dbV.id === item.variantId);
        if (!v || v.product.status !== "PUBLISHED" || v.product.isDeleted) {
          throw new NotFoundError(`Product variant ${item.variantId} is unavailable`);
        }
        cartItems.push({
          variantId: item.variantId,
          productId: v.productId,
          quantity: item.quantity,
          isCustomBox: item.isCustomBox || false,
          customBoxSelections: item.customBoxSelections || null,
          name: `${v.product.name} - ${v.name}`,
          price: v.discountPrice !== null ? v.discountPrice : v.price,
        });
      }
    } else {
      throw new BadRequestError("No items provided for checkout");
    }

    // 3. Compute Totals
    const totals = await this.calculateTotals(cartItems, couponCode);

    // 4. Generate unique Receipt Number
    const receiptNumber = `LOAVIA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 4.5 Create Razorpay Order
    let razorpayOrderId = "";
    try {
      const razorpayOrder = await razorpay.orders.create({
        amount: totals.totalAmount,
        currency: "INR",
        receipt: receiptNumber,
      });
      razorpayOrderId = razorpayOrder.id;
    } catch (razorError) {
      throw new BadRequestError("Failed to initiate gateway payment session. Please try again.");
    }

    let reserved = false;
    try {
      // 5. Reserve Inventory (Runs self-contained Redis/DB transactions)
      for (const item of cartItems) {
        // Reserve stock using the receipt number as checkoutSessionId
        await this.inventoryService.reserveInventory(
          item.variantId,
          item.quantity,
          receiptNumber,
          userId || "GUEST",
          15,
          ipAddress
        );
        
        // If BYOB box, reserve selection items as well
        if (item.isCustomBox && item.customBoxSelections && item.customBoxSelections.length > 0) {
          for (const sel of item.customBoxSelections) {
            const requiredSelQty = sel.quantity * item.quantity;
            await this.inventoryService.reserveInventory(
              sel.variantId,
              requiredSelQty,
              receiptNumber,
              userId || "GUEST",
              15,
              ipAddress
            );
          }
        }
      }
      reserved = true;

      // 6. DB order creation inside a unified transaction
      const order = await prisma.$transaction(async (tx) => {
        // A. Insert Order
        const createdOrder = await this.orderRepository.create(
          {
            receiptNumber,
            user: userId ? { connect: { id: userId } } : undefined,
            status: OrderStatus.PENDING,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            taxAmount: totals.taxAmount,
            shippingFee: totals.shippingFee,
            totalAmount: totals.totalAmount,
            shippingAddress,
            customGiftNote: customGiftNote || null,
          },
          tx
        );

        // B. Insert Order Items
        for (const item of cartItems) {
          await this.orderRepository.createOrderItem(
            {
              orderId: createdOrder.id,
              productId: item.productId,
              variantId: item.variantId,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              isCustomBox: item.isCustomBox,
              customBoxSelections: item.customBoxSelections || undefined,
            },
            tx
          );
        }

        // C. Create default PENDING Shipment record
        await this.shipmentService.createShipment(createdOrder.id, tx);

        // D. Clear Cart
        if (userId) {
          const dbCart = await this.cartRepository.findCartByUserId(userId);
          if (dbCart) {
            await this.cartRepository.clearCart(dbCart.id);
          }
        } else if (sessionId) {
          await this.cartRepository.clearGuestCart(sessionId);
        }

        return createdOrder;
      });

      // 7. Audit Log
      await this.auditLogRepository.create({
        userId: userId || null,
        action: "ORDER_CREATED",
        entity: "Order",
        entityId: order.id,
        details: { receiptNumber, totalAmount: totals.totalAmount, couponCode, razorpayOrderId },
        ipAddress,
      });

      return {
        ...order,
        razorpayOrderId,
        razorpayKeyId: env.RAZORPAY_KEY_ID,
      } as any;
    } catch (err) {
      // Recovery: Revert any reservations if order failed to insert
      if (reserved) {
        try {
          await this.inventoryService.releaseInventoryReservation(receiptNumber, userId || "GUEST", ipAddress);
        } catch (releaseErr) {
          // Log recovery failure
        }
      }
      throw err;
    }
  }

  // Virtual status override mapper
  mapOrderVirtualStatus(order: any): any {
    if (!order) return order;
    const addr = order.shippingAddress as any;
    if (addr && addr.paymentReviewRequired) {
      return {
        ...order,
        status: "PAYMENT_RECEIVED_REVIEW",
      };
    }
    return order;
  }

  // Get single order with permissions validation
  async getOrder(orderId: string, userId: string, role: UserRole): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Customer can only view their own orders
    if (role === UserRole.CUSTOMER && order.userId !== userId) {
      throw new BadRequestError("You do not have permission to view this order");
    }

    return this.mapOrderVirtualStatus(order);
  }

  // Get user order history (paginated)
  async getOrderHistory(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const history = await this.orderRepository.findManyByUser(userId, skip, limit);
    history.data = history.data.map(o => this.mapOrderVirtualStatus(o));
    return history;
  }

  // Get all orders paginated (for Admin/Staff console)
  async getAllOrders(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const result = await this.orderRepository.findMany(skip, limit);
    result.data = result.data.map(o => this.mapOrderVirtualStatus(o));
    return result;
  }

  // Update order status (with state machine guards and stock commits/releases)
  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorId: string,
    actorRole: UserRole,
    ipAddress?: string | null
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const currentStatus = order.status;

    // Reject self-assignments or identical statuses
    if (currentStatus === newStatus) {
      return this.mapOrderVirtualStatus(order);
    }

    // Verify legal state transitions
    this.verifyStateTransition(currentStatus, newStatus, actorRole);

    // Run inventory reservation commits or releases
    if (currentStatus === OrderStatus.PENDING) {
      if (newStatus === OrderStatus.PAID) {
        // Commit stock reservation
        await this.inventoryService.commitInventoryReservation(order.receiptNumber, actorId, ipAddress);
      } else if (newStatus === OrderStatus.CANCELLED) {
        // Release stock reservation
        await this.inventoryService.releaseInventoryReservation(order.receiptNumber, actorId, ipAddress);
      }
    }

    // Perform database status update
    const updatedOrder = (await this.orderRepository.updateStatus(orderId, newStatus)) as any;

    // Automatically transition shipment status if order becomes PAID or CANCELLED
    if (updatedOrder.shipment) {
      let shipmentStatus = updatedOrder.shipment.status;
      if (newStatus === OrderStatus.PAID) {
        shipmentStatus = ShipmentStatus.PROCESSING;
      } else if (newStatus === OrderStatus.CANCELLED) {
        shipmentStatus = ShipmentStatus.FAILED;
      }
      
      await prisma.shipment.update({
        where: { id: updatedOrder.shipment.id },
        data: { status: shipmentStatus },
      });
    }

    // Audit Logging
    await this.auditLogRepository.create({
      userId: actorId,
      action: "ORDER_STATUS_UPDATED",
      entity: "Order",
      entityId: orderId,
      details: { oldStatus: currentStatus, newStatus },
      ipAddress,
    });

    return this.mapOrderVirtualStatus(updatedOrder);
  }

  // Cancel order (Wrapper supporting customer or admin trigger)
  async cancelOrder(orderId: string, actorId: string, actorRole: UserRole, ipAddress?: string | null): Promise<Order> {
    return this.updateOrderStatus(orderId, OrderStatus.CANCELLED, actorId, actorRole, ipAddress);
  }


  // State Transition Rule Guard Engine
  private verifyStateTransition(current: OrderStatus, target: OrderStatus, role: UserRole) {
    // 1. Terminal State Rejections
    if (current === OrderStatus.CANCELLED) {
      throw new BadRequestError("Cannot transition a cancelled order");
    }
    if (current === OrderStatus.REFUNDED || current === OrderStatus.RETURNED) {
      throw new BadRequestError("Cannot transition completed return/refund orders");
    }

    // 2. Client Cancellation rules
    if (role === UserRole.CUSTOMER) {
      if (target !== OrderStatus.CANCELLED) {
        throw new BadRequestError("Customers can only cancel pending orders");
      }
      if (current !== OrderStatus.PENDING) {
        throw new BadRequestError("Only pending orders can be cancelled by the customer");
      }
      return;
    }

    // 3. Admin/Staff transition sequence gates
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [OrderStatus.PAID, OrderStatus.CANCELLED],
      PAID: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      PROCESSING: [OrderStatus.PACKED, OrderStatus.CANCELLED],
      PACKED: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      SHIPPED: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
      DELIVERED: [OrderStatus.RETURNED],
      RETURNED: [OrderStatus.REFUNDED],
      REFUNDED: [],
      CANCELLED: [],
    };

    const allowed = transitions[current] || [];
    if (!allowed.includes(target)) {
      throw new BadRequestError(`Illegal order status transition: ${current} → ${target}`);
    }
  }
}

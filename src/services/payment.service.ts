import crypto from "crypto";
import { env } from "../config/env";
import { PaymentRepository } from "../repositories/payment.repository";
import { OrderRepository } from "../repositories/order.repository";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { InventoryService } from "./inventory.service";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { BadRequestError } from "../errors/BadRequestError";
import { NotFoundError } from "../errors/NotFoundError";
import { OrderStatus, PaymentStatus, PaymentMethod, ShipmentStatus } from "@prisma/client";
import { razorpay } from "../utils/razorpay";
import { EmailQueue } from "../queues/email.queue";
import { logger } from "../config/logger";

// Signature validation helpers
export function verifySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean {
  const text = `${razorpayOrderId}|${razorpayPaymentId}`;
  const generatedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(text)
    .digest("hex");
  return generatedSignature === razorpaySignature;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch (err) {
    return false;
  }
}

export class PaymentService {
  private paymentRepository = new PaymentRepository();
  private orderRepository = new OrderRepository();
  private auditLogRepository = new AuditLogRepository();
  private inventoryService = new InventoryService();

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

  // Map razorpay method string to DB enum
  private mapPaymentMethod(method: string): PaymentMethod {
    if (!method) return PaymentMethod.CARD;
    const methodUpper = method.toUpperCase();
    if (methodUpper === "UPI") return PaymentMethod.UPI;
    if (methodUpper === "NETBANKING" || methodUpper === "NET_BANKING") return PaymentMethod.NETBANKING;
    if (methodUpper === "WALLET") return PaymentMethod.WALLET;
    return PaymentMethod.CARD;
  }

  // Idempotency helpers using Redis
  async isWebhookProcessed(eventId: string): Promise<boolean> {
    const key = `webhook_event:${eventId}`;
    const exists = await redis.get(key);
    return !!exists;
  }

  async markWebhookProcessed(eventId: string): Promise<void> {
    const key = `webhook_event:${eventId}`;
    await redis.setEx(key, 7 * 24 * 60 * 60, "1"); // 7 days TTL
  }

  // Process signature verification from checkout callback
  async processVerification(
    userId: string | undefined,
    payload: {
      orderId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      method: string;
    },
    ipAddress?: string | null
  ): Promise<any> {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, method } = payload;

    // Verify cryptographic signature
    const isValid = verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      await this.auditLogRepository.create({
        userId: userId || null,
        action: "PAYMENT_SIGNATURE_INVALID",
        entity: "Order",
        entityId: orderId,
        details: { payload },
        ipAddress,
      });
      throw new BadRequestError("Invalid signature. Payment could not be verified.");
    }

    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Idempotent bypass if already paid
    if (order.status === OrderStatus.PAID) {
      let payment = await this.paymentRepository.findByOrderId(orderId);
      if (!payment) {
        payment = await this.paymentRepository.create({
          orderId: order.id,
          gatewayPaymentId: razorpayPaymentId,
          gatewayOrderId: razorpayOrderId,
          gatewaySignature: razorpaySignature,
          amount: order.totalAmount,
          status: PaymentStatus.COMPLETED,
          method: this.mapPaymentMethod(method),
        });
      }
      return { order: this.mapOrderVirtualStatus(order), payment };
    }

    if (order.status !== OrderStatus.PENDING) {
      const addr = order.shippingAddress as any;
      if (addr && addr.paymentReviewRequired) {
        const payment = await this.paymentRepository.findByOrderId(orderId);
        return { order: this.mapOrderVirtualStatus(order), payment };
      }
      throw new BadRequestError(`Order cannot be verified in its current state: ${order.status}`);
    }

    const result = await this.completePaymentExecution(order, {
      gatewayPaymentId: razorpayPaymentId,
      gatewayOrderId: razorpayOrderId,
      gatewaySignature: razorpaySignature,
      method,
    }, userId, ipAddress);

    return {
      order: this.mapOrderVirtualStatus(result.order),
      payment: result.payment,
    };
  }

  // Core transaction runner to commit payment status, handle state changes and inventory reserves
  private async completePaymentExecution(
    order: any,
    paymentDetails: {
      gatewayPaymentId: string;
      gatewayOrderId: string;
      gatewaySignature: string;
      method: string;
    },
    actorId?: string,
    ipAddress?: string | null
  ): Promise<any> {
    const { gatewayPaymentId, gatewayOrderId, gatewaySignature, method } = paymentDetails;

    // 1. Idempotency Check-First: if payment record already exists, return it
    const existingPayment = await this.paymentRepository.findByOrderId(order.id);
    if (existingPayment) {
      const existingOrder = await this.orderRepository.findById(order.id);
      return { order: existingOrder, payment: existingPayment };
    }

    try {
      const resKey = `stock_res:${order.receiptNumber}`;
      const hasReservation = await redis.get(resKey);

      const paymentMethodMapped = this.mapPaymentMethod(method);

      if (hasReservation) {
        // 1. Stock Reservation is ACTIVE -> Normal Path
        const result = await prisma.$transaction(async (tx) => {
          // Mark Order PAID
          const updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.PAID },
            include: { shipment: true, items: true },
          });

          // Update shipment to PROCESSING
          if (updatedOrder.shipment) {
            await tx.shipment.update({
              where: { id: updatedOrder.shipment.id },
              data: { status: ShipmentStatus.PROCESSING },
            });
          }

          // Create Payment record
          const payment = await tx.payment.create({
            data: {
              orderId: order.id,
              gatewayPaymentId,
              gatewayOrderId,
              gatewaySignature,
              amount: order.totalAmount,
              status: PaymentStatus.COMPLETED,
              method: paymentMethodMapped,
            },
          });

          return { order: updatedOrder, payment };
        });

        // Commit stock reservation in Redis/Postgres
        try {
          await this.inventoryService.commitInventoryReservation(order.receiptNumber, actorId || "SYSTEM", ipAddress);
        } catch (err) {
          // ignore
        }

        await this.auditLogRepository.create({
          userId: actorId || null,
          action: "PAYMENT_COMPLETED",
          entity: "Payment",
          entityId: result.payment.id,
          details: { receiptNumber: order.receiptNumber, totalAmount: order.totalAmount },
          ipAddress,
        });

        // Trigger order receipt email
        await this.enqueueOrderEmails(result.order, "PAID");

        return result;
      } else {
        // 2. Stock Reservation EXPIRED -> Re-check inventory availability
        const orderItems = order.items;
        let stockAvailable = true;
        const itemsToDeduct: Array<{ variantId: string; quantity: number }> = [];

        for (const item of orderItems) {
          const inv = await prisma.inventory.findUnique({ where: { variantId: item.variantId } });
          if (!inv || inv.availableQty < item.quantity) {
            stockAvailable = false;
            break;
          }
          itemsToDeduct.push({ variantId: item.variantId, quantity: item.quantity });

          if (item.isCustomBox && item.customBoxSelections) {
            const selections = item.customBoxSelections as any[];
            for (const sel of selections) {
              const required = sel.quantity * item.quantity;
              const selInv = await prisma.inventory.findUnique({ where: { variantId: sel.variantId } });
              if (!selInv || selInv.availableQty < required) {
                stockAvailable = false;
                break;
              }
              itemsToDeduct.push({ variantId: sel.variantId, quantity: required });
            }
          }
        }

        if (stockAvailable) {
          // Stock is available -> Deduct available inventory and mark PAID
          const result = await prisma.$transaction(async (tx) => {
            for (const item of itemsToDeduct) {
              const currentInv = await tx.inventory.findUnique({ where: { variantId: item.variantId } });
              const newQty = (currentInv?.availableQty || 0) - item.quantity;
              
              let invStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" = "IN_STOCK";
              if (newQty <= 0) invStatus = "OUT_OF_STOCK";
              else if (newQty <= (currentInv?.lowStockThreshold || 10)) invStatus = "LOW_STOCK";

              await tx.inventory.update({
                where: { variantId: item.variantId },
                data: { availableQty: newQty, status: invStatus },
              });

              await tx.productVariant.update({
                where: { id: item.variantId },
                data: { stockQuantity: newQty },
              });
            }

            const updatedOrder = await tx.order.update({
              where: { id: order.id },
              data: { status: OrderStatus.PAID },
              include: { shipment: true, items: true },
            });

            if (updatedOrder.shipment) {
              await tx.shipment.update({
                where: { id: updatedOrder.shipment.id },
                data: { status: ShipmentStatus.PROCESSING },
              });
            }

            const payment = await tx.payment.create({
              data: {
                orderId: order.id,
                gatewayPaymentId,
                gatewayOrderId,
                gatewaySignature,
                amount: order.totalAmount,
                status: PaymentStatus.COMPLETED,
                method: paymentMethodMapped,
              },
            });

            return { order: updatedOrder, payment };
          });

          await this.auditLogRepository.create({
            userId: actorId || null,
            action: "PAYMENT_COMPLETED_AFTER_EXPIRATION",
            entity: "Payment",
            entityId: result.payment.id,
            details: { receiptNumber: order.receiptNumber, totalAmount: order.totalAmount, stockDeductedDirectly: true },
            ipAddress,
          });

          // Trigger order receipt email
          await this.enqueueOrderEmails(result.order, "PAID");

          return result;
        } else {
          // Stock is NOT available -> Transition Order to PAYMENT_RECEIVED_REVIEW flag
          const updatedAddress = {
            ...(order.shippingAddress as any),
            paymentReviewRequired: true,
            reviewReason: "INVENTORY_UNAVAILABLE",
            paymentDetails: {
              gatewayPaymentId,
              gatewayOrderId,
              gatewaySignature,
              method,
              amount: order.totalAmount,
            }
          };

          const result = await prisma.$transaction(async (tx) => {
            const updatedOrder = await tx.order.update({
              where: { id: order.id },
              data: { shippingAddress: updatedAddress },
              include: { shipment: true, items: true },
            });

            const payment = await tx.payment.create({
              data: {
                orderId: order.id,
                gatewayPaymentId,
                gatewayOrderId,
                gatewaySignature,
                amount: order.totalAmount,
                status: PaymentStatus.COMPLETED,
                method: paymentMethodMapped,
              },
            });

            return { order: updatedOrder, payment };
          });

          // Generate critical audit log for manual review
          await this.auditLogRepository.create({
            userId: actorId || null,
            action: "PAYMENT_RECEIVED_REVIEW",
            entity: "Order",
            entityId: order.id,
            details: {
              receiptNumber: order.receiptNumber,
              gatewayPaymentId,
              reason: "Inventory was unavailable after stock reservation expired",
              severity: "CRITICAL",
            },
            ipAddress,
          });

          // Trigger order review warning email
          await this.enqueueOrderEmails(result.order, "REVIEW");

          return result;
        }
      }
    } catch (err: any) {
      if (err.code === "P2002" || err.message?.includes("Unique constraint")) {
        // Handle concurrent duplicate webhook delivery gracefully
        const existingPayment = await this.paymentRepository.findByOrderId(order.id);
        if (existingPayment) {
          const existingOrder = await this.orderRepository.findById(order.id);
          return { order: existingOrder, payment: existingPayment };
        }
      }
      throw err;
    }
  }

  // Webhook processing engine
  async processWebhook(signatureHeader: string, rawBody: string): Promise<any> {
    const isValid = verifyWebhookSignature(rawBody, signatureHeader);
    if (!isValid) {
      throw new BadRequestError("Invalid webhook signature");
    }

    const payload = JSON.parse(rawBody);
    const eventId = payload.id;

    // Webhook Idempotency Check
    const alreadyProcessed = await this.isWebhookProcessed(eventId);
    if (alreadyProcessed) {
      return { success: true, message: "Webhook event already processed" };
    }

    const eventType = payload.event;
    let result: any = null;

    if (eventType === "order.paid" || eventType === "payment.captured") {
      let orderReceipt = "";
      let gatewayPaymentId = "";
      let gatewayOrderId = "";
      let gatewaySignature = "WEBHOOK_VERIFIED";
      let method = "card";

      if (eventType === "order.paid") {
        const orderEntity = payload.payload.order.entity;
        orderReceipt = orderEntity.receipt;
        gatewayOrderId = orderEntity.id;
      } else {
        const paymentEntity = payload.payload.payment.entity;
        orderReceipt = paymentEntity.description || "";
        gatewayPaymentId = paymentEntity.id;
        gatewayOrderId = paymentEntity.order_id;
        method = paymentEntity.method;
        if (paymentEntity.notes && paymentEntity.notes.receiptNumber) {
          orderReceipt = paymentEntity.notes.receiptNumber;
        }
      }

      let order = null;
      if (orderReceipt) {
        order = await this.orderRepository.findByReceipt(orderReceipt);
      }
      if (!order && gatewayOrderId) {
        try {
          const rzpOrder = await razorpay.orders.fetch(gatewayOrderId);
          if (rzpOrder && rzpOrder.receipt) {
            order = await this.orderRepository.findByReceipt(rzpOrder.receipt);
          }
        } catch (err) {
          // ignore
        }
      }

      if (!order) {
        throw new NotFoundError("Associated order not found for webhook event");
      }

      if (order.status === OrderStatus.PAID) {
        await this.markWebhookProcessed(eventId);
        return { success: true, message: "Order already marked paid" };
      }

      if (order.status === OrderStatus.PENDING) {
        if (eventType === "order.paid" && !gatewayPaymentId) {
          try {
            const paymentsList = await razorpay.orders.fetchPayments(gatewayOrderId);
            if (paymentsList.items && paymentsList.items.length > 0) {
              const p = paymentsList.items[0];
              gatewayPaymentId = p.id;
              method = p.method;
            }
          } catch (err) {
            // ignore
          }
        }

        const execResult = await this.completePaymentExecution(order, {
          gatewayPaymentId: gatewayPaymentId || `pay_web_${Date.now()}`,
          gatewayOrderId,
          gatewaySignature,
          method,
        }, "SYSTEM");
        result = {
          order: this.mapOrderVirtualStatus(execResult.order),
          payment: execResult.payment,
        };
      }
    } else if (eventType === "payment.failed") {
      const paymentEntity = payload.payload.payment.entity;
      const gatewayOrderId = paymentEntity.order_id;
      
      let order = null;
      try {
        const rzpOrder = await razorpay.orders.fetch(gatewayOrderId);
        if (rzpOrder && rzpOrder.receipt) {
          order = await this.orderRepository.findByReceipt(rzpOrder.receipt);
        }
      } catch (err) {
        // ignore
      }

      if (order && order.status === OrderStatus.PENDING) {
        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.CANCELLED },
          });
          const orderAny = order as any;
          if (orderAny.shipment) {
            await tx.shipment.update({
              where: { id: orderAny.shipment.id },
              data: { status: ShipmentStatus.FAILED },
            });
          }
        });

        try {
          await this.inventoryService.releaseInventoryReservation(order.receiptNumber, "SYSTEM");
        } catch (err) {
          // ignore
        }

        await this.auditLogRepository.create({
          userId: null,
          action: "PAYMENT_FAILED",
          entity: "Order",
          entityId: order.id,
          details: { gatewayOrderId, gatewayPaymentId: paymentEntity.id, errorDescription: paymentEntity.error_description },
        });
      }
    }

    await this.markWebhookProcessed(eventId);
    return { success: true, message: "Webhook processed successfully", result };
  }

  // Process refund (Support full/partial refunds and calculate remaining totals dynamically)
  async processRefund(
    orderId: string,
    amountToRefundInput?: number,
    actorId?: string,
    ipAddress?: string | null
  ): Promise<any> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment || payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestError("No completed payment record found for this order");
    }

    // Fetch past refund logs to compute remaining balance dynamically
    const pastRefundLogs = await prisma.auditLog.findMany({
      where: {
        entity: "Payment",
        entityId: payment.id,
        action: "PAYMENT_REFUNDED",
      },
    });

    const cumulativeRefunded = pastRefundLogs.reduce((sum, log) => {
      const details = log.details as any;
      return sum + (details.refundedAmount || 0);
    }, 0);

    const remainingRefundable = payment.amount - cumulativeRefunded;
    if (remainingRefundable <= 0) {
      throw new BadRequestError("This payment has already been fully refunded");
    }

    const amountToRefund = amountToRefundInput !== undefined ? amountToRefundInput : remainingRefundable;

    if (amountToRefund > remainingRefundable) {
      throw new BadRequestError(
        `Refund amount ₹${(amountToRefund / 100).toFixed(2)} exceeds remaining refundable balance ₹${(
          remainingRefundable / 100
        ).toFixed(2)}`
      );
    }

    let refundId = "";
    try {
      const refund = await razorpay.payments.refund(payment.gatewayPaymentId, {
        amount: amountToRefund,
      });
      refundId = refund.id;
    } catch (razorError: any) {
      throw new BadRequestError(`Razorpay refund failed: ${razorError.message || razorError}`);
    }

    const isFullRefund = remainingRefundable - amountToRefund === 0;
    const newPaymentStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.COMPLETED;

    const updatedPayment = await this.paymentRepository.update(payment.id, {
      status: newPaymentStatus,
    });

    let updatedOrder = order;
    if (isFullRefund) {
      updatedOrder = await this.orderRepository.updateStatus(orderId, OrderStatus.REFUNDED);
    }

    await this.auditLogRepository.create({
      userId: actorId || null,
      action: "PAYMENT_REFUNDED",
      entity: "Payment",
      entityId: payment.id,
      details: {
        refundId,
        refundedAmount: amountToRefund,
        isFullRefund,
        cumulativeRefunded: cumulativeRefunded + amountToRefund,
        remainingRefundable: remainingRefundable - amountToRefund,
      },
      ipAddress,
    });

    return { payment: updatedPayment, order: this.mapOrderVirtualStatus(updatedOrder), refundedAmount: amountToRefund };
  }

  private async enqueueOrderEmails(order: any, type: "PAID" | "REVIEW"): Promise<void> {
    try {
      let email = "";
      let recipientName = "";
      
      if (order.userId) {
        const user = await prisma.user.findUnique({ where: { id: order.userId } });
        if (user) {
          email = user.email;
          recipientName = user.name;
        }
      }
      
      const addr = order.shippingAddress as any;
      if (!email && addr && addr.email) {
        email = addr.email;
      }
      if (!recipientName && addr && addr.recipientName) {
        recipientName = addr.recipientName;
      }
      
      if (!email) {
        logger.error(`❌ Cannot send order receipt: No email found for order ${order.id}`);
        return;
      }

      if (type === "PAID") {
        const receiptItems = (order.items || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        }));

        await EmailQueue.enqueue(
          "ORDER_CONFIRMATION",
          email,
          recipientName,
          {
            receiptNumber: order.receiptNumber,
            items: receiptItems,
            subtotal: order.subtotal,
            shippingFee: order.shippingFee,
            discountAmount: order.discountAmount,
            taxAmount: order.taxAmount,
            totalAmount: order.totalAmount,
            userId: order.userId || undefined,
          },
          `order_paid:${order.receiptNumber}`
        );
      } else {
        await EmailQueue.enqueue(
          "LATE_PAYMENT_REVIEW",
          email,
          recipientName,
          {
            receiptNumber: order.receiptNumber,
            userId: order.userId || undefined,
          },
          `order_review:${order.receiptNumber}`
        );
      }
    } catch (err: any) {
      logger.error(`❌ Error enqueuing order email receipt: ${err.message}`);
    }
  }
}

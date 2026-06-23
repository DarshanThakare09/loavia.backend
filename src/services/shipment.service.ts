import { ShipmentRepository } from "../repositories/shipment.repository";
import { OrderRepository } from "../repositories/order.repository";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { NotFoundError } from "../errors/NotFoundError";
import { Prisma, ShipmentStatus } from "@prisma/client";
import { EmailQueue } from "../queues/email.queue";
import { prisma } from "../config/prisma";

export class ShipmentService {
  private shipmentRepository = new ShipmentRepository();
  private orderRepository = new OrderRepository();
  private auditLogRepository = new AuditLogRepository();

  // Create default shipment record
  async createShipment(orderId: string, tx?: Prisma.TransactionClient) {
    return this.shipmentRepository.create(
      {
        order: { connect: { id: orderId } },
        status: ShipmentStatus.PENDING,
      },
      tx
    );
  }

  // Update shipment tracking details
  async updateShipment(
    orderId: string,
    trackingNumber: string,
    courierPartner: string,
    status?: ShipmentStatus,
    actorId?: string,
    ipAddress?: string | null
  ) {
    const shipment = await this.shipmentRepository.findByOrderId(orderId);
    if (!shipment) {
      throw new NotFoundError("Shipment record not found for this order");
    }

    const updatedShipment = await this.shipmentRepository.update(shipment.id, {
      trackingNumber,
      courierPartner,
      status: status || ShipmentStatus.SHIPPED,
      shippedAt: status === ShipmentStatus.SHIPPED ? new Date() : undefined,
      deliveredAt: status === ShipmentStatus.DELIVERED ? new Date() : undefined,
    });

    // Create a chronological tracking event
    await this.shipmentRepository.createTrackingEvent({
      shipmentId: shipment.id,
      status: status || ShipmentStatus.SHIPPED,
      description: `Parcel dispatched via ${courierPartner}. Tracking ID: ${trackingNumber}`,
    });

    // Audit Log
    if (actorId) {
      await this.auditLogRepository.create({
        userId: actorId,
        action: "SHIPMENT_TRACKING_UPDATED",
        entity: "Shipment",
        entityId: shipment.id,
        details: { trackingNumber, courierPartner, status: status || ShipmentStatus.SHIPPED },
        ipAddress,
      });
    }

    // Send shipment update email asynchronously
    const order = await this.orderRepository.findById(orderId);
    if (order) {
      await this.enqueueShipmentEmails(
        order,
        trackingNumber,
        courierPartner,
        status || ShipmentStatus.SHIPPED
      );
    }

    return updatedShipment;
  }

  // Add custom tracking event
  async addTrackingEvent(
    orderId: string,
    status: string,
    description: string,
    location?: string | null,
    actorId?: string,
    ipAddress?: string | null
  ) {
    const shipment = await this.shipmentRepository.findByOrderId(orderId);
    if (!shipment) {
      throw new NotFoundError("Shipment record not found");
    }

    const event = await this.shipmentRepository.createTrackingEvent({
      shipmentId: shipment.id,
      status,
      description,
      location: location || null,
    });

    // Update shipment status if it matches standard enum values
    if (Object.values(ShipmentStatus).includes(status as any)) {
      await this.shipmentRepository.update(shipment.id, {
        status: status as ShipmentStatus,
        deliveredAt: status === ShipmentStatus.DELIVERED ? new Date() : undefined,
      });
    }

    // Audit Log
    if (actorId) {
      await this.auditLogRepository.create({
        userId: actorId,
        action: "TRACKING_EVENT_ADDED",
        entity: "TrackingEvent",
        entityId: event.id,
        details: { status, description, location },
        ipAddress,
      });
    }

    const order = await this.orderRepository.findById(orderId);
    if (order && Object.values(ShipmentStatus).includes(status as any)) {
      await this.enqueueShipmentEmails(
        order,
        shipment.trackingNumber || "N/A",
        shipment.courierPartner || "N/A",
        status
      );
    }

    return event;
  }

  // Public order tracking using receipt number
  async getTrackingHistory(receiptNumber: string) {
    const order = await this.orderRepository.findByReceipt(receiptNumber);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const shipment = (await this.shipmentRepository.findByOrderId(order.id)) as any;
    if (!shipment) {
      throw new NotFoundError("Shipment tracking details unavailable");
    }

    return {
      orderId: order.id,
      receiptNumber: order.receiptNumber,
      orderStatus: order.status,
      shipmentStatus: shipment.status,
      trackingNumber: shipment.trackingNumber,
      courierPartner: shipment.courierPartner,
      events: shipment.events,
    };
  }

  private async enqueueShipmentEmails(
    order: any,
    trackingNumber: string,
    courierPartner: string,
    status: string
  ): Promise<void> {
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
        return;
      }

      await EmailQueue.enqueue(
        "SHIPMENT_UPDATE",
        email,
        recipientName,
        {
          receiptNumber: order.receiptNumber,
          trackingNumber,
          courierPartner,
          status,
          userId: order.userId || undefined,
        },
        `shipment_update:${order.receiptNumber}:${status}`
      );
    } catch (err) {
      // ignore
    }
  }
}

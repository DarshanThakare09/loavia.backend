import { prisma } from "../config/prisma";
import { Shipment, TrackingEvent, Prisma } from "@prisma/client";

export class ShipmentRepository {
  // Create a shipment
  async create(data: Prisma.ShipmentCreateInput, tx?: Prisma.TransactionClient): Promise<Shipment> {
    const client = tx || prisma;
    return client.shipment.create({
      data,
    });
  }

  // Find shipment by order ID
  async findByOrderId(orderId: string): Promise<Shipment | null> {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(orderId)) {
      return null;
    }
    return prisma.shipment.findUnique({
      where: { orderId },
      include: {
        events: {
          orderBy: { timestamp: "desc" },
        },
      },
    });
  }

  // Update shipment status/details
  async update(id: string, data: Prisma.ShipmentUpdateInput, tx?: Prisma.TransactionClient): Promise<Shipment> {
    const client = tx || prisma;
    return client.shipment.update({
      where: { id },
      data,
    });
  }

  // Add a tracking event
  async createTrackingEvent(
    data: Prisma.TrackingEventUncheckedCreateInput,
    tx?: Prisma.TransactionClient
  ): Promise<TrackingEvent> {
    const client = tx || prisma;
    return client.trackingEvent.create({
      data,
    });
  }

  // Get tracking events chronologically
  async getTrackingEvents(shipmentId: string): Promise<TrackingEvent[]> {
    return prisma.trackingEvent.findMany({
      where: { shipmentId },
      orderBy: { timestamp: "asc" },
    });
  }
}

import { prisma } from "../config/prisma";
import { Order, OrderItem, Prisma, OrderStatus } from "@prisma/client";

export class OrderRepository {
  // Create order
  async create(data: Prisma.OrderCreateInput, tx?: Prisma.TransactionClient): Promise<Order> {
    const client = tx || prisma;
    return client.order.create({
      data,
      include: {
        items: true,
        shipment: true,
      },
    });
  }

  // Create order item
  async createOrderItem(data: Prisma.OrderItemUncheckedCreateInput, tx?: Prisma.TransactionClient): Promise<OrderItem> {
    const client = tx || prisma;
    return client.orderItem.create({
      data,
    });
  }

  // Find order by ID
  async findById(id: string): Promise<Order | null> {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return null;
    }
    return prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payment: true,
        shipment: {
          include: {
            events: {
              orderBy: { timestamp: "desc" },
            },
          },
        },
      },
    });
  }

  // Find order by receipt number
  async findByReceipt(receiptNumber: string): Promise<Order | null> {
    return prisma.order.findUnique({
      where: { receiptNumber },
      include: {
        items: true,
        payment: true,
        shipment: {
          include: {
            events: {
              orderBy: { timestamp: "desc" },
            },
          },
        },
      },
    });
  }

  // Find orders by user (paginated)
  async findManyByUser(userId: string, skip = 0, take = 10): Promise<{ data: Order[]; total: number }> {
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          shipment: true,
        },
      }),
      prisma.order.count({
        where: { userId },
      }),
    ]);
    return { data, total };
  }

  // Find all orders (for admins/staff, paginated)
  async findMany(skip = 0, take = 10): Promise<{ data: Order[]; total: number }> {
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          shipment: true,
        },
      }),
      prisma.order.count(),
    ]);
    return { data, total };
  }

  // Update order status
  async updateStatus(id: string, status: OrderStatus, tx?: Prisma.TransactionClient): Promise<Order> {
    const client = tx || prisma;
    return client.order.update({
      where: { id },
      data: { status },
      include: {
        items: true,
        shipment: true,
      },
    });
  }
}

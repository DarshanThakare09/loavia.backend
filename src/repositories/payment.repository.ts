import { prisma } from "../config/prisma";
import { Payment, Prisma } from "@prisma/client";

export class PaymentRepository {
  // Create a payment
  async create(data: Prisma.PaymentUncheckedCreateInput, tx?: Prisma.TransactionClient): Promise<Payment> {
    const client = tx || prisma;
    return client.payment.create({
      data,
    });
  }

  // Find payment by Order ID
  async findByOrderId(orderId: string): Promise<Payment | null> {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(orderId)) {
      return null;
    }
    return prisma.payment.findUnique({
      where: { orderId },
    });
  }

  // Find payment by gateway order ID
  async findByGatewayOrderId(gatewayOrderId: string): Promise<Payment | null> {
    return prisma.payment.findFirst({
      where: { gatewayOrderId },
    });
  }

  // Update payment status/details
  async update(id: string, data: Prisma.PaymentUpdateInput, tx?: Prisma.TransactionClient): Promise<Payment> {
    const client = tx || prisma;
    return client.payment.update({
      where: { id },
      data,
    });
  }
}

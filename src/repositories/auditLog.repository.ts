import { prisma } from "../config/prisma";
import { AuditLog } from "@prisma/client";
import { resolveAuditUser } from "../utils/audit";

export class AuditLogRepository {
  async create(data: {
    userId: string | null;
    action: string;
    entity: string;
    entityId: string;
    details: any;
    ipAddress?: string | null;
  }): Promise<AuditLog> {
    const { userId, detailsExtra } = resolveAuditUser(data.userId);
    const details = { ...(data.details || {}), ...detailsExtra };

    return prisma.auditLog.create({
      data: {
        userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        details,
        ipAddress: data.ipAddress,
      },
    });
  }
}

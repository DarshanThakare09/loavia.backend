"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogRepository = void 0;
const prisma_1 = require("../config/prisma");
class AuditLogRepository {
    async create(data) {
        return prisma_1.prisma.auditLog.create({
            data: {
                userId: data.userId,
                action: data.action,
                entity: data.entity,
                entityId: data.entityId,
                details: data.details || {},
                ipAddress: data.ipAddress,
            },
        });
    }
}
exports.AuditLogRepository = AuditLogRepository;

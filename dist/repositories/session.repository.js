"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRepository = void 0;
const prisma_1 = require("../config/prisma");
class SessionRepository {
    async create(userId, refreshToken, expiresAt) {
        return prisma_1.prisma.session.create({
            data: {
                userId,
                refreshToken,
                expiresAt,
                isValid: true,
            },
        });
    }
    async findById(id) {
        return prisma_1.prisma.session.findUnique({
            where: { id },
        });
    }
    async findByToken(refreshToken) {
        return prisma_1.prisma.session.findUnique({
            where: { refreshToken },
        });
    }
    async invalidateSession(id) {
        return prisma_1.prisma.session.update({
            where: { id },
            data: { isValid: false },
        });
    }
    async invalidateAllForUser(userId) {
        const result = await prisma_1.prisma.session.updateMany({
            where: { userId, isValid: true },
            data: { isValid: false },
        });
        return result.count;
    }
}
exports.SessionRepository = SessionRepository;

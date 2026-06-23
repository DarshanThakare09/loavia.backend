"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationTokenRepository = void 0;
const prisma_1 = require("../config/prisma");
class VerificationTokenRepository {
    async create(userId, tokenHash, type, expiresAt) {
        return prisma_1.prisma.verificationToken.create({
            data: {
                userId,
                tokenHash,
                type,
                expiresAt,
            },
        });
    }
    async findByTokenHash(tokenHash) {
        return prisma_1.prisma.verificationToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });
    }
    async markUsed(id) {
        return prisma_1.prisma.verificationToken.update({
            where: { id },
            data: { usedAt: new Date() },
        });
    }
    async invalidateAllForUser(userId, type) {
        const result = await prisma_1.prisma.verificationToken.updateMany({
            where: {
                userId,
                type,
                usedAt: null,
            },
            data: {
                usedAt: new Date(), // Marking them as "used" is equivalent to revoking them
            },
        });
        return result.count;
    }
}
exports.VerificationTokenRepository = VerificationTokenRepository;

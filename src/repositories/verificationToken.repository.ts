import { prisma } from "../config/prisma";
import { VerificationToken, VerificationType } from "@prisma/client";

export class VerificationTokenRepository {
  async create(
    userId: string,
    tokenHash: string,
    type: VerificationType,
    expiresAt: Date
  ): Promise<VerificationToken> {
    return prisma.verificationToken.create({
      data: {
        userId,
        tokenHash,
        type,
        expiresAt,
      },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<VerificationToken | null> {
    return prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  async markUsed(id: string): Promise<VerificationToken> {
    return prisma.verificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async invalidateAllForUser(userId: string, type: VerificationType): Promise<number> {
    const result = await prisma.verificationToken.updateMany({
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

import { prisma } from "../config/prisma";
import { Session } from "@prisma/client";

export class SessionRepository {
  async create(userId: string, refreshToken: string, expiresAt: Date): Promise<Session> {
    return prisma.session.create({
      data: {
        userId,
        refreshToken,
        expiresAt,
        isValid: true,
      },
    });
  }

  async findById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { id },
    });
  }

  async findByToken(refreshToken: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { refreshToken },
    });
  }

  async invalidateSession(id: string): Promise<Session> {
    return prisma.session.update({
      where: { id },
      data: { isValid: false },
    });
  }

  async invalidateAllForUser(userId: string): Promise<number> {
    const result = await prisma.session.updateMany({
      where: { userId, isValid: true },
      data: { isValid: false },
    });
    return result.count;
  }
}

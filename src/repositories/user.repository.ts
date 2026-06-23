import { prisma } from "../config/prisma";
import { Prisma, User } from "@prisma/client";

export class UserRepository {
  async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async incrementTokenVersion(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        tokenVersion: {
          increment: 1,
        },
      },
    });
  }
}

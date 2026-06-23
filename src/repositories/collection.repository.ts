import { prisma } from "../config/prisma";
import { Collection, Prisma } from "@prisma/client";
import { CollectionFilterInput } from "../types/catalog.types";

export class CollectionRepository {
  async create(data: Prisma.CollectionCreateInput): Promise<Collection> {
    return prisma.collection.create({ data });
  }

  async update(id: string, data: Prisma.CollectionUpdateInput): Promise<Collection> {
    return prisma.collection.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Collection> {
    return prisma.collection.delete({
      where: { id },
    });
  }

  async findById(id: string): Promise<Collection | null> {
    return prisma.collection.findUnique({
      where: { id },
    });
  }

  async findBySlug(slug: string): Promise<Collection | null> {
    return prisma.collection.findUnique({
      where: { slug },
    });
  }

  async findAll(filter: CollectionFilterInput, skip = 0, take = 10): Promise<{ data: Collection[]; total: number }> {
    const where: Prisma.CollectionWhereInput = {};

    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    const [data, total] = await Promise.all([
      prisma.collection.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.collection.count({ where }),
    ]);

    return { data, total };
  }
}

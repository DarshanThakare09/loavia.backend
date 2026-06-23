import { prisma } from "../config/prisma";
import { Category, Prisma } from "@prisma/client";
import { CategoryFilterInput } from "../types/catalog.types";

export class CategoryRepository {
  async create(data: Prisma.CategoryCreateInput): Promise<Category> {
    return prisma.category.create({ data });
  }

  async update(id: string, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  async findById(id: string): Promise<Category | null> {
    return prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return prisma.category.findFirst({
      where: { slug, isDeleted: false },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async findAll(filter: CategoryFilterInput, skip = 0, take = 10): Promise<{ data: Category[]; total: number }> {
    const where: Prisma.CategoryWhereInput = {
      isDeleted: false,
    };

    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    const [data, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take,
        orderBy: { sortOrder: "asc" },
        include: {
          parent: true,
        },
      }),
      prisma.category.count({ where }),
    ]);

    return { data, total };
  }
}

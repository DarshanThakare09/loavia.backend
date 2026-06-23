import { CategoryRepository } from "../repositories/category.repository";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { generateUniqueSlug } from "../utils/generateUniqueSlug";
import { BadRequestError } from "../errors/BadRequestError";
import { NotFoundError } from "../errors/NotFoundError";
import { CategoryFilterInput } from "../types/catalog.types";
import { buildPagination, calculateMeta } from "../utils/pagination";
import { Category, Prisma } from "@prisma/client";

const categoryRepository = new CategoryRepository();
const auditLogRepository = new AuditLogRepository();

export class CategoryService {
  async createCategory(
    data: Prisma.CategoryUncheckedCreateInput,
    actorId: string,
    ipAddress?: string | null
  ): Promise<Category> {
    // 1. Parent validation & Circular check
    if (data.parentId) {
      await this.validateParent(data.parentId, null);
    }

    // 2. Slug generation
    const slug = data.slug || (await generateUniqueSlug(data.name, async (s) => {
      const exists = await categoryRepository.findBySlug(s);
      return !!exists;
    }));

    // 3. Database write
    const category = await categoryRepository.create({
      ...data,
      slug,
    });

    // 4. Audit Log
    await auditLogRepository.create({
      userId: actorId,
      action: "CATEGORY_CREATED",
      entity: "Category",
      entityId: category.id,
      details: { name: category.name, slug: category.slug },
      ipAddress,
    });

    return category;
  }

  async updateCategory(
    id: string,
    data: Prisma.CategoryUncheckedUpdateInput,
    actorId: string,
    ipAddress?: string | null
  ): Promise<Category> {
    const existing = await categoryRepository.findById(id);
    if (!existing || existing.isDeleted) {
      throw new NotFoundError("Category not found");
    }

    const updateData: Prisma.CategoryUpdateInput = { ...data };

    // 1. Parent validation & Circular check
    if (data.parentId) {
      const parentIdStr = data.parentId as string;
      if (parentIdStr === id) {
        throw new BadRequestError("A category cannot be its own parent");
      }
      await this.validateParent(parentIdStr, id);
    }

    // 2. Slug generation if name is updated
    if (data.name && !data.slug && data.name !== existing.name) {
      updateData.slug = await generateUniqueSlug(data.name as string, async (s) => {
        const exists = await categoryRepository.findBySlug(s);
        return !!exists && exists.id !== id;
      });
    }

    const category = await categoryRepository.update(id, updateData);

    // 3. Audit Log
    await auditLogRepository.create({
      userId: actorId,
      action: "CATEGORY_UPDATED",
      entity: "Category",
      entityId: category.id,
      details: { changedFields: Object.keys(data) },
      ipAddress,
    });

    return category;
  }

  async deleteCategory(id: string, actorId: string, ipAddress?: string | null): Promise<Category> {
    const existing = await categoryRepository.findById(id);
    if (!existing || existing.isDeleted) {
      throw new NotFoundError("Category not found");
    }

    const category = await categoryRepository.delete(id);

    // Audit Log
    await auditLogRepository.create({
      userId: actorId,
      action: "CATEGORY_DELETED",
      entity: "Category",
      entityId: id,
      details: { name: existing.name },
      ipAddress,
    });

    return category;
  }

  async getCategoryById(id: string): Promise<Category> {
    const category = await categoryRepository.findById(id);
    if (!category || category.isDeleted) {
      throw new NotFoundError("Category not found");
    }
    return category;
  }

  async getCategoryBySlug(slug: string): Promise<Category> {
    const category = await categoryRepository.findBySlug(slug);
    if (!category) {
      throw new NotFoundError("Category not found");
    }
    return category;
  }

  async getCategories(filter: CategoryFilterInput, pageInput?: number, limitInput?: number) {
    const { page, limit, skip } = buildPagination(pageInput, limitInput);
    const { data, total } = await categoryRepository.findAll(filter, skip, limit);
    const pagination = calculateMeta(total, page, limit);
    return { data, pagination };
  }

  // Helper method to prevent circular references in parent hierarchies
  private async validateParent(parentId: string, currentCategoryId: string | null): Promise<void> {
    const parent = await categoryRepository.findById(parentId);
    if (!parent || parent.isDeleted) {
      throw new BadRequestError("Parent category does not exist");
    }

    // Traverse ancestors to check for circular loop (max depth 10 to protect stack)
    let currentParent: typeof parent | null = parent;
    let depth = 0;
    while (currentParent && depth < 10) {
      if (currentCategoryId && currentParent.id === currentCategoryId) {
        throw new BadRequestError("Circular category hierarchy detected");
      }
      if (currentParent.parentId) {
        currentParent = await categoryRepository.findById(currentParent.parentId);
      } else {
        currentParent = null;
      }
      depth++;
    }
  }
}

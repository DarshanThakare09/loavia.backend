import { CollectionRepository } from "../repositories/collection.repository";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { generateUniqueSlug } from "../utils/generateUniqueSlug";
import { NotFoundError } from "../errors/NotFoundError";
import { CollectionFilterInput } from "../types/catalog.types";
import { buildPagination, calculateMeta } from "../utils/pagination";
import { Collection, Prisma } from "@prisma/client";

const collectionRepository = new CollectionRepository();
const auditLogRepository = new AuditLogRepository();

export class CollectionService {
  async createCollection(
    data: Prisma.CollectionCreateInput,
    actorId: string,
    ipAddress?: string | null
  ): Promise<Collection> {
    const slug = data.slug || (await generateUniqueSlug(data.name, async (s) => {
      const exists = await collectionRepository.findBySlug(s);
      return !!exists;
    }));

    const collection = await collectionRepository.create({
      ...data,
      slug,
    });

    await auditLogRepository.create({
      userId: actorId,
      action: "COLLECTION_CREATED",
      entity: "Collection",
      entityId: collection.id,
      details: { name: collection.name, slug: collection.slug },
      ipAddress,
    });

    return collection;
  }

  async updateCollection(
    id: string,
    data: Prisma.CollectionUpdateInput,
    actorId: string,
    ipAddress?: string | null
  ): Promise<Collection> {
    const existing = await collectionRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Collection not found");
    }

    const updateData: Prisma.CollectionUpdateInput = { ...data };

    if (data.name && !data.slug && data.name !== existing.name) {
      updateData.slug = await generateUniqueSlug(data.name as string, async (s) => {
        const exists = await collectionRepository.findBySlug(s);
        return !!exists && exists.id !== id;
      });
    }

    const collection = await collectionRepository.update(id, updateData);

    await auditLogRepository.create({
      userId: actorId,
      action: "COLLECTION_UPDATED",
      entity: "Collection",
      entityId: collection.id,
      details: { changedFields: Object.keys(data) },
      ipAddress,
    });

    return collection;
  }

  async deleteCollection(id: string, actorId: string, ipAddress?: string | null): Promise<Collection> {
    const existing = await collectionRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Collection not found");
    }

    const collection = await collectionRepository.delete(id);

    await auditLogRepository.create({
      userId: actorId,
      action: "COLLECTION_DELETED",
      entity: "Collection",
      entityId: id,
      details: { name: existing.name },
      ipAddress,
    });

    return collection;
  }

  async getCollectionById(id: string): Promise<Collection> {
    const collection = await collectionRepository.findById(id);
    if (!collection) {
      throw new NotFoundError("Collection not found");
    }
    return collection;
  }

  async getCollectionBySlug(slug: string): Promise<Collection> {
    const collection = await collectionRepository.findBySlug(slug);
    if (!collection) {
      throw new NotFoundError("Collection not found");
    }
    return collection;
  }

  async getCollections(filter: CollectionFilterInput, pageInput?: number, limitInput?: number) {
    const { page, limit, skip } = buildPagination(pageInput, limitInput);
    const { data, total } = await collectionRepository.findAll(filter, skip, limit);
    const pagination = calculateMeta(total, page, limit);
    return { data, pagination };
  }
}

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "canonical_url" VARCHAR(255),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "image" VARCHAR(255),
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parent_id" UUID,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "alt_text" VARCHAR(255),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "file_size" INTEGER,
ADD COLUMN     "mime_type" VARCHAR(100),
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "display_label" VARCHAR(100),
ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stock_quantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weight" INTEGER;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "is_popular",
ADD COLUMN     "average_rating" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "base_price" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "canonical_url" VARCHAR(255),
ADD COLUMN     "compare_price" INTEGER,
ADD COLUMN     "is_best_seller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_new_arrival" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meta_description" TEXT,
ADD COLUMN     "meta_title" VARCHAR(255),
ADD COLUMN     "og_image" TEXT,
ADD COLUMN     "review_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "short_description" TEXT,
ADD COLUMN     "sku" VARCHAR(100) NOT NULL,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "meta_title" VARCHAR(255),
    "meta_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "banner_image" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "meta_title" VARCHAR(255),
    "meta_description" TEXT,
    "canonical_url" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProductToTag" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateTable
CREATE TABLE "_CollectionToProduct" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "_ProductToTag_AB_unique" ON "_ProductToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_ProductToTag_B_index" ON "_ProductToTag"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CollectionToProduct_AB_unique" ON "_CollectionToProduct"("A", "B");

-- CreateIndex
CREATE INDEX "_CollectionToProduct_B_index" ON "_CollectionToProduct"("B");

-- CreateIndex
CREATE INDEX "categories_slug_idx" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_slug_idx" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_sku_idx" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_is_featured_idx" ON "products"("is_featured");

-- CreateIndex
CREATE INDEX "products_is_best_seller_idx" ON "products"("is_best_seller");

-- CreateIndex
CREATE INDEX "products_is_new_arrival_idx" ON "products"("is_new_arrival");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductToTag" ADD CONSTRAINT "_ProductToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductToTag" ADD CONSTRAINT "_ProductToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionToProduct" ADD CONSTRAINT "_CollectionToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionToProduct" ADD CONSTRAINT "_CollectionToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

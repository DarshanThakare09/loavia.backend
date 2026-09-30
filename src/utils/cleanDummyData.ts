/**
 * cleanDummyData.ts
 * 
 * One-time cleanup script to remove all dummy/sample product data
 * that was previously seeded into the LOAVIA production database.
 * 
 * Run with: npx ts-node src/utils/cleanDummyData.ts
 * 
 * This script will:
 * - Delete all products and their related data (variants, images, inventory, etc.)
 * - Delete all seeded categories
 * - Delete all seeded collections
 * - Delete all tags
 * - Preserve all orders, users, settings, and other non-catalog data
 * 
 * After running this script, the catalog will be empty and ready
 * for real LOAVIA products to be added through the Admin Panel.
 */

import { prisma } from "../config/prisma";

async function main() {
  console.log("🧹 Starting database cleanup of dummy catalog data...\n");

  // Step 1: Delete product images
  console.log("🗑️  Deleting product images...");
  const deletedImages = await prisma.productImage.deleteMany({});
  console.log(`   ✅ Deleted ${deletedImages.count} product images.`);

  // Step 2: Delete inventory records
  console.log("🗑️  Deleting inventory records...");
  const deletedInventory = await prisma.inventory.deleteMany({});
  console.log(`   ✅ Deleted ${deletedInventory.count} inventory records.`);

  // Step 3: Delete product variants
  console.log("🗑️  Deleting product variants...");
  const deletedVariants = await prisma.productVariant.deleteMany({});
  console.log(`   ✅ Deleted ${deletedVariants.count} product variants.`);

  // Step 4: Delete products (disconnects tags & collections via cascade/relations)
  console.log("🗑️  Deleting products...");
  const deletedProducts = await prisma.product.deleteMany({});
  console.log(`   ✅ Deleted ${deletedProducts.count} products.`);

  // Step 5: Delete all categories
  console.log("🗑️  Deleting categories...");
  const deletedCategories = await prisma.category.deleteMany({});
  console.log(`   ✅ Deleted ${deletedCategories.count} categories.`);

  // Step 6: Delete all collections
  console.log("🗑️  Deleting collections...");
  const deletedCollections = await prisma.collection.deleteMany({});
  console.log(`   ✅ Deleted ${deletedCollections.count} collections.`);

  // Step 7: Delete all tags
  console.log("🗑️  Deleting tags...");
  const deletedTags = await prisma.tag.deleteMany({});
  console.log(`   ✅ Deleted ${deletedTags.count} tags.`);

  console.log("\n✅ Database cleanup complete!");
  console.log("   The catalog is now empty and ready for real LOAVIA products.");
  console.log("   Add products via the Admin Panel at /admin/products.\n");
}

main()
  .catch((e) => {
    console.error("❌ Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

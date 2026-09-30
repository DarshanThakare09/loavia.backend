/**
 * seedCatalog.ts
 * 
 * Production catalog seed utility for LOAVIA.
 * 
 * This file was intentionally cleaned of all dummy/sample product data 
 * as part of production preparation. 
 * 
 * Real LOAVIA products should be added through the Admin Panel 
 * at /admin/products, NOT through this seed script.
 * 
 * This file is kept as a utility scaffold for future use if needed.
 */

import { prisma } from "../config/prisma";

async function main() {
  console.log("ℹ️  No catalog seed data is defined. Add real products via the Admin Panel.");
  console.log("   Visit /admin/products to manage your product catalog.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { prisma } from "../config/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: { isDeleted: false },
    include: {
      variants: {
        where: { isDeleted: false },
      },
    },
  });

  console.log("=== DB PRODUCTS AND VARIANTS ===");
  for (const p of products) {
    console.log(`Product: ${p.name} (ID: ${p.id}, Slug: ${p.slug}, SKU: ${p.sku})`);
    for (const v of p.variants) {
      console.log(`  -> Variant: ${v.name} (ID: ${v.id}, SKU: ${v.sku}, Price: ${v.price}, Default: ${v.isDefault})`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { prisma } from "../config/prisma";
import { ProductStatus } from "@prisma/client";

const CATEGORIES = ["Classic", "Vegan", "Gluten-Free", "Stuffed", "Specialty"];

const PRODUCTS = [
  {
    id: "1",
    name: "Classic Chocolate Chip",
    price: 299,
    discountPrice: null,
    image: "/premium_cookie.png",
    rating: 4.9,
    reviews: 128,
    category: "Classic",
    tags: ["Sweet", "Classic"],
    moods: ["Happy", "Cozy"],
    description: "Our signature cookie that started it all. Baked to perfection with crisp edges, a soft, chewy center, and loaded with premium Belgian dark chocolate chunks. Each bite delivers the perfect balance of sweet, buttery dough and rich, melty chocolate.",
    ingredients: "Organic All-Purpose Flour, Grass-fed Butter, Brown Sugar, Organic Cane Sugar, Pasture-raised Eggs, Belgian Dark Chocolate Chunks (54%), Pure Vanilla Extract, Sea Salt, Baking Soda.",
    images: ["/premium_cookie.png", "/cookie_gift_box.png"],
    calories: "220 kcal",
    isFeatured: true,
    isBestSeller: true,
  },
  {
    id: "2",
    name: "Double Dark Chocolate",
    price: 349,
    discountPrice: 299,
    image: "/premium_cookie.png",
    rating: 4.8,
    reviews: 95,
    category: "Classic",
    tags: ["Sweet", "Chocolate"],
    moods: ["Relaxed"],
    description: "For the true chocolate lover. A rich, dark cocoa dough studded with semi-sweet chocolate chips and finished with a sprinkle of flaky sea salt.",
    ingredients: "Organic All-Purpose Flour, Dutch-Process Cocoa Powder, Grass-fed Butter, Brown Sugar, Eggs, Semi-Sweet Chocolate, Vanilla, Flaky Sea Salt.",
    images: ["/premium_cookie.png", "/cookie_gift_box.png"],
    calories: "240 kcal",
    isFeatured: true,
    isBestSeller: true,
  },
  {
    id: "3",
    name: "Oatmeal Raisin Bliss",
    price: 279,
    discountPrice: null,
    image: "/premium_cookie.png",
    rating: 4.7,
    reviews: 64,
    category: "Vegan",
    tags: ["Healthy", "Fruity"],
    moods: ["Cozy", "Relaxed"],
    description: "A comforting classic baked with hearty oats, plump organic raisins, and a touch of warm cinnamon. Soft, chewy, and naturally sweetened.",
    ingredients: "Organic Rolled Oats, Gluten-free Flour Blend, Organic Raisins, Coconut Oil, Maple Syrup, Cinnamon, Vanilla, Sea Salt.",
    images: ["/premium_cookie.png"],
    calories: "190 kcal",
    isFeatured: true,
    isBestSeller: false,
  },
  {
    id: "4",
    name: "Peanut Butter Crunch",
    price: 329,
    discountPrice: null,
    image: "/premium_cookie.png",
    rating: 4.9,
    reviews: 112,
    category: "Classic",
    tags: ["Nutty", "Sweet"],
    moods: ["Energetic", "Happy"],
    description: "Rich, creamy peanut butter dough loaded with crunchy roasted peanuts and finished with a peanut butter drizzle. Pure peanut butter goodness in every bite.",
    ingredients: "Organic Creamy Peanut Butter, Grass-fed Butter, Brown Sugar, Flour, Roasted Peanuts, Eggs, Vanilla, Baking Soda, Sea Salt.",
    images: ["/premium_cookie.png"],
    calories: "230 kcal",
    isFeatured: false,
    isBestSeller: false,
  },
  {
    id: "5",
    name: "Matcha White Chocolate",
    price: 399,
    discountPrice: null,
    image: "/premium_cookie.png",
    rating: 4.6,
    reviews: 45,
    category: "Specialty",
    tags: ["Tea", "Sweet"],
    moods: ["Relaxed"],
    description: "Earthy, premium Japanese Uji matcha dough beautifully contrasted with sweet, creamy Belgian white chocolate chunks. A refined flavor profile.",
    ingredients: "Organic Flour, Grass-fed Butter, Uji Matcha Powder, White Chocolate Chunks, Cane Sugar, Eggs, Vanilla, Sea Salt.",
    images: ["/premium_cookie.png"],
    calories: "210 kcal",
    isFeatured: false,
    isBestSeller: false,
  },
  {
    id: "6",
    name: "Salted Caramel Pecan",
    price: 379,
    discountPrice: null,
    image: "/premium_cookie.png",
    rating: 4.9,
    reviews: 88,
    category: "Stuffed",
    tags: ["Sweet", "Nutty", "Caramel"],
    moods: ["Happy", "Energetic"],
    description: "A decadent cookie stuffed with a gooey, liquid salted caramel center and topped with toasted Southern pecans and a touch of flaky sea salt.",
    ingredients: "Organic Flour, Grass-fed Butter, Brown Sugar, Toasted Pecans, House-made Salted Caramel, Eggs, Sea Salt.",
    images: ["/premium_cookie.png"],
    calories: "250 kcal",
    isFeatured: false,
    isBestSeller: false,
  },
  {
    id: "7",
    name: "Vegan Lemon Poppyseed",
    price: 299,
    discountPrice: null,
    image: "/premium_cookie.png",
    rating: 4.5,
    reviews: 34,
    category: "Vegan",
    tags: ["Citrus", "Healthy"],
    moods: ["Energetic"],
    description: "Bright, zesty lemon cookie made with fresh organic lemon juice, poppyseeds, and a light glaze. Completely plant-based and refreshing.",
    ingredients: "Gluten-free Flour Blend, Organic Cane Sugar, Fresh Lemon Juice & Zest, Poppyseeds, Coconut Oil, Almond Milk, Vanilla.",
    images: ["/premium_cookie.png"],
    calories: "180 kcal",
    isFeatured: false,
    isBestSeller: false,
  },
  {
    id: "8",
    name: "Gluten-Free Macadamia",
    price: 449,
    discountPrice: null,
    image: "/premium_cookie.png",
    rating: 4.8,
    reviews: 56,
    category: "Gluten-Free",
    tags: ["Nutty", "Premium"],
    moods: ["Happy", "Relaxed"],
    description: "Rich and buttery gluten-free dough packed with premium roasted macadamia nuts and sweet white chocolate chips. Truly indulgent.",
    ingredients: "Gluten-free Flour Blend, Grass-fed Butter, Brown Sugar, Roasted Macadamia Nuts, White Chocolate Chips, Eggs, Vanilla.",
    images: ["/premium_cookie.png"],
    calories: "260 kcal",
    isFeatured: false,
    isBestSeller: false,
  },
  {
    id: "9",
    name: "Build Your Own Box",
    price: 1799,
    discountPrice: null,
    image: "/cookie_gift_box.png",
    rating: 5.0,
    reviews: 12,
    category: "Specialty",
    tags: ["Premium"],
    moods: ["Happy"],
    description: "Create your custom box of premium cookies. Select your favorite flavors and build the perfect box.",
    ingredients: "Love and premium cookies.",
    images: ["/cookie_gift_box.png"],
    calories: null,
    isFeatured: true,
    isBestSeller: false,
  },
];

async function main() {
  console.log("🌱 Seeding Catalog data...");

  // 1. Create Categories
  console.log("📁 Seeding Categories...");
  const categoryMap: Record<string, string> = {};
  for (const catName of CATEGORIES) {
    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const category = await prisma.category.upsert({
      where: { slug },
      update: { isDeleted: false, isActive: true },
      create: {
        name: catName,
        slug,
        isActive: true,
      },
    });
    categoryMap[catName] = category.id;
  }

  // 2. Create Collections
  console.log("📦 Seeding Collections...");
  const collections = [
    { name: "Best Sellers", slug: "best-sellers", description: "Our most popular cookie creations." },
    { name: "Featured Products", slug: "featured-products", description: "Hand-picked favorites from our master baker." },
  ];
  const collectionMap: Record<string, string> = {};
  for (const col of collections) {
    const collection = await prisma.collection.upsert({
      where: { slug: col.slug },
      update: { isActive: true },
      create: {
        name: col.name,
        slug: col.slug,
        description: col.description,
        isActive: true,
      },
    });
    collectionMap[col.slug] = collection.id;
  }

  // 3. Create Products
  console.log("🍪 Seeding Products & Variants...");
  for (const prod of PRODUCTS) {
    const slug = prod.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const categoryId = categoryMap[prod.category];
    if (!categoryId) {
      console.warn(`Category ${prod.category} not found for product ${prod.name}`);
      continue;
    }

    // Upsert the base product
    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        categoryId,
        name: prod.name,
        description: prod.description,
        ingredients: prod.ingredients,
        calories: prod.calories,
        inStock: true,
        basePrice: prod.price * 100, // Paise
        comparePrice: prod.discountPrice ? prod.discountPrice * 100 : null,
        sku: `SKU-${prod.id}`,
        status: ProductStatus.PUBLISHED,
        isFeatured: prod.isFeatured,
        isBestSeller: prod.isBestSeller,
        averageRating: prod.rating,
        reviewCount: prod.reviews,
        isDeleted: false,
      },
      create: {
        categoryId,
        name: prod.name,
        slug,
        description: prod.description,
        ingredients: prod.ingredients,
        calories: prod.calories,
        inStock: true,
        basePrice: prod.price * 100, // Paise
        comparePrice: prod.discountPrice ? prod.discountPrice * 100 : null,
        sku: `SKU-${prod.id}`,
        status: ProductStatus.PUBLISHED,
        isFeatured: prod.isFeatured,
        isBestSeller: prod.isBestSeller,
        averageRating: prod.rating,
        reviewCount: prod.reviews,
      },
    });

    // 4. Create Tags
    const allTags = [...prod.tags, ...prod.moods];
    for (const tagName of allTags) {
      const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const tag = await prisma.tag.upsert({
        where: { slug: tagSlug },
        update: {},
        create: {
          name: tagName,
          slug: tagSlug,
        },
      });

      // Connect tag to product
      await prisma.product.update({
        where: { id: product.id },
        data: {
          tags: {
            connect: { id: tag.id },
          },
        },
      });
    }

    // Connect to Collections if applicable
    if (prod.isBestSeller) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          collections: {
            connect: { id: collectionMap["best-sellers"] },
          },
        },
      });
    }
    if (prod.isFeatured) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          collections: {
            connect: { id: collectionMap["featured-products"] },
          },
        },
      });
    }

    // 5. Create Variants
    if (prod.id === "9") {
      const byobVariants = [
        { name: "6-Pack Custom Box", sku: "BYOB-6", price: 179900, weight: 300, isDefault: true },
        { name: "12-Pack Custom Box", sku: "BYOB-12", price: 349900, weight: 600, isDefault: false },
        { name: "24-Pack Custom Box", sku: "BYOB-24", price: 679900, weight: 1200, isDefault: false },
      ];

      for (const bv of byobVariants) {
        const v = await prisma.productVariant.upsert({
          where: { sku: bv.sku },
          update: {
            productId: product.id,
            name: bv.name,
            price: bv.price,
            stockQuantity: 100,
            weight: bv.weight,
            isDefault: bv.isDefault,
            displayLabel: bv.name,
            isDeleted: false,
          },
          create: {
            productId: product.id,
            name: bv.name,
            sku: bv.sku,
            price: bv.price,
            stockQuantity: 100,
            weight: bv.weight,
            isDefault: bv.isDefault,
            displayLabel: bv.name,
          },
        });

        await prisma.inventory.upsert({
          where: { variantId: v.id },
          update: {
            availableQty: 100,
            status: "IN_STOCK",
          },
          create: {
            variantId: v.id,
            availableQty: 100,
            status: "IN_STOCK",
          },
        });
      }
    } else {
      const v1Sku = `SKU-${prod.id}-V1`;
      const v1 = await prisma.productVariant.upsert({
        where: { sku: v1Sku },
        update: {
          productId: product.id,
          name: "Small Box (6 Cookies)",
          price: prod.price * 100,
          discountPrice: prod.discountPrice ? prod.discountPrice * 100 : null,
          stockQuantity: 50,
          weight: 250,
          isDefault: true,
          displayLabel: "Small Box (6 Cookies)",
          isDeleted: false,
        },
        create: {
          productId: product.id,
          name: "Small Box (6 Cookies)",
          sku: v1Sku,
          price: prod.price * 100,
          discountPrice: prod.discountPrice ? prod.discountPrice * 100 : null,
          stockQuantity: 50,
          weight: 250,
          isDefault: true,
          displayLabel: "Small Box (6 Cookies)",
        },
      });

      await prisma.inventory.upsert({
        where: { variantId: v1.id },
        update: {
          availableQty: 50,
          status: "IN_STOCK",
        },
        create: {
          variantId: v1.id,
          availableQty: 50,
          status: "IN_STOCK",
        },
      });

      const v2Sku = `SKU-${prod.id}-V2`;
      const v2 = await prisma.productVariant.upsert({
        where: { sku: v2Sku },
        update: {
          productId: product.id,
          name: "Large Box (12 Cookies)",
          price: Math.round(prod.price * 1.6 * 100),
          discountPrice: prod.discountPrice ? Math.round(prod.discountPrice * 1.6 * 100) : null,
          stockQuantity: 30,
          weight: 500,
          isDefault: false,
          displayLabel: "Large Box (12 Cookies)",
          isDeleted: false,
        },
        create: {
          productId: product.id,
          name: "Large Box (12 Cookies)",
          sku: v2Sku,
          price: Math.round(prod.price * 1.6 * 100),
          discountPrice: prod.discountPrice ? Math.round(prod.discountPrice * 1.6 * 100) : null,
          stockQuantity: 30,
          weight: 500,
          isDefault: false,
          displayLabel: "Large Box (12 Cookies)",
        },
      });

      await prisma.inventory.upsert({
        where: { variantId: v2.id },
        update: {
          availableQty: 30,
          status: "IN_STOCK",
        },
        create: {
          variantId: v2.id,
          availableQty: 30,
          status: "IN_STOCK",
        },
      });
    }

    // 6. Create Images
    await prisma.productImage.deleteMany({
      where: { productId: product.id },
    });

    for (let i = 0; i < prod.images.length; i++) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: prod.images[i],
          altText: `${prod.name} image ${i + 1}`,
          sortOrder: i,
          isPrimary: i === 0,
        },
      });
    }
  }

  console.log("✅ Catalog Seeding Completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

process.env.NODE_ENV = "test";
import app from "../app";
import { prisma } from "../config/prisma";
import { UserRole, ProductStatus } from "@prisma/client";
import { hashPassword } from "./crypto";
import { redis } from "../config/redis";

const ADMIN_EMAIL = "admin_catalog_test@loavia.in";
const CUSTOMER_EMAIL = "customer_catalog_test@loavia.in";
const TEST_PASSWORD = "password123";

function parseCookies(cookieHeaders: string[] | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeaders) return cookies;
  cookieHeaders.forEach((header) => {
    const [cookie] = header.split(";");
    const [name, value] = cookie.split("=");
    cookies[name.trim()] = value.trim();
  });
  return cookies;
}

async function runTests() {
  console.log("🚀 Starting Product Catalog Module E2E Integration Tests...");

  if (!redis.isOpen) {
    await redis.connect();
  }

  // Start Server on a random port
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  let adminCookie = "";
  let customerCookie = "";

  try {
    // 1. Setup Database Users
    console.log("🧹 Cleaning test database records...");
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-test-" } } });
    await prisma.collection.deleteMany({ where: { slug: { startsWith: "slug-test-" } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: "slug-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } });

    console.log("👤 Creating test users...");
    const hashedPassword = await hashPassword(TEST_PASSWORD);
    
    await prisma.user.create({
      data: {
        name: "Test Admin",
        email: ADMIN_EMAIL,
        passwordHash: hashedPassword,
        role: UserRole.ADMIN,
        isVerified: true,
      },
    });

    await prisma.user.create({
      data: {
        name: "Test Customer",
        email: CUSTOMER_EMAIL,
        passwordHash: hashedPassword,
        role: UserRole.CUSTOMER,
        isVerified: true,
      },
    });

    // 2. Login to obtain access tokens
    console.log("🔑 Authenticating test users...");
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: TEST_PASSWORD }),
    });
    const adminCookies = parseCookies(adminLoginRes.headers.getSetCookie());
    adminCookie = `access_token=${adminCookies.access_token}`;

    const customerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
    });
    const customerCookies = parseCookies(customerLoginRes.headers.getSetCookie());
    customerCookie = `access_token=${customerCookies.access_token}`;

    // 3. Category CRUD tests
    console.log("📁 Testing Category CRUD & Hierarchy Validation...");
    const createCat1Res = await fetch(`${baseUrl}/admin/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        name: "Test Parent Category",
        slug: "slug-test-parent",
        description: "Parent category description",
      }),
    });
    const cat1Data = await createCat1Res.json() as any;
    if (createCat1Res.status !== 201 || !cat1Data.success) {
      throw new Error(`Failed to create parent category: ${JSON.stringify(cat1Data)}`);
    }
    const parentId = cat1Data.data.id;

    // Create child category
    const createCat2Res = await fetch(`${baseUrl}/admin/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        name: "Test Child Category",
        slug: "slug-test-child",
        parentId: parentId,
      }),
    });
    const cat2Data = await createCat2Res.json() as any;
    if (createCat2Res.status !== 201 || !cat2Data.success) {
      throw new Error("Failed to create child category");
    }
    const childId = cat2Data.data.id;

    // Circular loop prevention: set parent's parent to child
    console.log("🔄 Verifying category hierarchy loop validation blocks...");
    const updateLoopRes = await fetch(`${baseUrl}/admin/categories/${parentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        parentId: childId,
      }),
    });
    const loopData = await updateLoopRes.json() as any;
    if (updateLoopRes.status !== 400 || loopData.success) {
      throw new Error("Circular parent loop should have been blocked");
    }
    console.log("✅ Loop blocked successfully: parent-child circle rejected.");

    // 4. Collection CRUD tests
    console.log("📦 Testing Collection CRUD...");
    const createColRes = await fetch(`${baseUrl}/admin/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        name: "Test Collection",
        slug: "slug-test-collection",
        description: "Collection description",
      }),
    });
    const colData = await createColRes.json() as any;
    if (createColRes.status !== 201 || !colData.success) {
      throw new Error("Failed to create collection");
    }
    const collectionId = colData.data.id;

    // 5. Setup Tags
    console.log("🏷️ Setting up Tags...");
    const tag = await prisma.tag.create({
      data: {
        name: "Test Tag",
        slug: "slug-test-tag",
      },
    });

    // 6. Product Creation & Pricing / Inventory Sync Validation
    console.log("🍪 Testing Product Creation Workflow...");
    const createProdRes = await fetch(`${baseUrl}/admin/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        categoryId: parentId,
        name: "Test Cookie",
        slug: "slug-test-product",
        description: "A premium delicious testing cookie box.",
        ingredients: "Flour, Butter, Sugar, Test Essence",
        sku: "SKU-TEST-COOKIE",
        status: ProductStatus.DRAFT, // created as Draft first
        images: [
          { url: "https://loavia.in/cookie.jpg", altText: "Cookie Image", sortOrder: 1, isPrimary: true },
        ],
        variants: [
          { name: "Small Box", sku: "SKU-TEST-V1", price: 50000, discountPrice: 45000, stockQuantity: 10, weight: 250, isDefault: true },
          { name: "Large Box", sku: "SKU-TEST-V2", price: 80000, discountPrice: 75000, stockQuantity: 5, weight: 500 },
        ],
        tagIds: [tag.id],
        collectionIds: [collectionId],
      }),
    });

    const prodData = await createProdRes.json() as any;
    if (createProdRes.status !== 201 || !prodData.success) {
      throw new Error(`Failed to create product: ${JSON.stringify(prodData)}`);
    }
    const productId = prodData.data.id;

    // Validate Price Recalculation
    console.log("💰 Verifying pricing synchronization (min price)...");
    const dbProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!dbProduct || dbProduct.basePrice !== 50000 || dbProduct.comparePrice !== 45000) {
      throw new Error(`Product basePrice mismatch. Expected 50000/45000, got: ${dbProduct?.basePrice}/${dbProduct?.comparePrice}`);
    }
    console.log("✅ Pricing sync correct: Product basePrice tracks lowest variant price.");

    // Validate Inventory mirroring
    console.log("📦 Verifying inventory mirror syncing...");
    const dbVariant = await prisma.productVariant.findFirst({ where: { productId, sku: "SKU-TEST-V1" } });
    if (!dbVariant || dbVariant.stockQuantity !== 10) {
      throw new Error("Variant stock quantity not saved correctly");
    }
    const dbInventory = await prisma.inventory.findUnique({ where: { variantId: dbVariant.id } });
    if (!dbInventory || dbInventory.availableQty !== 10) {
      throw new Error(`Inventory table not synchronized. Expected 10, got: ${dbInventory?.availableQty}`);
    }
    console.log("✅ Inventory sync correct: ProductVariant.stockQuantity mirrors Inventory.availableQty.");

    // 7. Product status visibility check (DRAFT vs PUBLISHED)
    console.log("👁️ Testing draft visibility restrictions...");
    const publicListDraft = await fetch(`${baseUrl}/products`);
    const publicDraftData = await publicListDraft.json() as any;
    const foundDraft = publicDraftData.data.some((p: any) => p.id === productId);
    if (foundDraft) {
      throw new Error("Draft product should be hidden from public listing");
    }

    // Publish product
    await fetch(`${baseUrl}/admin/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        status: ProductStatus.PUBLISHED,
      }),
    });

    const publicListPub = await fetch(`${baseUrl}/products`);
    const publicPubData = await publicListPub.json() as any;
    const foundPub = publicPubData.data.some((p: any) => p.id === productId);
    if (!foundPub) {
      throw new Error("Published product should be visible in public listing");
    }
    console.log("✅ Status visibility mapping verified successfully.");

    // 8. Search and Advanced Filtering
    console.log("🔍 Testing search, filtering, and sorting queries...");
    const searchRes = await fetch(`${baseUrl}/products?search=testing`);
    const searchData = await searchRes.json() as any;
    const foundSearch = searchData.data.some((p: any) => p.id === productId);
    if (!foundSearch) {
      throw new Error("Keyword search failed to retrieve product");
    }

    const priceFilterRes = await fetch(`${baseUrl}/products?minPrice=40000&maxPrice=60000`);
    const priceFilterData = await priceFilterRes.json() as any;
    const foundPrice = priceFilterData.data.some((p: any) => p.id === productId);
    if (!foundPrice) {
      throw new Error("Price range filter failed to retrieve product");
    }

    const tagFilterRes = await fetch(`${baseUrl}/products?tagSlug=slug-test-tag`);
    const tagFilterData = await tagFilterRes.json() as any;
    const foundTag = tagFilterData.data.some((p: any) => p.id === productId);
    if (!foundTag) {
      throw new Error("Tag slug filter failed to retrieve product");
    }
    console.log("✅ Advanced database filters and search lookups verified.");

    // 9. Inventory Protection (Overselling & Atomic Decrmement)
    console.log("🔒 Testing inventory protection decrement and constraints...");
    const productService = new (require("../services/product.service").ProductService)();
    
    // Decrement by 3 (Stock goes 10 -> 7)
    await productService.decrementStock(dbVariant.id, 3, "SYSTEM_TEST");
    const dbVariantAfterDec = await prisma.productVariant.findUnique({ where: { id: dbVariant.id } });
    const dbInventoryAfterDec = await prisma.inventory.findUnique({ where: { variantId: dbVariant.id } });
    if (dbVariantAfterDec?.stockQuantity !== 7 || dbInventoryAfterDec?.availableQty !== 7) {
      throw new Error("Atomic decrement failed to sync stock mirrors");
    }

    // Decrement by 10 (Should violate chk_available_qty_positive constraint)
    let oversellFailed = false;
    try {
      await productService.decrementStock(dbVariant.id, 10, "SYSTEM_TEST");
    } catch (err: any) {
      if (err.message.includes("Insufficient stock")) {
        oversellFailed = true;
      }
    }
    if (!oversellFailed) {
      throw new Error("Overselling constraint chk_available_qty_positive failed to abort checkout");
    }
    console.log("✅ Inventory protection verified: Overselling blocked cleanly by constraint.");

    // 10. Audit Logging Verification
    console.log("📝 Verifying mutation audit logging...");
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityId: productId,
        action: { in: ["PRODUCT_CREATED", "PRODUCT_UPDATED"] },
      },
    });
    if (auditLogs.length === 0) {
      throw new Error("Audit log records were not written for product mutations");
    }
    console.log(`✅ Audit logging verified. Recorded ${auditLogs.length} audit entries.`);

    // 11. RBAC Gating Restriction
    console.log("🛡️ Gating RBAC security checks...");
    const rbacRes = await fetch(`${baseUrl}/admin/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ name: "Unauthorised category" }),
    });
    if (rbacRes.status !== 403) {
      throw new Error(`Customer should be forbidden, got status: ${rbacRes.status}`);
    }
    console.log("✅ RBAC security verified: Customer blocked from admin endpoints.");

    // 12. Soft Deletion check
    console.log("🗑️ Verifying Soft Deletion logic...");
    const delProdRes = await fetch(`${baseUrl}/admin/products/${productId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    if (delProdRes.status !== 200) {
      throw new Error("Product deletion failed");
    }
    const finalDbProd = await prisma.product.findUnique({ where: { id: productId } });
    if (!finalDbProd || !finalDbProd.isDeleted || !finalDbProd.deletedAt) {
      throw new Error("Product was not correctly marked as soft-deleted in database");
    }

    const finalDbVariant = await prisma.productVariant.findUnique({ where: { id: dbVariant.id } });
    if (!finalDbVariant || !finalDbVariant.isDeleted || !finalDbVariant.deletedAt) {
      throw new Error("Variants were not correctly cascade-soft-deleted");
    }
    console.log("✅ Soft deletion cascading verified.");

    console.log("\n🎉 ALL PRODUCT CATALOG E2E INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Integration Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    // Cleanup database records
    console.log("🧹 Cleaning up test database records...");
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-test-" } } });
    await prisma.collection.deleteMany({ where: { slug: { startsWith: "slug-test-" } } });
    await prisma.tag.deleteMany({ where: { slug: { startsWith: "slug-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } });
    await prisma.$disconnect();
    await redis.disconnect().catch(() => {});
    server.close();
  }
}

runTests();

import app from "../app";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { UserRole, ProductStatus } from "@prisma/client";
import { hashPassword } from "./crypto";

const ADMIN_EMAIL = "admin_inventory_test@loavia.in";
const STAFF_EMAIL = "staff_inventory_test@loavia.in";
const CUSTOMER_EMAIL = "customer_inventory_test@loavia.in";
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
  console.log("🚀 Starting Inventory Module E2E Integration Tests...");

  // Connect to Redis for reservations caching
  if (!redis.isOpen) {
    await redis.connect();
  }

  // Start Server on a random port
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  let adminCookie = "";
  let staffCookie = "";
  let customerCookie = "";

  try {
    // 1. Setup Database Users & Catalog mock data
    console.log("🧹 Cleaning test database records...");
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-INV-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-INV-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-inv-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } });

    console.log("👤 Creating test users...");
    const hashedPassword = await hashPassword(TEST_PASSWORD);
    
    const adminUser = await prisma.user.create({
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
        name: "Test Staff",
        email: STAFF_EMAIL,
        passwordHash: hashedPassword,
        role: UserRole.STAFF,
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

    const dbUsers = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } }
    });
    console.log("DEBUG CREATED USERS IN DB:", dbUsers);

    // 2. Login to obtain access tokens
    console.log("🔑 Authenticating test users...");
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: TEST_PASSWORD }),
    });
    const adminCookies = parseCookies(adminLoginRes.headers.getSetCookie());
    adminCookie = `access_token=${adminCookies.access_token}`;

    const staffLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: STAFF_EMAIL, password: TEST_PASSWORD }),
    });
    const staffCookies = parseCookies(staffLoginRes.headers.getSetCookie());
    staffCookie = `access_token=${staffCookies.access_token}`;

    const customerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
    });
    const customerCookies = parseCookies(customerLoginRes.headers.getSetCookie());
    customerCookie = `access_token=${customerCookies.access_token}`;

    // Create a mock parent category
    const category = await prisma.category.create({
      data: {
        name: "Inventory Test Category",
        slug: "slug-inv-test-cat",
      },
    });

    // Create mock product with variants (Inventory record is generated automatically via Service/Repository hooks)
    const createProdRes = await fetch(`${baseUrl}/admin/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        categoryId: category.id,
        name: "Inventory Test Cookie",
        slug: "slug-inv-test-product",
        description: "A premium cookie specifically built for inventory tests.",
        ingredients: "Flour, Butter, Sugar",
        sku: "SKU-INV-TEST-PRODUCT",
        status: ProductStatus.PUBLISHED,
        variants: [
          { name: "Default Box", sku: "SKU-INV-TEST-V1", price: 1000, stockQuantity: 10, isDefault: true },
          { name: "Big Box", sku: "SKU-INV-TEST-V2", price: 2000, stockQuantity: 3 }, // low stock threshold is default 10, so this starts low
        ],
      }),
    });

    const prodData = await createProdRes.json() as any;
    if (createProdRes.status !== 201 || !prodData.success) {
      throw new Error(`Failed to create product for inventory testing: ${JSON.stringify(prodData)}`);
    }

    const dbV1 = await prisma.productVariant.findUnique({
      where: { sku: "SKU-INV-TEST-V1" },
      include: { inventory: true },
    });
    const dbV2 = await prisma.productVariant.findUnique({
      where: { sku: "SKU-INV-TEST-V2" },
      include: { inventory: true },
    });

    if (!dbV1?.inventory || !dbV2?.inventory) {
      throw new Error("Variant inventories failed to generate automatically");
    }

    // 3. Admin Inventory RESTOCK endpoint test
    console.log("📈 Testing Admin Restock Endpoint...");
    const restockRes = await fetch(`${baseUrl}/admin/inventory/restock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        variantId: dbV1.id,
        quantity: 15,
      }),
    });
    const restockData = await restockRes.json() as any;
    if (restockRes.status !== 200 || !restockData.success) {
      throw new Error(`Restock endpoint failed: ${JSON.stringify(restockData)}`);
    }

    // Verify database counts
    const updatedV1 = await prisma.productVariant.findUnique({
      where: { id: dbV1.id },
      include: { inventory: true },
    });
    if (updatedV1?.inventory?.availableQty !== 25 || updatedV1?.stockQuantity !== 25) {
      throw new Error(`Restock failed to synchronize DB. Expected 25, got: ${updatedV1?.inventory?.availableQty} / ${updatedV1?.stockQuantity}`);
    }
    console.log("✅ Restock endpoint successful.");

    // 4. Admin Inventory ADJUST endpoint test (Positive and Negative Adjustments)
    console.log("📉 Testing Admin Adjust Endpoint...");
    // Negative adjustment (-5)
    const adjustNegRes = await fetch(`${baseUrl}/admin/inventory/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        variantId: dbV1.id,
        quantity: -5,
        reason: "Damaged packaging in warehouse",
      }),
    });
    const adjustNegData = await adjustNegRes.json() as any;
    if (adjustNegRes.status !== 200 || !adjustNegData.success) {
      throw new Error(`Negative adjust failed: ${JSON.stringify(adjustNegData)}`);
    }

    const afterNegV1 = await prisma.productVariant.findUnique({
      where: { id: dbV1.id },
      include: { inventory: true },
    });
    if (afterNegV1?.inventory?.availableQty !== 20 || afterNegV1?.stockQuantity !== 20) {
      throw new Error("Negative adjustment failed to update database counts correctly");
    }

    // Positive adjustment (+2)
    const adjustPosRes = await fetch(`${baseUrl}/admin/inventory/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        variantId: dbV1.id,
        quantity: 2,
        reason: "Found items during annual count",
      }),
    });
    const adjustPosData = await adjustPosRes.json() as any;
    if (adjustPosRes.status !== 200 || !adjustPosData.success) {
      throw new Error("Positive adjust failed");
    }

    const afterPosV1 = await prisma.productVariant.findUnique({
      where: { id: dbV1.id },
      include: { inventory: true },
    });
    if (afterPosV1?.inventory?.availableQty !== 22 || afterPosV1?.stockQuantity !== 22) {
      throw new Error("Positive adjustment failed to update DB");
    }
    console.log("✅ Adjustment endpoint (pos/neg) successful.");

    // 5. Admin Inventory LOW STOCK endpoint test
    console.log("🚨 Testing Admin Low Stock Endpoint...");
    const lowStockRes = await fetch(`${baseUrl}/admin/inventory/low-stock`, {
      method: "GET",
      headers: { Cookie: adminCookie },
    });
    const lowStockData = await lowStockRes.json() as any;
    if (lowStockRes.status !== 200 || !lowStockData.success) {
      throw new Error("Low stock endpoint failed");
    }
    
    // V2 (stock 3 <= threshold 10) should be returned in low stock list
    const hasV2 = lowStockData.data.items.some((item: any) => item.variantId === dbV2.id);
    if (!hasV2) {
      throw new Error("Low stock item SKU-INV-TEST-V2 was not returned by low-stock endpoint");
    }
    console.log("✅ Low stock alert listing verified.");

    // 6. Admin GET single inventory by variant ID
    console.log("🔍 Testing GET Inventory by Variant ID...");
    const getInvRes = await fetch(`${baseUrl}/admin/inventory/${dbV1.id}`, {
      method: "GET",
      headers: { Cookie: adminCookie },
    });
    const getInvData = await getInvRes.json() as any;
    if (getInvRes.status !== 200 || !getInvData.success || getInvData.data.variantId !== dbV1.id) {
      throw new Error("GET single variant inventory failed");
    }
    console.log("✅ GET inventory details verified.");

    // 7. Stock Reservation System (Creation, Release, Commit)
    console.log("🔒 Testing Stock Reservation System...");
    const inventoryService = new (require("../services/inventory.service").InventoryService)();
    
    const checkoutSessionId = "SESSION-TEST-XYZ-123";

    // A. Create Reservation (Reserve 5 items of V1: available 22 -> 17, reserved 0 -> 5)
    console.log("  ↳ Reserving stock...");
    await inventoryService.reserveInventory(dbV1.id, 5, checkoutSessionId, adminUser.id);
    
    const resRedisKey = `stock_res:${checkoutSessionId}`;
    const redisVal = await redis.get(resRedisKey);
    if (!redisVal) {
      throw new Error("Reservation mapping failed to save in Redis");
    }
    const resData = JSON.parse(redisVal);
    if (resData[0].variantId !== dbV1.id || resData[0].quantity !== 5) {
      throw new Error("Redis reservation contents mismatch");
    }

    const reservedDbV1 = await prisma.productVariant.findUnique({
      where: { id: dbV1.id },
      include: { inventory: true },
    });
    if (reservedDbV1?.inventory?.availableQty !== 17 || reservedDbV1?.inventory?.reservedQty !== 5 || reservedDbV1?.stockQuantity !== 17) {
      throw new Error(`Reserve failed to update DB: available=${reservedDbV1?.inventory?.availableQty}, reserved=${reservedDbV1?.inventory?.reservedQty}`);
    }
    console.log("  ↳ Reservation successfully created and cached in Redis.");

    // B. Create second reservation for same session (Reserve another 2 items of V1: available 17 -> 15, reserved 5 -> 7)
    await inventoryService.reserveInventory(dbV1.id, 2, checkoutSessionId, adminUser.id);
    const redisVal2 = await redis.get(resRedisKey);
    const resData2 = JSON.parse(redisVal2 || "[]");
    if (resData2[0].quantity !== 7) {
      throw new Error(`Redis reservation update failed. Expected 7, got: ${resData2[0].quantity}`);
    }
    console.log("  ↳ Sequential reservation appends to active session correct.");

    // C. Release Reservation (Release the 7 items: available 15 -> 22, reserved 7 -> 0)
    console.log("  ↳ Releasing reservation...");
    await inventoryService.releaseInventoryReservation(checkoutSessionId, adminUser.id);
    
    const redisValReleased = await redis.get(resRedisKey);
    if (redisValReleased) {
      throw new Error("Redis key was not deleted on release");
    }

    const releasedDbV1 = await prisma.productVariant.findUnique({
      where: { id: dbV1.id },
      include: { inventory: true },
    });
    if (releasedDbV1?.inventory?.availableQty !== 22 || releasedDbV1?.inventory?.reservedQty !== 0 || releasedDbV1?.stockQuantity !== 22) {
      throw new Error("Release failed to restore stock counts in DB");
    }
    console.log("  ↳ Reservation released successfully and stock restored.");

    // D. Commit Reservation (Reserve 3 items then Commit: available 22 -> 19, reserved 0 -> 3, commit: reserved 3 -> 0)
    console.log("  ↳ Committing reservation...");
    const checkoutSessionId2 = "SESSION-TEST-XYZ-456";
    await inventoryService.reserveInventory(dbV1.id, 3, checkoutSessionId2, adminUser.id);
    await inventoryService.commitInventoryReservation(checkoutSessionId2, adminUser.id);
    
    const redisValCommitted = await redis.get(`stock_res:${checkoutSessionId2}`);
    if (redisValCommitted) {
      throw new Error("Redis key was not deleted on commit");
    }

    const committedDbV1 = await prisma.productVariant.findUnique({
      where: { id: dbV1.id },
      include: { inventory: true },
    });
    if (committedDbV1?.inventory?.availableQty !== 19 || committedDbV1?.inventory?.reservedQty !== 0 || committedDbV1?.stockQuantity !== 19) {
      throw new Error(`Commit failed to clear reserved counts: available=${committedDbV1?.inventory?.availableQty}, reserved=${committedDbV1?.inventory?.reservedQty}`);
    }
    console.log("  ↳ Reservation committed successfully and finalize order stock counts verified.");

    // 8. Overselling Safety
    console.log("🔒 Testing Overselling Protection...");
    let oversellFailed = false;
    try {
      // V2 only has 3 items in stock. Attempting to reserve 5 items.
      await inventoryService.reserveInventory(dbV2.id, 5, "SESSION-OVERSELL", adminUser.id);
    } catch (err: any) {
      if (err.message.includes("Insufficient stock")) {
        oversellFailed = true;
      }
    }
    if (!oversellFailed) {
      throw new Error("Overselling was not blocked by validation");
    }
    console.log("✅ Overselling safety verified.");

    // 9. Concurrent Reservations Race Condition safety
    console.log("🛡️ Testing Concurrency and Race Safety...");
    // Let's run 5 concurrent reservation promises trying to reserve 5 units each from V1 (current stock 19).
    // Only 3 should succeed (3 * 5 = 15 units reserved, 4 units left). 2 should fail due to transaction aborts.
    const promises = Array.from({ length: 5 }).map((_, idx) => 
      inventoryService.reserveInventory(dbV1.id, 5, `SESSION-CONC-${idx}`, adminUser.id)
    );

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected").length;

    console.log(`  ↳ Concurrent reservation results: ${fulfilled} succeeded, ${rejected} failed.`);
    if (fulfilled !== 3 || rejected !== 2) {
      throw new Error(`Race condition safety violation. Expected 3 success / 2 failures, got: ${fulfilled} success / ${rejected} failures.`);
    }

    const finalDbV1 = await prisma.productVariant.findUnique({
      where: { id: dbV1.id },
      include: { inventory: true },
    });
    if (finalDbV1?.inventory?.availableQty !== 4 || finalDbV1?.inventory?.reservedQty !== 15) {
      throw new Error(`Database stock incorrect after race. Expected available=4/reserved=15, got available=${finalDbV1?.inventory?.availableQty}/reserved=${finalDbV1?.inventory?.reservedQty}`);
    }
    console.log("✅ Concurrency and race safety verified.");

    // Clean up concurrent reservations
    for (let idx = 0; idx < 5; idx++) {
      try {
        await inventoryService.releaseInventoryReservation(`SESSION-CONC-${idx}`, adminUser.id);
      } catch (err) {}
    }

    // 10. Audit Logging Verification
    console.log("📝 Verifying Inventory Audit Logging...");
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: "Inventory",
        action: { in: ["INVENTORY_RESTOCKED", "INVENTORY_ADJUSTED", "INVENTORY_RESERVED", "INVENTORY_RELEASED", "INVENTORY_COMMITTED"] },
      },
    });
    
    if (auditLogs.length === 0) {
      throw new Error("No audit logs written for inventory actions");
    }
    console.log(`✅ Audit logging verified. Recorded ${auditLogs.length} audit logs.`);

    // 11. RBAC Restriction Gate
    console.log("🛡️ Testing RBAC access gate...");
    // Customer profile should be forbidden from accessing Admin Restock
    const rbacRes = await fetch(`${baseUrl}/admin/inventory/restock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ variantId: dbV1.id, quantity: 1 }),
    });
    if (rbacRes.status !== 403) {
      throw new Error(`Customer should have been blocked, got status: ${rbacRes.status}`);
    }

    // Staff profile should be permitted
    const rbacStaffRes = await fetch(`${baseUrl}/admin/inventory/restock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: staffCookie },
      body: JSON.stringify({ variantId: dbV1.id, quantity: 1 }),
    });
    if (rbacStaffRes.status !== 200) {
      throw new Error(`Staff should be allowed, got status: ${rbacStaffRes.status}`);
    }
    console.log("✅ RBAC access gates verified: Customer blocked, Staff allowed.");

    console.log("\n🎉 ALL INVENTORY MODULE E2E INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Integration Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    // Cleanup database records
    console.log("🧹 Cleaning up test database records...");
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-INV-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-INV-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-inv-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } });
    await prisma.$disconnect();
    if (redis.isOpen) {
      await redis.disconnect();
    }
    server.close();
  }
}

runTests();

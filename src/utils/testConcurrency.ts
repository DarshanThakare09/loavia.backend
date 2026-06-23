process.env.NODE_ENV = "test";
import app from "../app";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { UserRole, ProductStatus, OrderStatus } from "@prisma/client";
import { hashPassword } from "./crypto";
import crypto from "crypto";
import { env } from "../config/env";

const ADMIN_EMAIL = "concurrency_admin@loavia.in";
const CUSTOMER_EMAIL = "concurrency_customer@loavia.in";
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

// Helper to sign Razorpay webhook bodies
function signWebhook(body: string): string {
  return crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
}

async function runTests() {
  console.log("🚀 Starting Concurrency, Race Condition, & Idempotency E2E Stress Tests...");

  if (!redis.isOpen) {
    await redis.connect();
  }

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  let adminCookie = "";
  let customerUser: any = null;

  let testCategory: any = null;
  let testProduct: any = null;
  let testVariant: any = null;

  try {
    // 1. Database Cleanup
    console.log("🧹 Cleaning database test records...");
    await prisma.review.deleteMany({ where: { comment: { startsWith: "Test Review" } } });
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } } });
    await prisma.orderItem.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-CONC-" } } } });
    await prisma.payment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-CONC-" } } } });
    await prisma.shipment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-CONC-" } } } });
    await prisma.order.deleteMany({ where: { receiptNumber: { startsWith: "LOAVIA-CONC-" } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-CONC-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-CONC-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-conc-" } } });
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

    customerUser = await prisma.user.create({
      data: {
        name: "Test Customer",
        email: CUSTOMER_EMAIL,
        passwordHash: hashedPassword,
        role: UserRole.CUSTOMER,
        isVerified: true,
      },
    });

    // Login Admin
    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: TEST_PASSWORD }),
    });
    const adminCookies = parseCookies(adminLogin.headers.getSetCookie());
    adminCookie = `access_token=${adminCookies.access_token}`;

    // Setup Catalog Data
    testCategory = await prisma.category.create({
      data: {
        name: "Concurrency Test Category",
        slug: "slug-conc-cat",
      },
    });

    testProduct = await prisma.product.create({
      data: {
        categoryId: testCategory.id,
        name: "Concurrency Product",
        slug: "slug-conc-prod",
        description: "Test description",
        ingredients: "Test ingredients",
        sku: "SKU-CONC-P1",
        status: ProductStatus.PUBLISHED,
        basePrice: 1000,
      },
    });

    // --- TEST 1: Inventory Checkout Race Condition Test ---
    console.log("\n📦 --- TEST 1: Concurrent Inventory Checkout Race Condition ---");
    
    // Seed variant with exactly 5 items in stock
    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        name: "Variant 5 Stock",
        sku: "SKU-CONC-V1",
        price: 1000,
        stockQuantity: 5,
      },
    });

    // Synchronize inventory availableQty
    await prisma.inventory.create({
      data: {
        variantId: testVariant.id,
        availableQty: 5,
        reservedQty: 0,
      },
    });

    // Fire 10 parallel checkouts of 1 item each
    console.log("⚡ Spawning 10 parallel guest checkout requests...");
    const checkouts = Array.from({ length: 10 }).map((_, i) =>
      fetch(`${baseUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: `Concurrency Guest ${i}`,
            street: "123 Street St",
            city: "City",
            state: "State",
            postalCode: "123456",
            phone: "9876543210",
            email: `guest-${i}@test.com`,
          },
          items: [
            {
              variantId: testVariant.id,
              quantity: 1,
            },
          ],
        }),
      })
    );

    const responses = await Promise.all(checkouts);
    const results = await Promise.all(responses.map(async (r) => ({ status: r.status, data: await r.json() as any })));

    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status === 400);

    console.log(`📊 Successful checkouts: ${successes.length}`);
    console.log(`📊 Blocked checkouts (Insufficient stock): ${failures.length}`);

    // Verify constraints: exactly 5 succeed, 5 fail
    if (successes.length !== 5) {
      throw new Error(`Expected exactly 5 successful checkouts, got ${successes.length}`);
    }
    if (failures.length !== 5) {
      throw new Error(`Expected exactly 5 failed checkouts, got ${failures.length}`);
    }

    // Verify stock levels in database are exactly 0, not negative
    const dbVariant = await prisma.productVariant.findUnique({ where: { id: testVariant.id } });
    const dbInventory = await prisma.inventory.findUnique({ where: { variantId: testVariant.id } });

    console.log(`📊 DB Variant stockQuantity: ${dbVariant?.stockQuantity}`);
    console.log(`📊 DB Inventory availableQty: ${dbInventory?.availableQty}`);
    console.log(`📊 DB Inventory reservedQty: ${dbInventory?.reservedQty}`);

    if (dbVariant?.stockQuantity !== 0 || dbInventory?.availableQty !== 0 || dbInventory?.reservedQty !== 5) {
      throw new Error("Inventory/Variant counts are inconsistent after concurrent checkouts!");
    }
    console.log("✅ Concurrent Inventory checkout race test passed.");

    // --- TEST 2: Late Payment Webhook Race Test ---
    console.log("\n📦 --- TEST 2: Late Payment Webhook Race Test ---");

    // Clear previous variant and create a new one with 1 stock
    await prisma.inventory.deleteMany({ where: { variantId: testVariant.id } });
    await prisma.productVariant.delete({ where: { id: testVariant.id } });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        name: "Variant 1 Stock",
        sku: "SKU-CONC-V2",
        price: 1000,
        stockQuantity: 1,
      },
    });

    await prisma.inventory.create({
      data: {
        variantId: testVariant.id,
        availableQty: 1,
        reservedQty: 0,
      },
    });

    // A. Guest places Order A (reserves the 1 variant)
    console.log("🛒 Placing Order A (Guest)...");
    const orderARes = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shippingAddress: {
          recipientName: "Customer A",
          street: "Street A",
          city: "City",
          state: "State",
          postalCode: "123456",
          phone: "9876543210",
          email: "customer-a@test.com",
        },
        items: [{ variantId: testVariant.id, quantity: 1 }],
      }),
    });
    const orderAData = await orderARes.json() as any;
    if (orderARes.status !== 201) {
      throw new Error(`Failed to place Order A: ${JSON.stringify(orderAData)}`);
    }
    const orderA = orderAData.data;
    console.log(`✅ Order A placed. Receipt: ${orderA.receiptNumber}`);

    // B. Simulate reservation expiration by deleting Redis reservation key
    console.log("⏳ Simulating reservation expiration for Order A (deleting Redis key)...");
    const resKey = `stock_res:${orderA.receiptNumber}`;
    await redis.del(resKey);

    // Also return stock manually to simulate reservation expiry worker return
    await prisma.inventory.update({
      where: { variantId: testVariant.id },
      data: { availableQty: 1, reservedQty: 0 },
    });
    await prisma.productVariant.update({
      where: { id: testVariant.id },
      data: { stockQuantity: 1 },
    });

    // C. Order B is placed (succeeds because Order A's reservation expired, taking the 1 remaining variant)
    console.log("🛒 Placing Order B (Guest)...");
    const orderBRes = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shippingAddress: {
          recipientName: "Customer B",
          street: "Street B",
          city: "City",
          state: "State",
          postalCode: "123456",
          phone: "9876543210",
          email: "customer-b@test.com",
        },
        items: [{ variantId: testVariant.id, quantity: 1 }],
      }),
    });
    const orderBData = await orderBRes.json() as any;
    if (orderBRes.status !== 201) {
      throw new Error(`Failed to place Order B: ${JSON.stringify(orderBData)}`);
    }
    console.log("✅ Order B placed successfully. Variant stock is now 0.");

    // D. Late payment webhook arrives for Order A
    console.log("🔌 Triggering late payment webhook for Order A...");
    const webhookEvent = {
      id: `evt_conc_late_${Date.now()}`,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_conc_late_${Date.now()}`,
            order_id: "order_rzp_late_mock",
            amount: orderA.totalAmount,
            method: "card",
            notes: {
              receiptNumber: orderA.receiptNumber,
            },
          },
        },
      },
    };

    const webhookBodyStr = JSON.stringify(webhookEvent);
    const sigHeader = signWebhook(webhookBodyStr);

    const webhookRes = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sigHeader,
      },
      body: webhookBodyStr,
    });
    const webhookData = await webhookRes.json() as any;
    if (webhookRes.status !== 200 || !webhookData.success) {
      throw new Error(`Webhook handling failed: ${JSON.stringify(webhookData)}`);
    }

    // E. Verify Order A is marked as PAYMENT_RECEIVED_REVIEW and NOT PAID
    const finalOrderA = await prisma.order.findUnique({ where: { id: orderA.id } });
    const finalAddr = finalOrderA?.shippingAddress as any;

    console.log(`📊 Order A status in DB: ${finalOrderA?.status}`);
    console.log(`📊 Order A review required: ${finalAddr?.paymentReviewRequired}`);
    console.log(`📊 Order A review reason: ${finalAddr?.reviewReason}`);

    if (finalOrderA?.status === OrderStatus.PAID || !finalAddr?.paymentReviewRequired || finalAddr?.reviewReason !== "INVENTORY_UNAVAILABLE") {
      throw new Error("Order A should have been flagged for manual review instead of marked PAID!");
    }

    // F. Verify critical audit log generated
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityId: orderA.id,
        action: "PAYMENT_RECEIVED_REVIEW",
      },
    });
    if (!audit || (audit.details as any).severity !== "CRITICAL") {
      throw new Error("No CRITICAL PAYMENT_RECEIVED_REVIEW audit log recorded!");
    }
    console.log("✅ Late payment webhook race test passed.");

    // --- TEST 3: Payment Idempotency Stress Test ---
    console.log("\n📦 --- TEST 3: Webhook Payment Idempotency Stress Test ---");

    // Clear and create a new variant with 10 stock
    await prisma.inventory.deleteMany({ where: { variantId: testVariant.id } });
    await prisma.productVariant.delete({ where: { id: testVariant.id } });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        name: "Variant 10 Stock",
        sku: "SKU-CONC-V3",
        price: 1000,
        stockQuantity: 10,
      },
    });

    await prisma.inventory.create({
      data: {
        variantId: testVariant.id,
        availableQty: 10,
        reservedQty: 0,
      },
    });

    // Place Order C
    console.log("🛒 Placing Order C (Guest)...");
    const orderCRes = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shippingAddress: {
          recipientName: "Customer C",
          street: "Street C",
          city: "City",
          state: "State",
          postalCode: "123456",
          phone: "9876543210",
          email: "customer-c@test.com",
        },
        items: [{ variantId: testVariant.id, quantity: 2 }],
      }),
    });
    const orderCData = await orderCRes.json() as any;
    const orderC = orderCData.data;

    // Send 5 duplicate webhook events concurrently for Order C payment.captured
    console.log("⚡ Sending 5 duplicate payment.captured webhooks concurrently...");
    const eventId = `evt_idemp_test_${Date.now()}`;
    const webhookEventC = {
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_idemp_test_${Date.now()}`,
            order_id: "order_rzp_idemp_mock",
            amount: orderC.totalAmount,
            method: "card",
            notes: {
              receiptNumber: orderC.receiptNumber,
            },
          },
        },
      },
    };

    const webhookBodyStrC = JSON.stringify(webhookEventC);
    const sigHeaderC = signWebhook(webhookBodyStrC);

    const webhookCalls = Array.from({ length: 5 }).map(() =>
      fetch(`${baseUrl}/payments/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": sigHeaderC,
        },
        body: webhookBodyStrC,
      })
    );

    const webhookResponses = await Promise.all(webhookCalls);
    const webhookResults = await Promise.all(webhookResponses.map(async (r) => ({ status: r.status, data: await r.json() as any })));

    console.log(`📊 Webhook responses status codes: ${webhookResults.map((r) => r.status).join(", ")}`);

    // Verify all returned 200 success (idempotent bypass)
    const allSuccessful = webhookResults.every((r) => r.status === 200 && r.data.success);
    if (!allSuccessful) {
      throw new Error(`Some webhook requests failed: ${JSON.stringify(webhookResults)}`);
    }

    // Verify database counts
    // 1. Only one payment record created
    const paymentsCount = await prisma.payment.count({ where: { orderId: orderC.id } });
    console.log(`📊 Payments created in DB: ${paymentsCount}`);
    if (paymentsCount !== 1) {
      throw new Error(`Expected exactly 1 payment record, found ${paymentsCount}`);
    }

    // 2. Only one order transition (status is PAID)
    const finalOrderC = await prisma.order.findUnique({ where: { id: orderC.id } });
    if (finalOrderC?.status !== OrderStatus.PAID) {
      throw new Error(`Order C status is ${finalOrderC?.status}, expected PAID`);
    }

    // 3. Only one inventory commit (stock decremented by exactly 2, so availableQty = 8, reservedQty = 0)
    const finalInvC = await prisma.inventory.findUnique({ where: { variantId: testVariant.id } });
    console.log(`📊 DB Inventory availableQty: ${finalInvC?.availableQty}`);
    console.log(`📊 DB Inventory reservedQty: ${finalInvC?.reservedQty}`);
    if (finalInvC?.availableQty !== 8 || finalInvC?.reservedQty !== 0) {
      throw new Error(`Inventory stock counts are incorrect. Expected availableQty 8, reservedQty 0. Got ${finalInvC?.availableQty}/${finalInvC?.reservedQty}`);
    }

    console.log("✅ Webhook payment idempotency stress test passed.");

    // --- TEST 4: Session Revocation Stress Test ---
    console.log("\n📦 --- TEST 4: Session Revocation Stress Test ---");

    // Login user on 3 separate devices concurrently
    console.log("⚡ Spawning 3 concurrent login sessions for customer user...");
    const loginCalls = Array.from({ length: 3 }).map(() =>
      fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
      })
    );

    const loginResps = await Promise.all(loginCalls);
    const loginDatas = await Promise.all(loginResps.map(async (r) => {
      const setCookies = r.headers.getSetCookie();
      const cookies = parseCookies(setCookies);
      return {
        status: r.status,
        accessToken: cookies.access_token,
        refreshToken: cookies.refresh_token,
      };
    }));

    // Verify 3 successful logins
    const loginOk = loginDatas.every((d) => d.status === 200 && d.accessToken && d.refreshToken);
    if (!loginOk) {
      throw new Error("One or more concurrent logins failed");
    }

    // Verify 3 active sessions in database
    const initialSessionCount = await prisma.session.count({
      where: { userId: customerUser.id, isValid: true },
    });
    console.log(`📊 Initial active sessions in DB: ${initialSessionCount}`);
    if (initialSessionCount !== 3) {
      throw new Error(`Expected exactly 3 active sessions, found ${initialSessionCount}`);
    }

    // Admin suspends customer account
    console.log("🚫 Admin suspending customer account...");
    const suspendRes = await fetch(`${baseUrl}/admin/customers/${customerUser.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    const suspendData = await suspendRes.json() as any;
    if (suspendRes.status !== 200 || !suspendData.success) {
      throw new Error(`Failed to suspend account: ${JSON.stringify(suspendData)}`);
    }

    // Verify all sessions are invalidated in DB
    const postSessionCount = await prisma.session.count({
      where: { userId: customerUser.id, isValid: true },
    });
    console.log(`📊 Active sessions in DB after suspension: ${postSessionCount}`);
    if (postSessionCount !== 0) {
      throw new Error("Not all sessions were invalidated in the database upon user suspension!");
    }

    // Verify all 3 access tokens are rejected (JWT verification checks tokenVersion and Redis status)
    console.log("🔒 Verifying all 3 access tokens are rejected by API...");
    for (let i = 0; i < 3; i++) {
      const meRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: `access_token=${loginDatas[i].accessToken}` },
      });
      if (meRes.status !== 401) {
        throw new Error(`Access token ${i} was not rejected. Got status: ${meRes.status}`);
      }
    }
    console.log("✅ All access tokens successfully blocked (unauthorized).");

    // Verify all refresh tokens are invalidated (RTR compromise invalidation fails because session isCompromised or isValid=false)
    console.log("🔒 Verifying all 3 refresh tokens are rejected by API...");
    for (let i = 0; i < 3; i++) {
      const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `refresh_token=${loginDatas[i].refreshToken}` },
      });
      if (refreshRes.status !== 401) {
        throw new Error(`Refresh token ${i} was not rejected. Got status: ${refreshRes.status}`);
      }
    }
    console.log("✅ All refresh tokens successfully blocked (unauthorized).");

    // Verify login is blocked
    const reloginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
    });
    if (reloginRes.status !== 400) {
      throw new Error(`Login should be blocked for suspended user. Got status: ${reloginRes.status}`);
    }
    console.log("✅ Subsequent login attempts successfully blocked.");

    console.log("✅ Session revocation stress test passed.");

    console.log("\n🎉 ALL CONCURRENCY, RACE CONDITIONS & IDEMPOTENCY TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Concurrency Stress Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    // Clean up
    console.log("🧹 Cleaning up database test records...");
    await prisma.review.deleteMany({ where: { comment: { startsWith: "Test Review" } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } } }).catch(() => {});
    await prisma.orderItem.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-CONC-" } } } }).catch(() => {});
    await prisma.payment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-CONC-" } } } }).catch(() => {});
    await prisma.shipment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-CONC-" } } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { receiptNumber: { startsWith: "LOAVIA-CONC-" } } }).catch(() => {});
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-CONC-" } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-CONC-" } } }).catch(() => {});
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-conc-" } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } }).catch(() => {});

    // Clear Redis caches
    await redis.del("admin:dashboard_summary").catch(() => {});
    await redis.del("admin:best_sellers").catch(() => {});
    await redis.del("admin:category_sales").catch(() => {});

    if (customerUser?.id) {
      await redis.del(`user_suspended:${customerUser.id}`).catch(() => {});
    }

    await prisma.$disconnect();
    await redis.disconnect().catch(() => {});
    server.close();
  }
}

runTests();

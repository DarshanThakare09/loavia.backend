process.env.NODE_ENV = "test";
import app from "../app";
import crypto from "crypto";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { UserRole, ProductStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import { hashPassword } from "./crypto";
import { env } from "../config/env";

const ADMIN_EMAIL = "admin_payment_test@loavia.in";
const STAFF_EMAIL = "staff_payment_test@loavia.in";
const CUSTOMER_EMAIL = "customer_payment_test@loavia.in";
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

// Generate client signature for verification testing
function generateClientSignature(orderId: string, paymentId: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

// Generate webhook signature for webhook testing
function generateWebhookSignature(body: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
}

async function runTests() {
  console.log("🚀 Starting Payment Module E2E Integration Tests...");

  if (!redis.isOpen) {
    await redis.connect();
  }

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  let adminCookie = "";
  let customerCookie = "";
  let customerUser: any = null;

  try {
    // 1. Setup Database Users & Catalog mock data
    console.log("🧹 Cleaning test database records...");
    await prisma.trackingEvent.deleteMany({ where: { shipment: { order: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } } } });
    await prisma.shipment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } } });
    await prisma.payment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } } });
    await prisma.orderItem.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } } });
    await prisma.order.deleteMany({ where: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } });
    await prisma.cartItem.deleteMany({ where: { variant: { sku: { startsWith: "SKU-PAY-TEST-" } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-PAY-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-PAY-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-pay-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } });

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
        name: "Test Staff",
        email: STAFF_EMAIL,
        passwordHash: hashedPassword,
        role: UserRole.STAFF,
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

    const category = await prisma.category.create({
      data: {
        name: "Payment Test Category",
        slug: "slug-pay-test-cat",
      },
    });

    console.log("📦 Seeding test products & variants...");
    const prod1Res = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Payment Test Cookie",
        slug: "slug-pay-test-cookie",
        description: "Premium cookie built for payment E2E tests.",
        ingredients: "Flour, Butter, Sugar",
        sku: "SKU-PAY-TEST-PROD1",
        status: ProductStatus.PUBLISHED,
        variants: {
          create: [
            { name: "Cookie A", sku: "SKU-PAY-TEST-V1", price: 10000, stockQuantity: 10, isDefault: true }, // ₹100
          ],
        },
      },
      include: {
        variants: true,
      },
    });

    const v1 = prod1Res.variants[0];
    await prisma.inventory.create({ data: { variantId: v1.id, availableQty: 10 } });

    const userAddress = await prisma.address.create({
      data: {
        userId: customerUser.id,
        recipientName: "Darshan",
        street: "Nashik Road",
        city: "Nashik",
        state: "Maharashtra",
        postalCode: "422001",
        phone: "9876543210",
        isDefault: true,
      },
    });

    // Place order using customer cart
    const cart = await prisma.cart.create({ data: { userId: customerUser.id } });
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: prod1Res.id,
        variantId: v1.id,
        quantity: 3, // 3 * ₹100 = ₹300 total
      },
    });

    // 3. Test placeOrder (creates order on DB + Razorpay Order ID)
    console.log("🛍️ Testing Order Creation with Razorpay initialization...");
    const placeRes = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ addressId: userAddress.id }),
    });
    const placeData = await placeRes.json() as any;
    if (placeRes.status !== 201 || !placeData.success || !placeData.data.razorpayOrderId) {
      throw new Error(`Order placement failed: ${JSON.stringify(placeData)}`);
    }

    const orderId = placeData.data.id;
    const razorOrderId = placeData.data.razorpayOrderId;

    // Verify stock is reserved (v1 available 10 -> 7, reserved 0 -> 3)
    const reservedInv = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (reservedInv?.availableQty !== 7 || reservedInv?.reservedQty !== 3) {
      throw new Error(`Stock reservation issue: available=${reservedInv?.availableQty}, reserved=${reservedInv?.reservedQty}`);
    }

    console.log("  ↳ Order created with Razorpay Order ID successfully.");

    // 4. Test client-side /payments/verify (Valid signature path)
    console.log("💳 Testing Payment Verification (Client Signature)...");
    const payId = `pay_test_${Date.now()}`;
    const clientSig = generateClientSignature(razorOrderId, payId, env.RAZORPAY_KEY_SECRET);

    const verifyRes = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({
        orderId,
        razorpayOrderId: razorOrderId,
        razorpayPaymentId: payId,
        razorpaySignature: clientSig,
        method: "card",
      }),
    });
    const verifyData = await verifyRes.json() as any;
    if (verifyRes.status !== 200 || !verifyData.success) {
      throw new Error(`Signature verification failed: ${JSON.stringify(verifyData)}`);
    }

    // Verify order went PAID and stock committed (reserved 3 -> 0)
    const paidOrder = await prisma.order.findUnique({ where: { id: orderId } });
    if (paidOrder?.status !== OrderStatus.PAID) {
      throw new Error(`Order status mismatch, expected PAID, got ${paidOrder?.status}`);
    }

    const committedInv = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (committedInv?.availableQty !== 7 || committedInv?.reservedQty !== 0) {
      throw new Error(`Reservation commit failed: available=${committedInv?.availableQty}, reserved=${committedInv?.reservedQty}`);
    }

    // Verify Payment record is created in DB
    const dbPayment = await prisma.payment.findUnique({ where: { orderId } });
    if (!dbPayment || dbPayment.status !== PaymentStatus.COMPLETED || dbPayment.gatewayPaymentId !== payId) {
      throw new Error(`Payment record verification failed: ${JSON.stringify(dbPayment)}`);
    }

    // Verify idempotency (second verification should return successfully without modifying details)
    const verifyRes2 = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({
        orderId,
        razorpayOrderId: razorOrderId,
        razorpayPaymentId: payId,
        razorpaySignature: clientSig,
        method: "card",
      }),
    });
    const verifyData2 = await verifyRes2.json() as any;
    if (verifyRes2.status !== 200 || !verifyData2.success) {
      throw new Error("Idempotency signature verification failed");
    }

    console.log("  ↳ Client signature verification passed (with idempotency check).");

    // 5. Test signature verification failure
    console.log("🛡️ Testing Signature Verification failure gates...");
    const verifyResBad = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({
        orderId,
        razorpayOrderId: razorOrderId,
        razorpayPaymentId: payId,
        razorpaySignature: "invalid_sig_here",
        method: "card",
      }),
    });
    const verifyDataBad = await verifyResBad.json() as any;
    if (verifyResBad.status !== 400 || verifyDataBad.success) {
      throw new Error("Should have blocked invalid signature payload");
    }
    console.log("  ↳ Invalid signature verification correctly rejected.");

    // 6. Test Webhook idempotency and async synchronization
    console.log("⚓ Testing Webhook processing and Webhook Idempotency...");
    // Let's create a new order to test webhooks
    await prisma.cartItem.create({ data: { cartId: cart.id, productId: prod1Res.id, variantId: v1.id, quantity: 2 } });
    const placeRes2 = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ addressId: userAddress.id }),
    });
    const placeData2 = await placeRes2.json() as any;
    const orderId2 = placeData2.data.id;
    const razorOrderId2 = placeData2.data.razorpayOrderId;
    const orderReceipt2 = placeData2.data.receiptNumber;

    // Simulate order.paid webhook payload
    const webhookEventId = `evt_test_${Date.now()}`;
    const webhookPayload = {
      id: webhookEventId,
      entity: "event",
      account_id: "acc_test_1",
      event: "order.paid",
      contains: ["order"],
      payload: {
        order: {
          entity: {
            id: razorOrderId2,
            amount: 20000,
            currency: "INR",
            receipt: orderReceipt2,
            status: "paid",
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    };

    const webhookBodyStr = JSON.stringify(webhookPayload);
    const webhookSig = generateWebhookSignature(webhookBodyStr, env.RAZORPAY_WEBHOOK_SECRET);

    // Call Webhook POST endpoint
    const webhookRes = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": webhookSig,
      },
      body: webhookBodyStr,
    });
    const webhookData = await webhookRes.json() as any;
    if (webhookRes.status !== 200 || !webhookData.success) {
      throw new Error(`Webhook processing failed: ${JSON.stringify(webhookData)}`);
    }

    // Verify order 2 went PAID
    const paidOrder2 = await prisma.order.findUnique({ where: { id: orderId2 } });
    if (paidOrder2?.status !== OrderStatus.PAID) {
      throw new Error("Order 2 status was not updated to PAID via webhook");
    }

    // Verify idempotency: call again with the same event ID. It should return success, but ignore re-processing
    const webhookResDup = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": webhookSig,
      },
      body: webhookBodyStr,
    });
    const webhookDataDup = await webhookResDup.json() as any;
    if (webhookResDup.status !== 200 || webhookDataDup.data.message === "Webhook processed successfully") {
      // It should output "Webhook event already processed" or similar
      if (!webhookDataDup.data.message.includes("already processed")) {
        throw new Error("Idempotent webhook response is missing already processed status details");
      }
    }
    console.log("  ↳ Webhook signature verification and idempotency verified.");

    // 7. Test Admin Refunds (Full and Partial)
    console.log("💰 Testing Administrative Payment Refund loops...");
    // Customer cannot refund
    const refundResCust = await fetch(`${baseUrl}/admin/payments/${orderId}/refund`, {
      method: "POST",
      headers: { Cookie: customerCookie },
    });
    if (refundResCust.status !== 403) {
      throw new Error(`Customer should be forbidden from admin refunds, got: ${refundResCust.status}`);
    }

    // Admin Refund (Partial: refund ₹120 (12000 Paise) of the ₹300 (30000 Paise) order)
    const refundResAdmin1 = await fetch(`${baseUrl}/admin/payments/${orderId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ amount: 12000 }),
    });
    const refundDataAdmin1 = await refundResAdmin1.json() as any;
    if (refundResAdmin1.status !== 200 || !refundDataAdmin1.success) {
      throw new Error(`Admin partial refund failed: ${JSON.stringify(refundDataAdmin1)}`);
    }

    // Verify order status is still PAID (since partial), payment remains COMPLETED
    const partialOrder = await prisma.order.findUnique({ where: { id: orderId } });
    const partialPayment = await prisma.payment.findUnique({ where: { orderId } });
    if (partialOrder?.status !== OrderStatus.PAID || partialPayment?.status !== PaymentStatus.COMPLETED) {
      throw new Error("Order/Payment statuses were incorrectly moved to terminal refund states on a partial refund");
    }

    // Admin Refund (Omitted amount -> Full Refund of remaining ₹180 (18000 Paise))
    const refundResAdmin2 = await fetch(`${baseUrl}/admin/payments/${orderId}/refund`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    const refundDataAdmin2 = await refundResAdmin2.json() as any;
    if (refundResAdmin2.status !== 200 || !refundDataAdmin2.success) {
      throw new Error(`Admin full refund failed: ${JSON.stringify(refundDataAdmin2)}`);
    }

    // Verify order is now REFUNDED, and payment is REFUNDED
    const refundedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    const refundedPayment = await prisma.payment.findUnique({ where: { orderId } });
    if (refundedOrder?.status !== OrderStatus.REFUNDED || refundedPayment?.status !== PaymentStatus.REFUNDED) {
      throw new Error("Order/Payment failed to transition to REFUNDED status");
    }

    // Try refunding again, should fail as balance is exhausted
    const refundResAdmin3 = await fetch(`${baseUrl}/admin/payments/${orderId}/refund`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    if (refundResAdmin3.status !== 400) {
      throw new Error(`Should have blocked refund on exhausted payment, got status: ${refundResAdmin3.status}`);
    }
    console.log("  ↳ Full and partial refund loops verified successfully.");

    // 8. Test Late Payment Handling (Reservation Expired)
    console.log("⏰ Testing Late Payment Handling (Stock Reservation Expirations)...");
    
    // Case A: Stock is AVAILABLE -> Deduct available and mark PAID
    // Set up new cart and place order
    await prisma.cartItem.create({ data: { cartId: cart.id, productId: prod1Res.id, variantId: v1.id, quantity: 1 } });
    const latePlace1 = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ addressId: userAddress.id }),
    });
    const lateData1 = (await latePlace1.json()) as any;
    const lateOrderId1 = lateData1.data.id;
    const lateReceipt1 = lateData1.data.receiptNumber;

    // Simulate Redis reservation expiry by manually deleting the reservation key
    await redis.del(`stock_res:${lateReceipt1}`);

    // Call payment verify (stock v1 available is currently 5: we started with 10, subtracted 3 for order1, 2 for order2. Order 3 took 1. Available stock = 4)
    // Confirm stock check
    const stockPre = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (stockPre?.availableQty !== 4) {
      throw new Error(`Unexpected pre-stock balance: ${stockPre?.availableQty}`);
    }

    const payIdLate1 = `pay_late_1_${Date.now()}`;
    const sigLate1 = generateClientSignature(lateData1.data.razorpayOrderId, payIdLate1, env.RAZORPAY_KEY_SECRET);

    const verifyLateRes1 = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({
        orderId: lateOrderId1,
        razorpayOrderId: lateData1.data.razorpayOrderId,
        razorpayPaymentId: payIdLate1,
        razorpaySignature: sigLate1,
        method: "card",
      }),
    });
    const verifyLateData1 = await verifyLateRes1.json() as any;
    if (verifyLateRes1.status !== 200 || !verifyLateData1.success) {
      throw new Error(`Late verify 1 failed: ${JSON.stringify(verifyLateData1)}`);
    }

    // Verify order 1 went PAID and available stock decremented (4 -> 3)
    const lateOrderDb1 = await prisma.order.findUnique({ where: { id: lateOrderId1 } });
    if (lateOrderDb1?.status !== OrderStatus.PAID) {
      throw new Error("Late order 1 was not marked PAID");
    }

    const stockPost = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (stockPost?.availableQty !== 3) {
      throw new Error(`Late stock direct deduction failed. Available: ${stockPost?.availableQty}`);
    }
    console.log("  ↳ Late Payment Case A (stock available -> mark PAID & deduct available) passed.");

    // Case B: Stock is UNAVAILABLE -> Mark virtual status PAYMENT_RECEIVED_REVIEW and require manual review
    // Set up new cart and place order (quantity = 4. Available stock is 3, so placing order requires restocking first, or we place with quantity = 2)
    await prisma.cartItem.create({ data: { cartId: cart.id, productId: prod1Res.id, variantId: v1.id, quantity: 2 } });
    const latePlace2 = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ addressId: userAddress.id }),
    });
    const lateData2 = (await latePlace2.json()) as any;
    const lateOrderId2 = lateData2.data.id;
    const lateReceipt2 = lateData2.data.receiptNumber;

    // Available stock pre: 3. Reserved for this order: 2. So available goes 3 -> 1.
    // Expire Redis key
    await redis.del(`stock_res:${lateReceipt2}`);

    // Now, simulate that the stock was sold elsewhere while the user had expired reservation (adjust available to 0)
    await prisma.inventory.update({
      where: { variantId: v1.id },
      data: { availableQty: 0 }
    });
    await prisma.productVariant.update({
      where: { id: v1.id },
      data: { stockQuantity: 0 }
    });

    const payIdLate2 = `pay_late_2_${Date.now()}`;
    const sigLate2 = generateClientSignature(lateData2.data.razorpayOrderId, payIdLate2, env.RAZORPAY_KEY_SECRET);

    const verifyLateRes2 = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({
        orderId: lateOrderId2,
        razorpayOrderId: lateData2.data.razorpayOrderId,
        razorpayPaymentId: payIdLate2,
        razorpaySignature: sigLate2,
        method: "card",
      }),
    });
    const verifyLateData2 = await verifyLateRes2.json() as any;
    if (verifyLateRes2.status !== 200 || !verifyLateData2.success) {
      throw new Error(`Late verify 2 failed: ${JSON.stringify(verifyLateData2)}`);
    }

    // Verify order 2 returned status is PAYMENT_RECEIVED_REVIEW
    if (verifyLateData2.data.order.status !== "PAYMENT_RECEIVED_REVIEW") {
      throw new Error(`Expected virtual status PAYMENT_RECEIVED_REVIEW, got: ${verifyLateData2.data.order.status}`);
    }

    // Verify order in database remains status PENDING (which maps to PAYMENT_RECEIVED_REVIEW)
    const lateOrderDb2 = await prisma.order.findUnique({ where: { id: lateOrderId2 } });
    if (lateOrderDb2?.status !== OrderStatus.PENDING) {
      throw new Error(`Expected DB status to remain PENDING, got: ${lateOrderDb2?.status}`);
    }

    // Verify shippingAddress contains the review flags
    const addrData = lateOrderDb2?.shippingAddress as any;
    if (!addrData.paymentReviewRequired || addrData.reviewReason !== "INVENTORY_UNAVAILABLE") {
      throw new Error("Payment review details missing on shipping address JSON payload");
    }

    // Verify inventory available stock remained 0 (no overselling occurred)
    const finalStock = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (finalStock?.availableQty !== 0) {
      throw new Error(`Overselling occurred! Inventory available was modified: ${finalStock?.availableQty}`);
    }

    // Verify critical audit log is created
    const criticalLogs = await prisma.auditLog.findMany({
      where: {
        entity: "Order",
        entityId: lateOrderId2,
        action: "PAYMENT_RECEIVED_REVIEW",
      }
    });
    if (criticalLogs.length === 0 || (criticalLogs[0].details as any).severity !== "CRITICAL") {
      throw new Error("Critical payment review audit log missing or details mismatch");
    }

    console.log("  ↳ Late Payment Case B (stock unavailable -> PAYMENT_RECEIVED_REVIEW review flag & NO overselling) passed.");

    console.log("\n🎉 ALL PAYMENT MODULE E2E INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Integration Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    console.log("🧹 Cleaning up test database records...");
    await prisma.trackingEvent.deleteMany({ where: { shipment: { order: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } } } });
    await prisma.shipment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } } });
    await prisma.payment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } } });
    await prisma.orderItem.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } } });
    await prisma.order.deleteMany({ where: { receiptNumber: { startsWith: "LOAVIA-PAY-TEST-" } } });
    await prisma.cartItem.deleteMany({ where: { variant: { sku: { startsWith: "SKU-PAY-TEST-" } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-PAY-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-PAY-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-pay-test-" } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } });
    await prisma.$disconnect();

    if (redis.isOpen) {
      await redis.disconnect();
    }
    server.close();
  }
}

runTests();

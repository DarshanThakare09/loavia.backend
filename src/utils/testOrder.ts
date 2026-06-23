import app from "../app";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { UserRole, ProductStatus, OrderStatus, ShipmentStatus } from "@prisma/client";
import { hashPassword } from "./crypto";

const ADMIN_EMAIL = "admin_order_test@loavia.in";
const STAFF_EMAIL = "staff_order_test@loavia.in";
const CUSTOMER_EMAIL = "customer_order_test@loavia.in";
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
  console.log("🚀 Starting Order Module E2E Integration Tests...");

  // Connect to Redis for reservation mapping checks
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
  let customerUser: any = null;

  try {
    // 1. Setup Database Users & Catalog mock data
    console.log("🧹 Cleaning test database records...");
    await prisma.trackingEvent.deleteMany({ where: { shipment: { order: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } } } });
    await prisma.shipment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } } });
    await prisma.payment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } } });
    await prisma.orderItem.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } } });
    await prisma.order.deleteMany({ where: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } });
    await prisma.cartItem.deleteMany({ where: { variant: { sku: { startsWith: "SKU-ORDER-TEST-" } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-ORDER-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-ORDER-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-order-test-" } } });
    await prisma.coupon.deleteMany({ where: { code: { in: ["TEST50", "MINVAL1000"] } } });
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
        name: "Order Test Category",
        slug: "slug-order-test-cat",
      },
    });

    console.log("📦 Seeding test products & variants...");
    // Create standard product
    const prod1Res = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Order Test Cookie",
        slug: "slug-order-test-cookie",
        description: "A premium cookie specifically built for order tests.",
        ingredients: "Flour, Butter, Sugar",
        sku: "SKU-ORDER-TEST-PROD1",
        status: ProductStatus.PUBLISHED,
        variants: {
          create: [
            { name: "Cookie A", sku: "SKU-ORDER-TEST-V1", price: 10000, stockQuantity: 10, isDefault: true }, // ₹100
            { name: "Cookie B", sku: "SKU-ORDER-TEST-V2", price: 5000, stockQuantity: 5 }, // ₹50
          ],
        },
      },
      include: {
        variants: true,
      },
    });

    const v1 = prod1Res.variants.find((v) => v.sku === "SKU-ORDER-TEST-V1")!;
    const v2 = prod1Res.variants.find((v) => v.sku === "SKU-ORDER-TEST-V2")!;
    await prisma.inventory.create({ data: { variantId: v1.id, availableQty: 10 } });
    await prisma.inventory.create({ data: { variantId: v2.id, availableQty: 5 } });

    // Seed coupons
    console.log("🎟️ Seeding test coupons...");
    await prisma.coupon.create({
      data: {
        code: "TEST50",
        discountType: "PERCENTAGE",
        value: 50,
        minOrderValue: 20000, // ₹200
        maxDiscount: 30000, // ₹300
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
        active: true,
      },
    });

    await prisma.coupon.create({
      data: {
        code: "MINVAL1000",
        discountType: "PERCENTAGE",
        value: 10,
        minOrderValue: 100000, // ₹1000
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        active: true,
      },
    });

    // Create a saved user address
    const userAddress = await prisma.address.create({
      data: {
        userId: customerUser.id,
        recipientName: "Darshan",
        street: "Nashik Highway Road",
        city: "Nashik",
        state: "Maharashtra",
        postalCode: "422001",
        phone: "9876543210",
        isDefault: true,
      },
    });

    // 3. Test Checkout Pricing Validation Pipeline
    console.log("💰 Testing Checkout Validate Pricing pipeline...");
    // Pre-populate DB cart for customer
    const cart = await prisma.cart.create({ data: { userId: customerUser.id } });
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: prod1Res.id,
        variantId: v1.id,
        quantity: 3, // 3 * ₹100 = ₹300 subtotal
      },
    });

    // Validate without coupon (Subtotal: 30000 net. GST: 18% of 30000 = 5400. Shipping flat fee ₹100 = 10000. Total = 45400)
    const validateRes = await fetch(`${baseUrl}/checkout/validate`, {
      method: "POST",
      headers: { Cookie: customerCookie },
    });
    const validateData = await validateRes.json() as any;
    if (validateRes.status !== 200 || !validateData.success) {
      throw new Error(`Pricing pipeline failed: ${JSON.stringify(validateData)}`);
    }

    const calc = validateData.data;
    if (calc.subtotal !== 30000 || calc.taxAmount !== 5400 || calc.shippingFee !== 10000 || calc.totalAmount !== 45400) {
      throw new Error(`Pricing calculations mismatch: subtotal=${calc.subtotal}, tax=${calc.taxAmount}, shipping=${calc.shippingFee}, total=${calc.totalAmount}`);
    }

    // Validate with percentage coupon TEST50 (Discount: 50% of 30000 = 15000. netTaxable = 15000. GST: 2700. Shipping flat fee = 10000. Total = 27700)
    const validateCouponRes = await fetch(`${baseUrl}/checkout/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ couponCode: "TEST50" }),
    });
    const validateCouponData = await validateCouponRes.json() as any;
    if (validateCouponData.data.discountAmount !== 15000 || validateCouponData.data.totalAmount !== 27700) {
      throw new Error("Coupon math discount/total mismatch");
    }

    // Validate coupon MinOrderValue rejection (MINVAL1000 requires ₹1000 subtotal, ours is ₹300)
    const validateMinValRes = await fetch(`${baseUrl}/checkout/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ couponCode: "MINVAL1000" }),
    });
    const validateMinValData = await validateMinValRes.json() as any;
    if (validateMinValRes.status !== 400 || validateMinValData.success) {
      throw new Error("Should have rejected coupon below minimum order value");
    }
    console.log("  ↳ Pricing validation pipeline passed.");

    // 4. Test placeOrder (Authenticated Customer)
    console.log("🛍️ Testing Order Creation (placeOrder) and Stock Reservations...");

    // Place order using saved addressId
    const placeRes = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ addressId: userAddress.id, couponCode: "TEST50" }),
    });
    const placeData = await placeRes.json() as any;
    if (placeRes.status !== 201 || !placeData.success) {
      throw new Error(`Order placement failed: ${JSON.stringify(placeData)}`);
    }

    const orderId = placeData.data.id;
    const orderReceipt = placeData.data.receiptNumber;

    // Verify DB Cart is cleared
    const checkCart = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
    if (checkCart.length !== 0) {
      throw new Error("Cart was not cleared after successful order placement");
    }

    // Verify Stock Reservation in DB (V1: available 10 -> 7, reserved 0 -> 3)
    const afterV1 = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (afterV1?.availableQty !== 7 || afterV1?.reservedQty !== 3) {
      throw new Error(`Stock reservation DB sync failure. Available: ${afterV1?.availableQty}, Reserved: ${afterV1?.reservedQty}`);
    }

    // Verify Stock Reservation in Redis key
    const redisKey = `stock_res:${orderReceipt}`;
    const redisVal = await redis.get(redisKey);
    if (!redisVal) {
      throw new Error("Stock reservation mapping missing in Redis cache");
    }
    const redisData = JSON.parse(redisVal);
    if (redisData[0].variantId !== v1.id || redisData[0].quantity !== 3) {
      throw new Error("Redis reservation details mismatch");
    }
    console.log("  ↳ Authenticated order placement and stock reservation verified.");

    // 5. Test Order Details & History APIs
    console.log("🔍 Testing Order Details & History query APIs...");
    // Get Details
    const detailsRes = await fetch(`${baseUrl}/orders/${orderId}`, {
      headers: { Cookie: customerCookie },
    });
    const detailsData = await detailsRes.json() as any;
    if (detailsRes.status !== 200 || detailsData.data.receiptNumber !== orderReceipt) {
      throw new Error("Failed to get order details");
    }

    // Get History
    const historyRes = await fetch(`${baseUrl}/orders`, {
      headers: { Cookie: customerCookie },
    });
    const historyData = await historyRes.json() as any;
    if (historyRes.status !== 200 || historyData.data.data.length === 0) {
      throw new Error("Failed to get order history");
    }
    console.log("  ↳ Order details & history queries passed.");

    // 6. Test Order Status State Machine Transitions & Stock Commits
    console.log("⚙️ Testing Order Status State Machine & Reservation COMMIT...");
    // Update status to PAID (Admin/Staff only)
    const statusPaidRes = await fetch(`${baseUrl}/admin/orders/${orderId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: staffCookie },
      body: JSON.stringify({ status: OrderStatus.PAID }),
    });
    const statusPaidData = await statusPaidRes.json() as any;
    if (statusPaidRes.status !== 200 || !statusPaidData.success) {
      throw new Error(`Failed to update status to PAID: ${JSON.stringify(statusPaidData)}`);
    }

    // Verify stock is committed in DB (V1: available remains 7, reserved 3 -> 0)
    const committedV1 = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (committedV1?.availableQty !== 7 || committedV1?.reservedQty !== 0) {
      throw new Error(`Commit failed to clear DB reserved count. Available: ${committedV1?.availableQty}, Reserved: ${committedV1?.reservedQty}`);
    }

    // Verify Redis reservation key is deleted
    const committedRedis = await redis.get(redisKey);
    if (committedRedis) {
      throw new Error("Redis reservation key was not deleted on stock commit");
    }

    // Verify illegal transition (cannot transition PAID back to PENDING)
    const statusBadRes = await fetch(`${baseUrl}/admin/orders/${orderId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: OrderStatus.PENDING }),
    });
    const statusBadData = await statusBadRes.json() as any;
    if (statusBadRes.status !== 400 || statusBadData.success) {
      throw new Error("Should have blocked illegal state transition (PAID -> PENDING)");
    }
    console.log("  ↳ Order status state transitions and stock commits verified.");

    // 7. Test Order Cancellation & Reservation Releases
    console.log("⚙️ Testing Order Cancellation & Reservation RELEASE...");
    // Add item back to DB cart to place a new order to cancel
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: prod1Res.id, variantId: v1.id, quantity: 2 },
    });

    const placeRes2 = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ addressId: userAddress.id }),
    });
    const placeData2 = await placeRes2.json() as any;
    const orderId2 = placeData2.data.id;
    const orderReceipt2 = placeData2.data.receiptNumber;

    // Verify stock reserved (V1: available 7 -> 5, reserved 0 -> 2)
    const reserved2V1 = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (reserved2V1?.availableQty !== 5 || reserved2V1?.reservedQty !== 2) {
      throw new Error("Overselling reservation failure before cancellation");
    }

    // Customer cancels order
    const cancelRes = await fetch(`${baseUrl}/orders/${orderId2}/cancel`, {
      method: "POST",
      headers: { Cookie: customerCookie },
    });
    const cancelData = await cancelRes.json() as any;
    if (cancelRes.status !== 200 || !cancelData.success) {
      throw new Error(`Customer cancel failed: ${JSON.stringify(cancelData)}`);
    }

    // Verify stock is released in DB (V1: available 5 -> 7, reserved 2 -> 0)
    const releasedV1 = await prisma.inventory.findUnique({ where: { variantId: v1.id } });
    if (releasedV1?.availableQty !== 7 || releasedV1?.reservedQty !== 0) {
      throw new Error(`Release failed to restore DB counts. Available: ${releasedV1?.availableQty}, Reserved: ${releasedV1?.reservedQty}`);
    }

    // Verify Redis key is deleted
    const releasedRedis = await redis.get(`stock_res:${orderReceipt2}`);
    if (releasedRedis) {
      throw new Error("Redis key was not deleted on release");
    }
    console.log("  ↳ Order cancellations and stock releases verified.");

    // 8. Test Shipment Creation & Tracking Events
    console.log("🚚 Testing Shipment Tracking & Chronological Events...");
    // Add shipment tracking details (Admin/Staff only)
    const trackRes = await fetch(`${baseUrl}/admin/orders/${orderId}/tracking`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: staffCookie },
      body: JSON.stringify({
        trackingNumber: "LOAVIA-BD-12345",
        courierPartner: "BlueDart",
        status: ShipmentStatus.SHIPPED,
      }),
    });
    const trackData = await trackRes.json() as any;
    if (trackRes.status !== 200 || !trackData.success) {
      throw new Error(`Failed to update tracking: ${JSON.stringify(trackData)}`);
    }

    // Get Public tracking history
    const publicTrackRes = await fetch(`${baseUrl}/orders/${orderReceipt}/tracking`);
    const publicTrackData = await publicTrackRes.json() as any;
    if (publicTrackRes.status !== 200 || !publicTrackData.success) {
      throw new Error("Failed to get public tracking details");
    }

    const tHistory = publicTrackData.data;
    if (tHistory.trackingNumber !== "LOAVIA-BD-12345" || tHistory.courierPartner !== "BlueDart") {
      throw new Error("Courier details mismatch in public history");
    }
    if (tHistory.events.length !== 1 || !tHistory.events[0].description.includes("BlueDart")) {
      throw new Error("Missing initial shipment tracking event");
    }
    console.log("  ↳ Shipment tracking history and status updates verified.");

    // 9. Test Audit Logging
    console.log("📝 Verifying Order & Shipment Audit Logging...");
    const orderLogs = await prisma.auditLog.findMany({
      where: {
        userId: customerUser.id,
        action: { in: ["ORDER_CREATED", "ORDER_CANCELLED", "ORDER_STATUS_UPDATED", "SHIPMENT_TRACKING_UPDATED"] },
      },
    });

    if (orderLogs.length === 0) {
      throw new Error("No audit logs written for order or shipment actions");
    }
    console.log(`  ↳ Audit logging verified. Recorded ${orderLogs.length} audit logs.`);

    // 10. Test RBAC restriction gates
    console.log("🛡️ Testing RBAC access gates...");
    // Customer cannot transition order status manually
    const rbacRes = await fetch(`${baseUrl}/admin/orders/${orderId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ status: OrderStatus.SHIPPED }),
    });
    if (rbacRes.status !== 403) {
      throw new Error(`Customer role should be forbidden from admin order status edits, got: ${rbacRes.status}`);
    }
    console.log("  ↳ RBAC restriction checks passed.");

    console.log("\n🎉 ALL ORDER MODULE E2E INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Integration Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    console.log("🧹 Cleaning up test database records...");
    await prisma.trackingEvent.deleteMany({ where: { shipment: { order: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } } } });
    await prisma.shipment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } } });
    await prisma.payment.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } } });
    await prisma.orderItem.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } } });
    await prisma.order.deleteMany({ where: { receiptNumber: { startsWith: "LOAVIA-ORDER-TEST-" } } });
    await prisma.cartItem.deleteMany({ where: { variant: { sku: { startsWith: "SKU-ORDER-TEST-" } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-ORDER-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-ORDER-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-order-test-" } } });
    await prisma.coupon.deleteMany({ where: { code: { in: ["TEST50", "MINVAL1000"] } } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } });
    await prisma.$disconnect();
    
    if (redis.isOpen) {
      await redis.disconnect();
    }
    server.close();
  }
}

runTests();

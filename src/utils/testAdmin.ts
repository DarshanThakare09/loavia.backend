process.env.NODE_ENV = "test";
import app from "../app";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { UserRole, ProductStatus, OrderStatus, ReviewStatus, CouponType } from "@prisma/client";
import { hashPassword } from "./crypto";

const SUPER_ADMIN_EMAIL = "super_admin_test@loavia.in";
const ADMIN_EMAIL = "admin_test@loavia.in";
const STAFF_EMAIL = "staff_test@loavia.in";
const CUSTOMER_EMAIL = "customer_test@loavia.in";
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
  console.log("🚀 Starting Admin Module E2E Integration Tests...");

  // Connect to Redis if not already connected
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

  let superAdminUser: any = null;
  let adminUser: any = null;
  let customerUser: any = null;

  let testCategory: any = null;
  let testProduct: any = null;
  let testVariant: any = null;
  let testOrder: any = null;

  try {
    // 1. Setup Database Users & Catalog mock data
    console.log("🧹 Cleaning test database records...");
    await prisma.review.deleteMany({ where: { comment: { startsWith: "Test Review" } } });
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: [SUPER_ADMIN_EMAIL, ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } } });
    await prisma.orderItem.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-ADMIN-TEST-" } } } });
    await prisma.order.deleteMany({ where: { receiptNumber: { startsWith: "LOAVIA-ADMIN-TEST-" } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-ADMIN-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-ADMIN-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-admin-test-" } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: "ADMINTEST" } } });
    await prisma.user.deleteMany({ where: { email: { in: [SUPER_ADMIN_EMAIL, ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } });

    // Clear Redis caches
    await redis.del("admin:dashboard_summary");
    await redis.del("admin:best_sellers");
    await redis.del("admin:category_sales");

    console.log("👤 Creating test users...");
    const hashedPassword = await hashPassword(TEST_PASSWORD);

    superAdminUser = await prisma.user.create({
      data: {
        name: "Test Super Admin",
        email: SUPER_ADMIN_EMAIL,
        passwordHash: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        isVerified: true,
      },
    });
    
    adminUser = await prisma.user.create({
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
    const superAdminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SUPER_ADMIN_EMAIL, password: TEST_PASSWORD }),
    });
    if (superAdminLogin.status !== 200) {
      throw new Error("Super Admin login failed");
    }

    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: TEST_PASSWORD }),
    });
    const adminCookies = parseCookies(adminLogin.headers.getSetCookie());
    adminCookie = `access_token=${adminCookies.access_token}`;

    const staffLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: STAFF_EMAIL, password: TEST_PASSWORD }),
    });
    const staffCookies = parseCookies(staffLogin.headers.getSetCookie());
    staffCookie = `access_token=${staffCookies.access_token}`;

    const customerLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
    });
    const customerCookies = parseCookies(customerLogin.headers.getSetCookie());
    customerCookie = `access_token=${customerCookies.access_token}`;

    // 3. Setup catalog data and order data to populate dashboard & analytics
    console.log("📦 Creating mock catalog & orders for metrics verification...");
    testCategory = await prisma.category.create({
      data: {
        name: "Admin Test Category",
        slug: "slug-admin-test-cat",
      },
    });

    testProduct = await prisma.product.create({
      data: {
        categoryId: testCategory.id,
        name: "Admin Test Product",
        slug: "slug-admin-test-prod",
        description: "Test description",
        ingredients: "Test ingredients",
        sku: "SKU-ADMIN-TEST-P1",
        status: ProductStatus.PUBLISHED,
        basePrice: 10000,
      },
    });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        name: "Admin Test Variant",
        sku: "SKU-ADMIN-TEST-V1",
        price: 10000,
        stockQuantity: 100,
      },
    });

    testOrder = await prisma.order.create({
      data: {
        userId: customerUser.id,
        receiptNumber: "LOAVIA-ADMIN-TEST-O1",
        status: OrderStatus.PAID,
        subtotal: 10000,
        shippingFee: 0,
        discountAmount: 0,
        taxAmount: 1800,
        totalAmount: 11800,
        shippingAddress: {
          recipientName: "Test Customer",
          street: "123 Test St",
          city: "Test City",
          state: "Test State",
          postalCode: "123456",
          country: "India",
          phone: "1234567890",
        },
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: testOrder.id,
        productId: testProduct.id,
        variantId: testVariant.id,
        name: "Admin Test Product - Admin Test Variant",
        price: 10000,
        quantity: 2,
      },
    });

    // 4. Test Dashboard & Analytics Endpoints (Staff and Admin roles)
    console.log("📊 Testing Dashboard Metrics & Analytics Caching...");
    
    // Test Staff access to Dashboard Summary
    const summaryRes1 = await fetch(`${baseUrl}/admin/dashboard/summary`, {
      headers: { Cookie: staffCookie },
    });
    const summaryData1 = await summaryRes1.json() as any;
    if (summaryRes1.status !== 200 || !summaryData1.success) {
      throw new Error(`Staff failed to fetch dashboard summary: ${JSON.stringify(summaryData1)}`);
    }
    const initialRevenue = summaryData1.data.revenue;
    console.log(`✅ Staff summary check complete. Revenue recorded: ₹${(initialRevenue / 100).toFixed(2)}`);

    // Verify cache exists in Redis
    const summaryCache = await redis.get("admin:dashboard_summary");
    if (!summaryCache) {
      throw new Error("Dashboard summary was not cached in Redis!");
    }
    console.log("✅ Dashboard summary caching verified in Redis.");

    // Update order status or amount in DB directly to verify caching is active (should return old value)
    await prisma.order.update({
      where: { id: testOrder.id },
      data: { totalAmount: 20000 },
    });

    const summaryRes2 = await fetch(`${baseUrl}/admin/dashboard/summary`, {
      headers: { Cookie: adminCookie },
    });
    const summaryData2 = await summaryRes2.json() as any;
    if (summaryData2.data.revenue !== initialRevenue) {
      throw new Error("Analytics caching failed: summary fetched db instead of cached value");
    }
    console.log("✅ Dashboard summary caching validation successful (returns cached value).");

    // Manually invalidate cache and verify it updates
    await redis.del("admin:dashboard_summary");
    const summaryRes3 = await fetch(`${baseUrl}/admin/dashboard/summary`, {
      headers: { Cookie: adminCookie },
    });
    const summaryData3 = await summaryRes3.json() as any;
    if (summaryData3.data.revenue === initialRevenue) {
      throw new Error("Dashboard summary manual invalidation failed to fetch fresh DB values");
    }
    console.log("✅ Dashboard summary cache invalidation & update verified.");

    // Restore order amount for consistency
    await prisma.order.update({
      where: { id: testOrder.id },
      data: { totalAmount: 11800 },
    });
    await redis.del("admin:dashboard_summary");

    // Test sales-chart, best-sellers, category-sales
    const salesChartRes = await fetch(`${baseUrl}/admin/dashboard/sales-chart`, {
      headers: { Cookie: adminCookie },
    });
    const salesChartData = await salesChartRes.json() as any;
    if (salesChartRes.status !== 200 || !salesChartData.success) {
      throw new Error(`Failed to fetch sales chart: ${JSON.stringify(salesChartData)}`);
    }
    console.log("✅ Sales chart analytics verified.");

    const bestSellersRes = await fetch(`${baseUrl}/admin/dashboard/best-sellers`, {
      headers: { Cookie: adminCookie },
    });
    const bestSellersData = await bestSellersRes.json() as any;
    if (bestSellersRes.status !== 200 || !bestSellersData.success) {
      throw new Error(`Failed to fetch best sellers: ${JSON.stringify(bestSellersData)}`);
    }
    console.log("✅ Best sellers analytics verified.");

    const categorySalesRes = await fetch(`${baseUrl}/admin/dashboard/category-sales`, {
      headers: { Cookie: adminCookie },
    });
    const categorySalesData = await categorySalesRes.json() as any;
    if (categorySalesRes.status !== 200 || !categorySalesData.success) {
      throw new Error(`Failed to fetch category sales: ${JSON.stringify(categorySalesData)}`);
    }
    console.log("✅ Category sales distribution verified.");

    // 5. Customer Management Tests
    console.log("👥 Testing Customer Management (List, Profile, Role Updates)...");
    
    // List customers
    const listRes = await fetch(`${baseUrl}/admin/customers`, {
      headers: { Cookie: adminCookie },
    });
    const listData = await listRes.json() as any;
    if (listRes.status !== 200 || !listData.success || listData.data.total === 0) {
      throw new Error(`Failed to list customers: ${JSON.stringify(listData)}`);
    }
    console.log(`✅ Customers list verified. Total customers found: ${listData.data.total}`);

    // Get customer profile
    const profileRes = await fetch(`${baseUrl}/admin/customers/${customerUser.id}`, {
      headers: { Cookie: adminCookie },
    });
    const profileData = await profileRes.json() as any;
    if (profileRes.status !== 200 || !profileData.success || profileData.data.email !== CUSTOMER_EMAIL) {
      throw new Error(`Failed to get customer profile: ${JSON.stringify(profileData)}`);
    }
    console.log("✅ Customer profile details lookup verified.");

    // 6. Test User Status Locking (Suspension)
    console.log("🚫 Testing Customer Status Locking / Suspension...");

    // Suspend Customer via Admin PUT /customers/:id/status
    const suspendRes = await fetch(`${baseUrl}/admin/customers/${customerUser.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    const suspendData = await suspendRes.json() as any;
    if (suspendRes.status !== 200 || !suspendData.success || suspendData.data.status !== "SUSPENDED") {
      throw new Error(`Failed to suspend customer: ${JSON.stringify(suspendData)}`);
    }
    console.log("✅ Customer suspended in Redis via Admin API.");

    // Verify Redis suspension key exists
    const redisSuspendedVal = await redis.get(`user_suspended:${customerUser.id}`);
    if (redisSuspendedVal !== "true") {
      throw new Error("Suspended status was not written to Redis!");
    }
    console.log("✅ Suspension Redis state validated.");

    // Verify suspended user CANNOT login
    console.log("🔒 Verifying suspended user is blocked from logging in...");
    const loginFailRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
    });
    const loginFailData = await loginFailRes.json() as any;
    if (loginFailRes.status !== 400 || loginFailData.success || !loginFailData.message.includes("suspended")) {
      throw new Error(`Suspended login should be rejected with 400, got: ${loginFailRes.status} ${JSON.stringify(loginFailData)}`);
    }
    console.log("✅ Login blocked successfully for suspended customer.");

    // Verify suspended user CANNOT access authenticated routes with old session token (due to tokenVersion increment & invalidation)
    console.log("🔒 Verifying suspended user's old sessions are invalidated...");
    const authMeFailRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: customerCookie },
    });
    const authMeFailData = await authMeFailRes.json() as any;
    if (authMeFailRes.status !== 401 || authMeFailData.success) {
      throw new Error(`Auth me should be unauthorized (401) for suspended session, got: ${authMeFailRes.status}`);
    }
    console.log("✅ Session invalidation and JWT revocation verified successfully.");

    // Verify suspended user CANNOT place orders
    console.log("🔒 Verifying suspended user is blocked from order checkout...");
    let placeOrderBlocked = false;
    const orderService = new (require("../services/order.service").OrderService)();
    try {
      await orderService.placeOrder(
        customerUser.id,
        undefined,
        undefined,
        { recipientName: "Test", street: "St", city: "City", state: "State", postalCode: "123", country: "India", phone: "12" },
        undefined,
        undefined,
        "127.0.0.1"
      );
    } catch (err: any) {
      if (err.message.includes("suspended")) {
        placeOrderBlocked = true;
      }
    }
    if (!placeOrderBlocked) {
      throw new Error("Order placement should have been blocked for suspended user");
    }
    console.log("✅ Order placement blocked successfully for suspended customer.");

    // Verify order history remains intact
    const dbOrders = await prisma.order.findMany({ where: { userId: customerUser.id } });
    if (dbOrders.length === 0) {
      throw new Error("Order history was deleted during user suspension!");
    }
    console.log(`✅ Customer order history verified intact (${dbOrders.length} orders found).`);

    // Reactivate user
    console.log("✅ Reactivating customer account...");
    const reactivateRes = await fetch(`${baseUrl}/admin/customers/${customerUser.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    const reactivateData = await reactivateRes.json() as any;
    if (reactivateRes.status !== 200 || !reactivateData.success || reactivateData.data.status !== "ACTIVE") {
      throw new Error(`Failed to reactivate customer: ${JSON.stringify(reactivateData)}`);
    }
    console.log("✅ Customer reactivated successfully.");

    // Verify user can login again
    const loginSuccessRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
    });
    if (loginSuccessRes.status !== 200) {
      throw new Error(`Customer login failed after reactivation, status: ${loginSuccessRes.status}`);
    }
    console.log("✅ Customer login works after reactivation.");

    // 7. Role management checks
    console.log("👑 Testing Role Management (User Role Upgrades)...");
    
    // Upgrade Customer to STAFF
    const roleRes1 = await fetch(`${baseUrl}/admin/customers/${customerUser.id}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ role: UserRole.STAFF }),
    });
    const roleData1 = await roleRes1.json() as any;
    if (roleRes1.status !== 200 || !roleData1.success || roleData1.data.role !== UserRole.STAFF) {
      throw new Error(`Failed to change user role to STAFF: ${JSON.stringify(roleData1)}`);
    }
    console.log("✅ Customer role upgraded to STAFF successfully.");

    // Guard test: Normal Admin trying to change Super Admin's role (should fail)
    const superAdminRoleRes = await fetch(`${baseUrl}/admin/customers/${superAdminUser.id}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie }, // normal admin credentials
      body: JSON.stringify({ role: UserRole.CUSTOMER }),
    });
    const superAdminRoleData = await superAdminRoleRes.json() as any;
    if (superAdminRoleRes.status !== 400 || superAdminRoleData.success) {
      throw new Error(`Normal Admin should be forbidden from modifying SUPER_ADMIN role. Got: ${superAdminRoleRes.status}`);
    }
    console.log("✅ Guard verified: Non-SUPER_ADMIN is forbidden from changing SUPER_ADMIN's role.");

    // 8. Coupon CRUD Management Tests
    console.log("🎟️ Testing Coupon CRUD Management...");

    // Create coupon
    const couponExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const createCouponRes = await fetch(`${baseUrl}/admin/coupons`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        code: "ADMINTEST50",
        discountType: CouponType.PERCENTAGE,
        value: 50,
        minOrderValue: 2000,
        maxDiscount: 1000,
        expiresAt: couponExpiry,
      }),
    });
    const createCouponData = await createCouponRes.json() as any;
    if (createCouponRes.status !== 201 || !createCouponData.success) {
      throw new Error(`Failed to create coupon: ${JSON.stringify(createCouponData)}`);
    }
    const couponId = createCouponData.data.id;
    console.log(`✅ Coupon created successfully (ID: ${couponId}).`);

    // Get coupon details
    const getCouponRes = await fetch(`${baseUrl}/admin/coupons/${couponId}`, {
      headers: { Cookie: adminCookie },
    });
    const getCouponData = await getCouponRes.json() as any;
    if (getCouponRes.status !== 200 || !getCouponData.success || getCouponData.data.code !== "ADMINTEST50") {
      throw new Error(`Failed to get coupon details: ${JSON.stringify(getCouponData)}`);
    }
    console.log("✅ Coupon details retrieval verified.");

    // Update coupon
    const updateCouponRes = await fetch(`${baseUrl}/admin/coupons/${couponId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        value: 40,
        active: false,
      }),
    });
    const updateCouponData = await updateCouponRes.json() as any;
    if (updateCouponRes.status !== 200 || !updateCouponData.success || updateCouponData.data.value !== 40 || updateCouponData.data.active !== false) {
      throw new Error(`Failed to update coupon: ${JSON.stringify(updateCouponData)}`);
    }
    console.log("✅ Coupon updates verified.");

    // List coupons
    const listCouponsRes = await fetch(`${baseUrl}/admin/coupons?search=ADMINTEST`, {
      headers: { Cookie: adminCookie },
    });
    const listCouponsData = await listCouponsRes.json() as any;
    if (listCouponsRes.status !== 200 || !listCouponsData.success || listCouponsData.data.total === 0) {
      throw new Error(`Failed to list coupons: ${JSON.stringify(listCouponsData)}`);
    }
    console.log("✅ Coupon list and search verification complete.");

    // Delete coupon (soft-delete)
    const deleteCouponRes = await fetch(`${baseUrl}/admin/coupons/${couponId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    const deleteCouponData = await deleteCouponRes.json() as any;
    if (deleteCouponRes.status !== 200 || !deleteCouponData.success) {
      throw new Error(`Failed to delete coupon: ${JSON.stringify(deleteCouponData)}`);
    }
    
    // Verify soft-deleted in DB
    const dbCoupon = await prisma.coupon.findUnique({ where: { id: couponId } });
    if (!dbCoupon || !dbCoupon.isDeleted || !dbCoupon.deletedAt) {
      throw new Error("Coupon was not correctly soft-deleted in the database");
    }
    console.log("✅ Coupon soft-deletion verified.");

    // 9. Review Moderation and Product Rating Sync Tests
    console.log("⭐️ Testing Review Moderation & Rating Synchronizations...");

    // Create a review in database directly as PENDING
    const review = await prisma.review.create({
      data: {
        productId: testProduct.id,
        userId: customerUser.id,
        rating: 5,
        comment: "Test Review - Excellent!",
        status: ReviewStatus.PENDING,
      },
    });
    console.log("📝 Initial review inserted directly as PENDING.");

    // List reviews
    const listReviewsRes = await fetch(`${baseUrl}/admin/reviews?productId=${testProduct.id}`, {
      headers: { Cookie: staffCookie },
    });
    const listReviewsData = await listReviewsRes.json() as any;
    if (listReviewsRes.status !== 200 || !listReviewsData.success || listReviewsData.data.total === 0) {
      throw new Error(`Failed to list reviews: ${JSON.stringify(listReviewsData)}`);
    }
    console.log("✅ Reviews list and product filters verified.");

    // Moderate to APPROVED
    console.log("⭐️ Moderating review to APPROVED...");
    const approveRes = await fetch(`${baseUrl}/admin/reviews/${review.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: staffCookie },
      body: JSON.stringify({ status: ReviewStatus.APPROVED }),
    });
    const approveData = await approveRes.json() as any;
    if (approveRes.status !== 200 || !approveData.success || approveData.data.status !== ReviewStatus.APPROVED) {
      throw new Error(`Failed to approve review: ${JSON.stringify(approveData)}`);
    }

    // Verify rating stats synchronized to Product table
    const approvedProduct = await prisma.product.findUnique({ where: { id: testProduct.id } });
    if (!approvedProduct || approvedProduct.averageRating !== 5.0 || approvedProduct.reviewCount !== 1) {
      throw new Error(`Product rating stats failed to synchronize. Expected 5.0 rating & 1 review, got ${approvedProduct?.averageRating} rating & ${approvedProduct?.reviewCount} reviewCount`);
    }
    console.log("✅ Product averageRating and reviewCount sync verified for APPROVED transition.");

    // Moderate to REJECTED
    console.log("⭐️ Moderating review to REJECTED...");
    const rejectRes = await fetch(`${baseUrl}/admin/reviews/${review.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: staffCookie },
      body: JSON.stringify({ status: ReviewStatus.REJECTED }),
    });
    const rejectData = await rejectRes.json() as any;
    if (rejectRes.status !== 200 || !rejectData.success || rejectData.data.status !== ReviewStatus.REJECTED) {
      throw new Error(`Failed to reject review: ${JSON.stringify(rejectData)}`);
    }

    // Verify rating stats updated on Product (should fall back to 0 because no approved reviews)
    const rejectedProduct = await prisma.product.findUnique({ where: { id: testProduct.id } });
    if (!rejectedProduct || rejectedProduct.averageRating !== 0.0 || rejectedProduct.reviewCount !== 0) {
      throw new Error(`Product rating stats failed to update after rejection. Expected 0.0 rating & 0 reviews, got ${rejectedProduct?.averageRating} rating & ${rejectedProduct?.reviewCount} reviewCount`);
    }
    console.log("✅ Product averageRating and reviewCount sync verified for REJECTED transition.");

    // 10. Audit Log Viewer Tests
    console.log("📝 Testing Audit Log Viewer...");
    const auditRes = await fetch(`${baseUrl}/admin/audit-logs?userId=${adminUser.id}`, {
      headers: { Cookie: adminCookie },
    });
    const auditData = await auditRes.json() as any;
    if (auditRes.status !== 200 || !auditData.success) {
      throw new Error(`Failed to retrieve audit logs: ${JSON.stringify(auditData)}`);
    }
    console.log(`✅ Audit log query successful. Retrieved ${auditData.data.total} logs.`);

    console.log("\n🎉 ALL ADMIN MODULE E2E INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Integration Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    // Clean up database records
    console.log("🧹 Cleaning up database test records...");
    await prisma.review.deleteMany({ where: { comment: { startsWith: "Test Review" } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: [SUPER_ADMIN_EMAIL, ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } } }).catch(() => {});
    await prisma.orderItem.deleteMany({ where: { order: { receiptNumber: { startsWith: "LOAVIA-ADMIN-TEST-" } } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { receiptNumber: { startsWith: "LOAVIA-ADMIN-TEST-" } } }).catch(() => {});
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-ADMIN-TEST-" } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-ADMIN-TEST-" } } }).catch(() => {});
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-admin-test-" } } }).catch(() => {});
    await prisma.coupon.deleteMany({ where: { code: { startsWith: "ADMINTEST" } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: [SUPER_ADMIN_EMAIL, ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } }).catch(() => {});

    // Clear Redis caches
    await redis.del("admin:dashboard_summary").catch(() => {});
    await redis.del("admin:best_sellers").catch(() => {});
    await redis.del("admin:category_sales").catch(() => {});
    // Clear suspended state
    if (customerUser?.id) {
      await redis.del(`user_suspended:${customerUser.id}`).catch(() => {});
    }

    await prisma.$disconnect();
    await redis.disconnect().catch(() => {});
    server.close();
  }
}

runTests();

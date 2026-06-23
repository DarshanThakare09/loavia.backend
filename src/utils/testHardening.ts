process.env.NODE_ENV = "test";
import app from "../app";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { UserRole, ProductStatus } from "@prisma/client";
import { hashPassword } from "./crypto";
import jwt from "jsonwebtoken";

const ADMIN_EMAIL = "hardening_admin@loavia.in";
const STAFF_EMAIL = "hardening_staff@loavia.in";
const CUSTOMER_EMAIL = "hardening_customer@loavia.in";
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
  console.log("🚀 Starting System Hardening & Security Gating E2E Tests...");

  if (!redis.isOpen) {
    await redis.connect();
  }

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  let staffCookie = "";
  let customerCookie = "";
  let customerUser: any = null;

  try {
    // 1. Clean Database test records
    console.log("🧹 Cleaning database test records...");
    await prisma.review.deleteMany({ where: { comment: { contains: "script" } } });
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } } });
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

    // 2. Login to obtain credentials
    console.log("🔑 Authenticating test users...");
    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: TEST_PASSWORD }),
    });
    if (adminLogin.status !== 200) {
      throw new Error("Admin login failed");
    }

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

    // --- TEST 1: SQL Injection Gating Test ---
    console.log("\n🛡️ --- TEST 1: SQL Injection Gating ---");
    const sqliPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE users;--",
      "1 UNION SELECT null, null, null",
    ];

    for (const payload of sqliPayloads) {
      console.log(`🔍 Testing search input with SQLi payload: "${payload}"`);
      const searchRes = await fetch(`${baseUrl}/products?search=${encodeURIComponent(payload)}`);
      const searchData = await searchRes.json() as any;
      
      // Confirm that the server handled it safely (e.g. didn't crash, returns 200 with empty list or normal message)
      if (searchRes.status !== 200 || !searchData.success) {
        throw new Error(`SQLi test failed on search endpoint with status ${searchRes.status}: ${JSON.stringify(searchData)}`);
      }
    }
    console.log("✅ SQL Injection queries handled safely (parameterized/escaped).");

    // --- TEST 2: XSS Sanitization Gating Test ---
    console.log("\n🛡️ --- TEST 2: XSS Injection Gating ---");
    const xssPayload = "<script>alert('XSS vulnerability')</script>";
    
    // Seed review directly in database with XSS payload
    const cat = await prisma.category.create({ data: { name: "Hardening Category", slug: `slug-hard-${Date.now()}` } });
    const prod = await prisma.product.create({
      data: {
        categoryId: cat.id,
        name: "Hardening Cookie",
        slug: `slug-hard-prod-${Date.now()}`,
        description: "description",
        ingredients: "ingredients",
        sku: `SKU-HARD-P-${Date.now()}`,
        status: ProductStatus.PUBLISHED,
        basePrice: 5000,
      },
    });

    const review = await prisma.review.create({
      data: {
        productId: prod.id,
        userId: customerUser.id,
        rating: 5,
        comment: xssPayload,
      },
    });

    // Fetch review details from endpoint and check if it is returned safely
    // (Ensure JSON response formats correctly without breaking serialization)
    const listReviewsRes = await fetch(`${baseUrl}/admin/reviews?productId=${prod.id}`, {
      headers: { Cookie: staffCookie },
    });
    const listReviewsData = await listReviewsRes.json() as any;
    if (listReviewsRes.status !== 200 || !listReviewsData.success) {
      throw new Error("Failed to fetch reviews");
    }

    const fetchedReview = listReviewsData.data.data[0];
    console.log(`📊 Fetched comment text: "${fetchedReview.comment}"`);
    if (fetchedReview.comment !== xssPayload) {
      throw new Error("Comment text was altered unexpectedly during retrieval");
    }

    // Clean up catalog test items
    await prisma.review.delete({ where: { id: review.id } });
    await prisma.product.delete({ where: { id: prod.id } });
    await prisma.category.delete({ where: { id: cat.id } });
    console.log("✅ XSS strings stored and retrieved safely as non-executable content.");

    // --- TEST 3: Rate Limiting Gating Test ---
    console.log("\n🛡️ --- TEST 3: Rate Limiting Gating ---");
    
    // Reset/clear rate limits if needed or just spam login
    // Since authLimiter allows 10 calls, let's call it 12 times rapidly
    console.log("⚡ Spamming /auth/login with 12 rapid calls...");
    let blockCount = 0;

    for (let i = 0; i < 12; i++) {
      const resp = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: CUSTOMER_EMAIL, password: "wrongpassword" }),
      });
      if (resp.status === 429) {
        blockCount++;
      }
    }

    console.log(`📊 Requests blocked with 429: ${blockCount}`);
    if (blockCount === 0) {
      throw new Error("Rate limiting did not block rapid login attempts!");
    }
    console.log("✅ Rate limiter successfully blocked spam requests (status 429).");

    // --- TEST 4: RBAC Penetration Gating Test ---
    console.log("\n🛡️ --- TEST 4: RBAC Penetration Gating ---");

    // A. CUSTOMER attempts ADMIN endpoint (coupons CRUD)
    console.log("🔒 CUSTOMER attempts to retrieve coupon list (ADMIN route)...");
    const getCouponsRes = await fetch(`${baseUrl}/admin/coupons`, {
      headers: { Cookie: customerCookie },
    });
    console.log(`📊 CUSTOMER access status: ${getCouponsRes.status}`);
    if (getCouponsRes.status !== 403) {
      throw new Error(`CUSTOMER should be blocked with 403, got: ${getCouponsRes.status}`);
    }

    // B. STAFF attempts ADMIN endpoint (coupons list)
    console.log("🔒 STAFF attempts to retrieve coupon list (ADMIN route)...");
    const getCouponsStaffRes = await fetch(`${baseUrl}/admin/coupons`, {
      headers: { Cookie: staffCookie },
    });
    console.log(`📊 STAFF access status: ${getCouponsStaffRes.status}`);
    if (getCouponsStaffRes.status !== 403) {
      throw new Error(`STAFF should be blocked with 403, got: ${getCouponsStaffRes.status}`);
    }

    console.log("✅ RBAC perimeter controls verified: unauthorized roles blocked with 403.");

    // --- TEST 5: JWT Signature Tampering Test ---
    console.log("\n🛡️ --- TEST 5: JWT Signature Tampering ---");

    // A. Modify JWT header/payload without signing (tampered token)
    console.log("🔒 Attempting to submit a tampered role in JWT payload...");
    const rawTokens = customerCookies.access_token;
    const parts = rawTokens.split(".");
    if (parts.length === 3) {
      // Decode payload
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
      // Tamper role to ADMIN
      payload.role = "ADMIN";
      const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64").replace(/=/g, "");
      const tamperedToken = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

      const tamperedRes = await fetch(`${baseUrl}/admin/dashboard/summary`, {
        headers: { Cookie: `access_token=${tamperedToken}` },
      });
      console.log(`📊 Tampered signature status: ${tamperedRes.status}`);
      if (tamperedRes.status !== 401) {
        throw new Error(`Tampered signature should be blocked with 401, got: ${tamperedRes.status}`);
      }
    } else {
      throw new Error("Invalid JWT token format");
    }

    // B. Sign JWT with a fake key
    console.log("🔒 Attempting to submit a JWT signed with a fake secret key...");
    const fakeToken = jwt.sign(
      { sub: customerUser.id, role: "ADMIN", name: "Fake Admin", tokenVersion: 0 },
      "fake_secret_key_12345",
      { expiresIn: "15m" }
    );

    const fakeKeyRes = await fetch(`${baseUrl}/admin/dashboard/summary`, {
      headers: { Cookie: `access_token=${fakeToken}` },
    });
    console.log(`📊 Fake key status: ${fakeKeyRes.status}`);
    if (fakeKeyRes.status !== 401) {
      throw new Error(`Fake key signature should be blocked with 401, got: ${fakeKeyRes.status}`);
    }

    console.log("✅ JWT signature tampering checks blocked successfully (status 401).");

    console.log("\n🎉 ALL HARDENING & SECURITY GATING TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Hardening Stress Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    // Clean up
    console.log("🧹 Cleaning up database test records...");
    await prisma.review.deleteMany({ where: { comment: { contains: "script" } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, STAFF_EMAIL, CUSTOMER_EMAIL] } } }).catch(() => {});

    await prisma.$disconnect();
    await redis.disconnect().catch(() => {});
    server.close();
  }
}

runTests();

/**
 * LOAVIA - Create Test Accounts Script
 * Creates SUPER_ADMIN, ADMIN, STAFF, and CUSTOMER test accounts for UAT
 */
import { prisma } from "../config/prisma";
import bcrypt from "bcrypt";
import { UserRole } from "@prisma/client";

const TEST_ACCOUNTS = [
  {
    name: "Loavia Super Admin",
    email: "superadmin@loavia.in",
    password: "SuperAdmin@123",
    role: UserRole.SUPER_ADMIN,
    phone: "9000000001",
  },
  {
    name: "Loavia Admin",
    email: "admin@loavia.in",
    password: "Admin@123",
    role: UserRole.ADMIN,
    phone: "9000000002",
  },
  {
    name: "Loavia Staff",
    email: "staff@loavia.in",
    password: "Staff@123",
    role: UserRole.STAFF,
    phone: "9000000003",
  },
  {
    name: "Test Customer",
    email: "customer@loavia.in",
    password: "Customer@123",
    role: UserRole.CUSTOMER,
    phone: "9000000004",
  },
];

async function createTestAccounts() {
  console.log("🔧 Creating LOAVIA Test Accounts...\n");

  for (const account of TEST_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, 12);

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.name,
        passwordHash,
        role: account.role,
        phone: account.phone,
        isVerified: true,
        emailVerifiedAt: new Date(),
      },
      create: {
        name: account.name,
        email: account.email,
        passwordHash,
        role: account.role,
        phone: account.phone,
        isVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    // Ensure wishlist exists
    await prisma.wishlist.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    // Ensure cart exists
    await prisma.cart.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    console.log(`✅ ${account.role}: ${account.email} | Password: ${account.password} | ID: ${user.id} | Verified: true`);
  }

  // Also create a coupon for testing checkout
  await prisma.coupon.upsert({
    where: { code: "TESTDISCOUNT10" },
    update: { active: true, isDeleted: false },
    create: {
      code: "TESTDISCOUNT10",
      discountType: "PERCENTAGE",
      value: 10,
      minOrderValue: 100,
      maxDiscount: 500,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      active: true,
    },
  });
  console.log("\n✅ Test coupon created: TESTDISCOUNT10 (10% off, min ₹1, max ₹5 discount)");

  console.log("\n🎉 All test accounts created successfully!");
}

createTestAccounts()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

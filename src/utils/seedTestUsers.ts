import { prisma } from "../config/prisma";
import { UserRole } from "@prisma/client";
import { hashPassword } from "./crypto";

const SUPER_ADMIN_EMAIL = "super_admin_test@loavia.in";
const ADMIN_EMAIL = "admin_test@loavia.in";
const STAFF_EMAIL = "staff_test@loavia.in";
const CUSTOMER_EMAIL = "customer_test@loavia.in";
const TEST_PASSWORD = "AdminPassword@123";

async function main() {
  console.log("👤 Seeding test users...");
  const hashedPassword = await hashPassword(TEST_PASSWORD);

  const users = [
    { name: "Test Super Admin", email: SUPER_ADMIN_EMAIL, role: UserRole.SUPER_ADMIN },
    { name: "Test Admin", email: ADMIN_EMAIL, role: UserRole.ADMIN },
    { name: "Test Staff", email: STAFF_EMAIL, role: UserRole.STAFF },
    { name: "Test Customer", email: CUSTOMER_EMAIL, role: UserRole.CUSTOMER },
    { name: "Admin User", email: "admin@loavia.com", role: UserRole.ADMIN },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        isVerified: true,
        passwordHash: hashedPassword,
      },
      create: {
        name: u.name,
        email: u.email,
        role: u.role,
        isVerified: true,
        passwordHash: hashedPassword,
      },
    });
    console.log(`✅ Seeded user: ${u.email} (${u.role})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { prisma } from "../config/prisma";
import { UserRole } from "@prisma/client";
import { hashPassword } from "./crypto";
import readline from "readline";

const DEFAULT_ADMIN_EMAIL = "care@aksharfoods.com";

async function promptPassword(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Enter Production Admin Password: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Provisions the production admin user in the target database.
 * Credentials are read securely from environment variables (ADMIN_EMAIL, ADMIN_PASSWORD)
 * or prompted via CLI without hardcoding or committing passwords to Git.
 */
export async function seedProductionAdmin() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase().trim();
  let password = process.env.ADMIN_PASSWORD?.trim();

  if (!password && process.stdin.isTTY) {
    password = await promptPassword();
  }

  if (!password) {
    console.error("❌ Error: Production admin password must be provided via the ADMIN_PASSWORD environment variable or interactive input.");
    console.error("   Example: ADMIN_PASSWORD=\"...\" npm run seed:admin:prod");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("❌ Error: Admin password must be at least 8 characters long.");
    process.exit(1);
  }

  console.log(`🔐 Provisioning Production Admin Account (${email})...`);

  const hashedPassword = await hashPassword(password);

  // Remove any stale mock or test admin accounts in this database to prevent duplicates
  const staleAdmins = await prisma.user.findMany({
    where: {
      role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      email: { not: email },
    },
  });

  if (staleAdmins.length > 0) {
    console.log(`🧹 Removing ${staleAdmins.length} stale/mock admin record(s) to enforce a single production admin...`);
    await prisma.user.deleteMany({
      where: {
        id: { in: staleAdmins.map((a) => a.id) },
      },
    });
  }

  // Upsert the production admin user
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name: "LOAVIA Admin",
      passwordHash: hashedPassword,
      role: UserRole.SUPER_ADMIN,
      isVerified: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      name: "LOAVIA Admin",
      email,
      passwordHash: hashedPassword,
      phone: "9999999999",
      role: UserRole.SUPER_ADMIN,
      isVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Ensure loyalty points ledger entry exists
  await prisma.loyaltyPoints.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      points: 0,
    },
  });

  console.log("=================================================");
  console.log("✅ PRODUCTION ADMIN CONFIGURED SUCCESSFULLY");
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Role:     ${admin.role}`);
  console.log("   Password: [STORED SECURELY VIA BCRYPT HASH]");
  console.log("=================================================");
}

if (require.main === module) {
  seedProductionAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Failed to seed production admin:", err);
      process.exit(1);
    });
}

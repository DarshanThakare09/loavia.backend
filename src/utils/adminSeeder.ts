import { prisma } from "../config/prisma";
import { UserRole } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "../config/logger";

function generateStrongUsername(): string {
  const randomSuffix = crypto.randomBytes(4).toString("hex"); // 8 hex characters
  return `admin_${randomSuffix}@loavia.in`;
}

function generateStrongPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
  let password = "";
  // Ensure password has at least one of each class
  password += "abcdefghijklmnopqrstuvwxyz"[crypto.randomInt(26)];
  password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[crypto.randomInt(26)];
  password += "0123456789"[crypto.randomInt(10)];
  password += "!@#$%^&*()_+"[crypto.randomInt(12)];
  
  for (let i = 0; i < 14; i++) {
    password += chars[crypto.randomInt(chars.length)];
  }
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

export async function seedAdminUser() {
  try {
    const admin = await prisma.user.findFirst({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }
      }
    });

    const isSecureAdmin = admin && admin.email.startsWith("admin_") && admin.email.endsWith("@loavia.in");

    if (!isSecureAdmin) {
      logger.info(`🧹 DB has non-secure or no admins. Enforcing exactly ONE secure admin...`);
      
      // Delete any existing admins to enforce ONE admin account
      await prisma.user.deleteMany({
        where: {
          role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }
        }
      });

      const email = generateStrongUsername();
      const password = generateStrongPassword();
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name: "LOAVIA Secure Admin",
          email,
          passwordHash: hashedPassword,
          role: UserRole.SUPER_ADMIN,
          isVerified: true,
          emailVerifiedAt: new Date(),
        }
      });

      // Ensure loyalty points entry (standard pattern)
      await prisma.loyaltyPoints.create({
        data: {
          userId: user.id,
          points: 0,
        }
      });

      logger.info("=================================================");
      logger.info("🔑 SECURE ADMIN ACCOUNT CREATED SUCCESSFULLY:");
      logger.info(`Username: ${email}`);
      logger.info(`Password: ${password}`);
      logger.info("=================================================");

      // Write to a temporary file so that Antigravity can read it
      const credsPath = path.join(__dirname, "../../../admin_credentials.txt");
      fs.writeFileSync(credsPath, `Admin Username: ${email}\nAdmin Password: ${password}\n`);
    } else {
      logger.info("✅ Database already has exactly one secure admin. Seeding skipped.");
    }
  } catch (error) {
    logger.error("❌ Failed to seed secure admin:", error);
  }
}

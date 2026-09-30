import { prisma } from "../config/prisma";
import { UserRole } from "@prisma/client";
import { logger } from "../config/logger";
import { hashPassword } from "./crypto";

export async function seedAdminUser() {
  try {
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      },
    });

    // If an admin already exists in the target DB (development or production), do not overwrite or delete
    if (existingAdmin) {
      logger.info(`✅ Admin user verified in DB (${existingAdmin.email}). Seeding skipped.`);
      return;
    }

    // If production admin environment variables are provided during deployment
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const email = process.env.ADMIN_EMAIL.toLowerCase().trim();
      const hashedPassword = await hashPassword(process.env.ADMIN_PASSWORD.trim());

      const user = await prisma.user.create({
        data: {
          name: "LOAVIA Admin",
          email,
          passwordHash: hashedPassword,
          phone: "9999999999",
          role: UserRole.SUPER_ADMIN,
          isVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      await prisma.loyaltyPoints.create({
        data: {
          userId: user.id,
          points: 0,
        },
      });

      logger.info(`✅ Production admin account created for ${email} with role SUPER_ADMIN.`);
      return;
    }

    // In production without existing admin or env vars, do not auto-generate throwaway credentials
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "⚠️ No admin account found in production database. Run 'npm run seed:admin:prod' or configure ADMIN_EMAIL and ADMIN_PASSWORD."
      );
      return;
    }

    // In local development only: create default development admin if no admin exists
    const devEmail = "admin_test@loavia.in";
    const devPassword = "AdminPassword@123";
    const hashedPassword = await hashPassword(devPassword);

    const user = await prisma.user.create({
      data: {
        name: "LOAVIA Dev Admin",
        email: devEmail,
        passwordHash: hashedPassword,
        phone: "9999999999",
        role: UserRole.SUPER_ADMIN,
        isVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.loyaltyPoints.create({
      data: {
        userId: user.id,
        points: 0,
      },
    });

    logger.info(`✅ Development admin created (${devEmail}).`);
  } catch (error) {
    logger.error("❌ Failed to seed admin user:", error);
  }
}

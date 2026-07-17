import { prisma } from "../config/prisma";
import { hashPassword } from "./crypto";
import { UserRole } from "@prisma/client";

async function main() {
  console.log("🧹 Starting full database cleanup...");
  
  // Deleting records in correct dependency order
  console.log("- Deleting Tracking Events...");
  await prisma.trackingEvent.deleteMany({});
  
  console.log("- Deleting Shipments...");
  await prisma.shipment.deleteMany({});
  
  console.log("- Deleting Payments...");
  await prisma.payment.deleteMany({});
  
  console.log("- Deleting Order Items...");
  await prisma.orderItem.deleteMany({});
  
  console.log("- Deleting Orders...");
  await prisma.order.deleteMany({});
  
  console.log("- Deleting Cart Items...");
  await prisma.cartItem.deleteMany({});
  
  console.log("- Deleting Carts...");
  await prisma.cart.deleteMany({});
  
  console.log("- Deleting Wishlist Items...");
  await prisma.wishlistItem.deleteMany({});
  
  console.log("- Deleting Wishlists...");
  await prisma.wishlist.deleteMany({});
  
  console.log("- Deleting Reviews...");
  await prisma.review.deleteMany({});
  
  console.log("- Deleting Loyalty Points...");
  await prisma.loyaltyPoints.deleteMany({});
  
  console.log("- Deleting Sessions...");
  await prisma.session.deleteMany({});
  
  console.log("- Deleting Audit Logs...");
  await prisma.auditLog.deleteMany({});
  
  console.log("- Deleting Verification Tokens...");
  await prisma.verificationToken.deleteMany({});
  
  console.log("- Deleting Contact Messages...");
  await prisma.contactMessage.deleteMany({});
  
  console.log("- Deleting Product Images...");
  await prisma.productImage.deleteMany({});
  
  console.log("- Deleting Inventory records...");
  await prisma.inventory.deleteMany({});
  
  console.log("- Deleting Product Variants...");
  await prisma.productVariant.deleteMany({});
  
  console.log("- Deleting Products...");
  await prisma.product.deleteMany({});
  
  console.log("- Deleting Categories...");
  await prisma.category.deleteMany({});
  
  console.log("- Deleting Tags...");
  await prisma.tag.deleteMany({});
  
  console.log("- Deleting Collections...");
  await prisma.collection.deleteMany({});
  
  console.log("- Deleting Settings...");
  await prisma.setting.deleteMany({});
  
  console.log("- Deleting Users...");
  await prisma.user.deleteMany({});
  
  console.log("✅ Database cleared successfully.");

  console.log("👤 Seeding stable secure admin user...");
  const adminEmail = "admin_test@loavia.in";
  const adminPassword = "AdminPassword@123";
  const hashedPassword = await hashPassword(adminPassword);
  
  const admin = await prisma.user.create({
    data: {
      name: "LOAVIA Admin",
      email: adminEmail,
      passwordHash: hashedPassword,
      phone: "9999999999",
      role: UserRole.SUPER_ADMIN,
      isVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Create loyalty points entry for the admin (standard pattern in schema)
  await prisma.loyaltyPoints.create({
    data: {
      userId: admin.id,
      points: 0,
    }
  });

  console.log(`✅ Stable secure admin user created in DB:`);
  console.log(`   - Username/Email: ${adminEmail}`);
  console.log(`   - Password:       ${adminPassword}`);
  console.log(`   - Role:           ${admin.role}`);
}

main()
  .catch((err) => {
    console.error("❌ Failed to clear/seed database:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

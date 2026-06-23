import app from "../app";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { UserRole, ProductStatus } from "@prisma/client";
import { hashPassword } from "./crypto";

const CUSTOMER_EMAIL = "customer_cart_test@loavia.in";
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
  console.log("🚀 Starting Cart & Wishlist Module E2E Integration Tests...");

  // Connect to Redis for guest sessions
  if (!redis.isOpen) {
    await redis.connect();
  }

  // Start Server on a random port
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  let customerCookie = "";
  let customerUser: any = null;

  try {
    // 1. Setup Database Users & Catalog mock data
    console.log("🧹 Cleaning test database records...");
    await prisma.cartItem.deleteMany({ where: { variant: { sku: { startsWith: "SKU-CART-TEST-" } } } });
    await prisma.wishlistItem.deleteMany({ where: { product: { sku: { startsWith: "SKU-CART-TEST-" } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-CART-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-CART-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-cart-test-" } } });
    await prisma.user.deleteMany({ where: { email: CUSTOMER_EMAIL } });

    console.log("👤 Creating test customer...");
    const hashedPassword = await hashPassword(TEST_PASSWORD);
    
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
    console.log("🔑 Authenticating test customer...");
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
    });
    const cookies = parseCookies(loginRes.headers.getSetCookie());
    customerCookie = `access_token=${cookies.access_token}`;

    // Create a mock parent category
    const category = await prisma.category.create({
      data: {
        name: "Cart Test Category",
        slug: "slug-cart-test-cat",
      },
    });

    console.log("📦 Seeding test products & variants...");
    // Create standard product
    const prod1Res = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Standard Cart Cookie",
        slug: "slug-cart-test-standard",
        description: "A standard premium cookie for testing.",
        ingredients: "Flour, Butter, Chocolate",
        sku: "SKU-CART-TEST-PROD1",
        status: ProductStatus.PUBLISHED,
        variants: {
          create: [
            { name: "Cookie Alpha", sku: "SKU-CART-TEST-V1", price: 1000, stockQuantity: 10, isDefault: true },
            { name: "Cookie Beta", sku: "SKU-CART-TEST-V2", price: 1500, stockQuantity: 5 },
          ],
        },
      },
      include: {
        variants: true,
      },
    });

    // Manually create inventory records for Product 1 variants
    const v1 = prod1Res.variants.find((v) => v.sku === "SKU-CART-TEST-V1")!;
    const v2 = prod1Res.variants.find((v) => v.sku === "SKU-CART-TEST-V2")!;
    await prisma.inventory.create({ data: { variantId: v1.id, availableQty: 10 } });
    await prisma.inventory.create({ data: { variantId: v2.id, availableQty: 5 } });

    // Create custom box shell product (Build Your Own Box - 6 Pack)
    const prod2Res = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "BYOB Cookie Box",
        slug: "slug-cart-test-byob",
        description: "A customizable cookie box.",
        ingredients: "Cardboard, Love",
        sku: "SKU-CART-TEST-PROD2",
        status: ProductStatus.PUBLISHED,
        variants: {
          create: [
            { name: "Build Your Own Box - 6 Pack", sku: "SKU-CART-TEST-BYOB6", price: 5000, stockQuantity: 3, isDefault: true },
          ],
        },
      },
      include: {
        variants: true,
      },
    });

    const vByob6 = prod2Res.variants.find((v) => v.sku === "SKU-CART-TEST-BYOB6")!;
    await prisma.inventory.create({ data: { variantId: vByob6.id, availableQty: 3 } });

    // Create a draft product (to test wishlist/cart rejection)
    const draftProd = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Draft Cart Cookie",
        slug: "slug-cart-test-draft",
        description: "A draft cookie.",
        ingredients: "Flour",
        sku: "SKU-CART-TEST-DRAFT",
        status: ProductStatus.DRAFT,
        variants: {
          create: [
            { name: "Draft Variant", sku: "SKU-CART-TEST-VDRAFT", price: 800, stockQuantity: 2, isDefault: true },
          ],
        },
      },
      include: {
        variants: true,
      },
    });

    const vDraft = draftProd.variants.find((v) => v.sku === "SKU-CART-TEST-VDRAFT")!;
    await prisma.inventory.create({ data: { variantId: vDraft.id, availableQty: 2 } });

    // 3. Test Guest Cart Operations (Redis-backed)
    console.log("🛒 Testing Guest Cart CRUD...");
    const guestSession = "SESSION-GUEST-CART-TEST";

    // A. Add Item
    const addGuestRes = await fetch(`${baseUrl}/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": guestSession },
      body: JSON.stringify({ variantId: v1.id, quantity: 3 }),
    });
    const addGuestData = await addGuestRes.json() as any;
    if (addGuestRes.status !== 200 || !addGuestData.success) {
      throw new Error(`Failed to add guest item: ${JSON.stringify(addGuestData)}`);
    }
    if (addGuestData.data.items.length !== 1 || addGuestData.data.items[0].quantity !== 3) {
      throw new Error("Guest cart item list mismatch");
    }

    // B. Add second item
    const addGuestRes2 = await fetch(`${baseUrl}/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": guestSession },
      body: JSON.stringify({ variantId: v2.id, quantity: 2 }),
    });
    const addGuestData2 = await addGuestRes2.json() as any;
    if (addGuestData2.data.items.length !== 2) {
      throw new Error("Failed to add second guest item");
    }

    // C. Rejection when stock exceeded
    const addGuestOverRes = await fetch(`${baseUrl}/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": guestSession },
      body: JSON.stringify({ variantId: v2.id, quantity: 10 }), // Stock is 5
    });
    const addGuestOverData = await addGuestOverRes.json() as any;
    if (addGuestOverRes.status !== 400 || addGuestOverData.success) {
      throw new Error("Should have rejected stock-exceeded guest addition");
    }

    // D. Update Quantity
    const guestItemId = addGuestData2.data.items.find((i: any) => i.variantId === v1.id).id;
    const updateGuestRes = await fetch(`${baseUrl}/cart/items/${guestItemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-session-id": guestSession },
      body: JSON.stringify({ quantity: 5 }),
    });
    const updateGuestData = await updateGuestRes.json() as any;
    if (updateGuestRes.status !== 200 || updateGuestData.data.items.find((i: any) => i.variantId === v1.id).quantity !== 5) {
      throw new Error("Failed to update guest item quantity");
    }

    // E. Remove Item
    const removeGuestRes = await fetch(`${baseUrl}/cart/items/${guestItemId}`, {
      method: "DELETE",
      headers: { "x-session-id": guestSession },
    });
    const removeGuestData = await removeGuestRes.json() as any;
    if (removeGuestData.data.items.some((i: any) => i.variantId === v1.id)) {
      throw new Error("Failed to remove guest item");
    }

    // F. Clear Cart
    const clearGuestRes = await fetch(`${baseUrl}/cart`, {
      method: "DELETE",
      headers: { "x-session-id": guestSession },
    });
    const clearGuestData = await clearGuestRes.json() as any;
    if (clearGuestData.data.items.length !== 0) {
      throw new Error("Failed to clear guest cart");
    }
    console.log("  ↳ Guest cart CRUD passed.");

    // 4. Test BYOB Custom Box validations
    console.log("📦 Testing BYOB Box Validation...");
    // A. Valid BYOB Custom box (6 slots: Alpha = 4, Beta = 2)
    const addByobRes = await fetch(`${baseUrl}/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": guestSession },
      body: JSON.stringify({
        variantId: vByob6.id,
        quantity: 1,
        isCustomBox: true,
        customBoxSelections: [
          { variantId: v1.id, quantity: 4 },
          { variantId: v2.id, quantity: 2 },
        ],
      }),
    });
    const addByobData = await addByobRes.json() as any;
    if (addByobRes.status !== 200 || !addByobData.success) {
      throw new Error(`Failed to add valid BYOB box: ${JSON.stringify(addByobData)}`);
    }

    // B. Invalid BYOB slots count (5 slots instead of 6)
    const addByobBadSlotsRes = await fetch(`${baseUrl}/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": guestSession },
      body: JSON.stringify({
        variantId: vByob6.id,
        quantity: 1,
        isCustomBox: true,
        customBoxSelections: [
          { variantId: v1.id, quantity: 3 },
          { variantId: v2.id, quantity: 2 },
        ],
      }),
    });
    const addByobBadSlotsData = await addByobBadSlotsRes.json() as any;
    if (addByobBadSlotsRes.status !== 400 || addByobBadSlotsData.success) {
      throw new Error("Should have rejected BYOB box with invalid slot counts");
    }

    // C. Invalid BYOB Selection Stock (needs 6 Beta cookies, but only 5 in stock)
    const addByobOverStockRes = await fetch(`${baseUrl}/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": guestSession },
      body: JSON.stringify({
        variantId: vByob6.id,
        quantity: 1,
        isCustomBox: true,
        customBoxSelections: [
          { variantId: v2.id, quantity: 6 }, // 6 * 1 = 6 beta cookies
        ],
      }),
    });
    const addByobOverStockData = await addByobOverStockRes.json() as any;
    if (addByobOverStockRes.status !== 400 || addByobOverStockData.success) {
      throw new Error("Should have rejected BYOB box with insufficient selection stock");
    }
    console.log("  ↳ BYOB validations passed.");

    // Clear guest cart for clean merge test
    await fetch(`${baseUrl}/cart`, { method: "DELETE", headers: { "x-session-id": guestSession } });

    // 5. Test Authenticated User Cart Operations
    console.log("🛒 Testing Authenticated User Cart CRUD...");
    // A. Add standard item
    const addUserRes = await fetch(`${baseUrl}/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ variantId: v1.id, quantity: 2 }),
    });
    const addUserData = await addUserRes.json() as any;
    if (addUserRes.status !== 200 || !addUserData.success) {
      throw new Error(`Failed to add user cart item: ${JSON.stringify(addUserData)}`);
    }

    // B. Add second item
    await fetch(`${baseUrl}/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ variantId: v2.id, quantity: 2 }),
    });
    console.log("  ↳ Authenticated User cart CRUD passed.");

    // 6. Test Cart Merging with Stock Clamping
    console.log("🔗 Testing Cart Merging & Stock Clamping...");
    // Setup guest items:
    // - V1 (Alpha): Guest has 12 items. User has 2 items in DB cart. Combined = 14. Stock is 10. Clamps to 10.
    // - V2 (Beta): Guest has 1 item. User has 2 items in DB cart. Combined = 3. Stock is 5. Stays at 3.
    const guestItemsToMerge = [
      { variantId: v1.id, quantity: 12, isCustomBox: false },
      { variantId: v2.id, quantity: 1, isCustomBox: false },
    ];

    const mergeRes = await fetch(`${baseUrl}/cart/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ items: guestItemsToMerge }),
    });
    const mergeData = await mergeRes.json() as any;

    if (mergeRes.status !== 200 || !mergeData.success) {
      throw new Error(`Failed to merge cart: ${JSON.stringify(mergeData)}`);
    }

    // Verify clamping
    const clampedV1 = mergeData.data.clampedItems.find((i: any) => i.variantId === v1.id);
    if (!clampedV1 || clampedV1.originalQty !== 14 || clampedV1.clampedQty !== 10) {
      throw new Error(`Clamping details incorrect for Variant 1: ${JSON.stringify(mergeData.data.clampedItems)}`);
    }

    // Verify DB cart state
    const dbCartState = await prisma.cart.findUnique({
      where: { userId: customerUser.id },
      include: { items: true },
    });
    const dbV1 = dbCartState?.items.find((i) => i.variantId === v1.id);
    const dbV2 = dbCartState?.items.find((i) => i.variantId === v2.id);

    if (dbV1?.quantity !== 10 || dbV2?.quantity !== 3) {
      throw new Error(`DB cart state incorrect after merge. V1 Qty: ${dbV1?.quantity} (expected 10), V2 Qty: ${dbV2?.quantity} (expected 3)`);
    }
    console.log("  ↳ Cart merging and stock clamping passed.");

    // 7. Test Wishlist CRUD Operations
    console.log("❤️ Testing Wishlist CRUD...");
    // A. Add to Wishlist
    const addWishRes = await fetch(`${baseUrl}/wishlist/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: prod1Res.id }),
    });
    const addWishData = await addWishRes.json() as any;
    if (addWishRes.status !== 200 || !addWishData.success) {
      throw new Error(`Failed to add item to wishlist: ${JSON.stringify(addWishData)}`);
    }

    // B. Duplicate protection (idempotent addition)
    const addWishDupRes = await fetch(`${baseUrl}/wishlist/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: prod1Res.id }),
    });
    const addWishDupData = await addWishDupRes.json() as any;
    if (addWishDupRes.status !== 200 || addWishDupData.data.id !== addWishData.data.id) {
      throw new Error("Wishlist duplicate addition was not idempotent");
    }

    // C. Rejected draft product addition
    const addWishDraftRes = await fetch(`${baseUrl}/wishlist/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({ productId: draftProd.id }), // Draft status
    });
    const addWishDraftData = await addWishDraftRes.json() as any;
    if (addWishDraftRes.status !== 400 || addWishDraftData.success) {
      throw new Error("Should have rejected draft product addition to wishlist");
    }

    // D. Get Wishlist
    const getWishRes = await fetch(`${baseUrl}/wishlist`, {
      method: "GET",
      headers: { Cookie: customerCookie },
    });
    const getWishData = await getWishRes.json() as any;
    if (getWishData.data.items.length !== 1 || getWishData.data.items[0].productId !== prod1Res.id) {
      throw new Error("Wishlist fetch items mismatch");
    }

    // E. Remove from Wishlist
    const removeWishRes = await fetch(`${baseUrl}/wishlist/items/${prod1Res.id}`, {
      method: "DELETE",
      headers: { Cookie: customerCookie },
    });
    const removeWishData = await removeWishRes.json() as any;
    if (removeWishRes.status !== 200 || !removeWishData.success) {
      throw new Error("Failed to remove item from wishlist");
    }

    const checkWishRes = await prisma.wishlistItem.findMany({
      where: { wishlist: { userId: customerUser.id } },
    });
    if (checkWishRes.length !== 0) {
      throw new Error("Wishlist item still exists in database after removal");
    }
    console.log("  ↳ Wishlist CRUD passed.");

    // 8. Test Audit Logging
    console.log("📝 Verifying Cart & Wishlist Audit Logging...");
    const cartLogs = await prisma.auditLog.findMany({
      where: {
        userId: customerUser.id,
        action: { in: ["CART_ITEM_ADDED", "CART_ITEM_UPDATED", "CART_ITEM_REMOVED", "CART_MERGED", "WISHLIST_ITEM_ADDED", "WISHLIST_ITEM_REMOVED"] },
      },
    });

    if (cartLogs.length === 0) {
      throw new Error("No audit logs written for cart or wishlist actions");
    }
    console.log(`  ↳ Audit logging verified. Recorded ${cartLogs.length} audit logs.`);

    // 9. RBAC Restriction Gate
    console.log("🛡️ Testing RBAC access gates...");
    const rbacRes = await fetch(`${baseUrl}/wishlist`, {
      method: "GET",
    });
    if (rbacRes.status !== 401) {
      throw new Error(`Wishlist should be unauthorized without token, got: ${rbacRes.status}`);
    }
    console.log("  ↳ RBAC gates passed.");

    console.log("\n🎉 ALL CART & WISHLIST MODULE E2E INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Integration Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    console.log("🧹 Cleaning up test database records...");
    await prisma.cartItem.deleteMany({ where: { variant: { sku: { startsWith: "SKU-CART-TEST-" } } } });
    await prisma.wishlistItem.deleteMany({ where: { product: { sku: { startsWith: "SKU-CART-TEST-" } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: "SKU-CART-TEST-" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SKU-CART-TEST-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "slug-cart-test-" } } });
    await prisma.user.deleteMany({ where: { email: CUSTOMER_EMAIL } });
    await prisma.$disconnect();
    
    if (redis.isOpen) {
      await redis.disconnect();
    }
    server.close();
  }
}

runTests();

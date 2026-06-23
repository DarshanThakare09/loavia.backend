# LOAVIA Backend Implementation Plan
### Derived from: LOAVIA Backend Architecture V2 (Approved)
### Scope: Implementation blueprint only — no code

This document translates the approved Architecture V2 (Sections 1–25) into an execution-ready blueprint: schema, migration order, folder layout, build order, and the four-layer (Controller → Service → Repository → Validator) implementation plan, plus middleware and testing strategy.

> **Traceability note:** Every model, enum, and endpoint below is taken directly from Architecture V2 Sections 6–8 (Database Design / ERD / Prisma Schema) and Section 18 (API Endpoint Specifications). Section 18 lists a representative endpoint set, not an exhaustive one — the architecture's own ERD and RBAC matrix (Section 3) imply additional resources (wishlist, reviews, coupons, admin inventory/dashboard) that have models but no listed routes. Where this plan adds endpoints to cover those models, they are explicitly marked **[Inferred from schema/RBAC, not in Section 18]** so nothing is silently invented as if it were already approved.

---

## 1. Prisma Models

All 14 models exactly as specified in Architecture V2 §8, organized by domain. Field-level detail (types, `@map`, constraints) is already final in the approved schema — this section restates structure and *relationships* so the build order in Section 2 is traceable to a reason.

### 1.1 Identity & Access
| Model | Key Relations | Notes |
|---|---|---|
| `User` | 1:N → Address, Order, Review, WishlistItem, CartItem; 1:1 → LoyaltyPoints; 1:N → Session | `role` enum drives RBAC (§3) |
| `Session` | N:1 → User | Stores hashed refresh token, supports Refresh Token Rotation (§9) |
| `Address` | N:1 → User | Snapshotted into `Order.shippingAddress` at checkout, not referenced live |

### 1.2 Catalog & Inventory
| Model | Key Relations | Notes |
|---|---|---|
| `Product` | 1:N → ProductImage, OrderItem, Review, WishlistItem, CartItem; 1:1 → Inventory | Price stored in paise (Int) |
| `ProductImage` | N:1 → Product | Cloudinary secure URLs only |
| `Inventory` | 1:1 → Product | `availableQty`, `reservedQty` — subject to row-level locking (§11) |

### 1.3 Cart & Commerce
| Model | Key Relations | Notes |
|---|---|---|
| `CartItem` | N:1 → User, Product | `@@unique([userId, productId])`; `customBoxSelections` Json for BYOB |
| `Coupon` | none (standalone) | Validated against `Order.subtotal` at checkout |
| `WishlistItem` | N:1 → User, Product | `@@unique([userId, productId])` — junction table per §7 |

### 1.4 Orders & Payments
| Model | Key Relations | Notes |
|---|---|---|
| `Order` | N:1 → User (nullable, `SetNull`); 1:N → OrderItem; 1:1 → Payment | `status` enum drives the state machine (§15) |
| `OrderItem` | N:1 → Order, Product (nullable, `SetNull`) | Snapshots `name`/`price` at time of order |
| `Payment` | 1:1 → Order | Stores Razorpay `gatewayPaymentId`, `gatewayOrderId`, `gatewaySignature` |

### 1.5 Engagement
| Model | Key Relations | Notes |
|---|---|---|
| `Review` | N:1 → Product, User | `status` enum gates visibility (moderation per §3 RBAC) |
| `LoyaltyPoints` | 1:1 → User | Simple point ledger, no transaction history table in V2 |

### 1.6 Enums (as defined in §8)
- `Role`: CUSTOMER, STAFF, ADMIN, SUPER_ADMIN
- `OrderStatus`: PENDING, PAID, PROCESSING, PACKED, SHIPPED, DELIVERED, CANCELLED, RETURNED, REFUNDED
- `CouponType`: PERCENTAGE, FIXED
- `ReviewStatus`: PENDING, APPROVED, REJECTED, HIDDEN

### 1.7 Schema Gap Flagged for Confirmation
Architecture §15 requires that **status alterations are logged in an `AuditLogs` table** tracking user role and timestamp, "to prevent manual overrides of completed orders." No `AuditLog` model exists in the §8 Prisma schema.
**This plan does not add an unapproved model.** It is flagged here as an open item — recommend confirming with whoever owns Architecture V2 whether `AuditLog` should be added in a follow-up schema revision before Phase 5 (Orders) begins, since the state-machine guard described in §15 cannot be fully implemented without it.

---

## 2. Database Migration Order

Migrations must respect foreign-key dependency direction. Each migration is additive and independently runnable via `prisma migrate dev`.

| # | Migration | Models Created | Depends On |
|---|---|---|---|
| 01 | `init_enums` | `Role`, `OrderStatus`, `CouponType`, `ReviewStatus` | — |
| 02 | `create_users` | `User` | 01 |
| 03 | `create_sessions` | `Session` | 02 |
| 04 | `create_addresses` | `Address` | 02 |
| 05 | `create_products` | `Product` | — |
| 06 | `create_product_images` | `ProductImage` | 05 |
| 07 | `create_inventories` | `Inventory` | 05 |
| 08 | `create_coupons` | `Coupon` | — |
| 09 | `create_orders` | `Order` | 02 (nullable FK) |
| 10 | `create_order_items` | `OrderItem` | 09, 05 (nullable FK) |
| 11 | `create_payments` | `Payment` | 09 |
| 12 | `create_reviews` | `Review` | 05, 02 |
| 13 | `create_wishlist_items` | `WishlistItem` | 02, 05 |
| 14 | `create_cart_items` | `CartItem` | 02, 05 |
| 15 | `create_loyalty_points` | `LoyaltyPoints` | 02 |
| 16 | `add_indexes` | Unique/GIN indexes (`email`, `slug`, name GIN, `receipt_number`, `userId` indexes) | All above |

**Rationale for ordering:**
- Enums always precede any table referencing them.
- `User` and `Product` are independent roots and migrate first (parallel-safe — no FK between them).
- Tables with nullable `SetNull`/`Cascade` foreign keys (e.g., `Order.userId`, `OrderItem.productId`) still must migrate *after* their referenced table to satisfy the FK constraint at the DDL level, even though the relation is optional at the data level.
- The GIN index on `Product.name` (§6) and other index-only changes are isolated into migration 16 so they can be re-run/tuned independently of structural changes without touching table definitions.

**Seed data** (run after migration 16, not a migration itself): a small `prisma/seed.ts` plan should pre-populate the three BYOB "box shell" virtual products (6/12/24-pack, per §10) plus their `Inventory` rows, since checkout validation logic in Phase 4 depends on these existing.

---

## 3. Backend Folder Structure

This is the exact structure approved in Architecture V2 §24, expanded one level to show where each upcoming section's artifacts will live.

```
src/
├── config/
│   ├── db.ts                 # Prisma client singleton
│   ├── redis.ts               # Redis client singleton
│   ├── cloudinary.ts          # Cloudinary SDK config
│   ├── razorpay.ts            # Razorpay SDK config
│   ├── resend.ts              # Resend client config
│   └── env.ts                 # Parsed/validated environment variables
│
├── controllers/
│   ├── auth.controller.ts
│   ├── user.controller.ts
│   ├── product.controller.ts
│   ├── cart.controller.ts
│   ├── checkout.controller.ts
│   ├── order.controller.ts
│   ├── payment.controller.ts
│   ├── review.controller.ts
│   ├── wishlist.controller.ts
│   ├── coupon.controller.ts          # [Inferred from schema/RBAC]
│   └── admin/
│       ├── admin.product.controller.ts
│       ├── admin.inventory.controller.ts
│       ├── admin.order.controller.ts
│       └── admin.dashboard.controller.ts
│
├── middleware/
│   ├── auth.middleware.ts            # JWT verification, req.user population
│   ├── rbac.middleware.ts            # Role-gate guard
│   ├── rateLimiter.middleware.ts
│   ├── validate.middleware.ts        # Zod schema runner
│   ├── errorHandler.middleware.ts    # Global error + Sentry capture
│   └── webhookRaw.middleware.ts      # Raw-body capture for Razorpay signature checks
│
├── models/
│   └── types.ts                      # Shared TS types (AuthenticatedRequest, etc.)
│
├── repositories/
│   ├── user.repository.ts
│   ├── session.repository.ts
│   ├── address.repository.ts
│   ├── product.repository.ts
│   ├── inventory.repository.ts
│   ├── cart.repository.ts
│   ├── coupon.repository.ts
│   ├── order.repository.ts
│   ├── payment.repository.ts
│   ├── review.repository.ts
│   └── wishlist.repository.ts
│
├── routes/
│   ├── index.ts                      # Mounts all /api/v1 routers
│   ├── auth.routes.ts
│   ├── user.routes.ts
│   ├── product.routes.ts
│   ├── cart.routes.ts
│   ├── checkout.routes.ts
│   ├── order.routes.ts
│   ├── payment.routes.ts
│   ├── review.routes.ts
│   ├── wishlist.routes.ts
│   └── admin.routes.ts
│
├── services/
│   ├── auth.service.ts
│   ├── user.service.ts
│   ├── product.service.ts
│   ├── inventory.service.ts
│   ├── cart.service.ts
│   ├── checkout.service.ts           # pricing pipeline, §13
│   ├── order.service.ts              # state machine, §15
│   ├── payment.service.ts            # Razorpay create/verify, §14
│   ├── review.service.ts
│   ├── wishlist.service.ts
│   ├── coupon.service.ts
│   ├── email.service.ts              # Resend wrapper, §16
│   └── upload.service.ts             # Cloudinary wrapper, §17
│
├── utils/
│   ├── signature.ts                  # Razorpay HMAC verification, §14
│   ├── money.ts                      # Paise <-> Rupee helpers, integer rounding
│   ├── jwt.ts                        # Sign/verify access & refresh tokens
│   ├── cache.ts                      # Cache-aside read/invalidate helpers, §20
│   ├── apiResponse.ts                # Standard {success, data, message} envelope
│   └── slug.ts                       # Slug generation for products
│
└── validators/
    ├── auth.validator.ts
    ├── user.validator.ts
    ├── product.validator.ts
    ├── cart.validator.ts
    ├── checkout.validator.ts
    ├── order.validator.ts
    ├── payment.validator.ts
    ├── review.validator.ts
    └── coupon.validator.ts
```

---

## 4. API Implementation Order

Endpoints are sequenced to match the Phased Roadmap (§25) and each phase's stated dependency chain. Endpoints explicitly listed in §18 are marked **[§18]**; resources implied by the schema/RBAC matrix but not enumerated in §18 are marked **[Inferred]**.

### Phase 1 dependency: none — schema only (Section 2 above)

### Phase 2 — Auth & Profile
1. `POST /api/v1/auth/register` **[§18]**
2. `POST /api/v1/auth/login` **[§18]**
3. `POST /api/v1/auth/refresh` **[§18]**
4. `POST /api/v1/auth/logout` **[§18]**
5. `GET /api/v1/user/profile` **[§18]**
6. `PUT /api/v1/user/addresses` **[§18]**
7. `GET /api/v1/user/addresses` **[Inferred — needed to list before upsert/select-default at checkout]**

### Phase 3 — Catalog
8. `GET /api/v1/products` **[§18]**
9. `GET /api/v1/products/:slug` **[§18]**
10. `POST /api/v1/products` (admin/super_admin) **[§18]**
11. `PUT /api/v1/products/:id` (admin/super_admin) **[§18]**
12. `POST /api/v1/products/:id/images` (admin/super_admin) **[Inferred — Cloudinary upload flow, §17 needs an endpoint]**
13. `GET /api/v1/products/:slug/reviews` **[Inferred — Review model has no listed read route]**

### Phase 4 — Cart, Wishlist & Checkout Pricing
14. `GET /api/v1/cart` **[§18]**
15. `POST /api/v1/cart/merge` **[§18]**
16. `POST /api/v1/cart/items` **[Inferred — add single item to DB cart]**
17. `PUT /api/v1/cart/items/:id` **[Inferred — update qty]**
18. `DELETE /api/v1/cart/items/:id` **[Inferred]**
19. `GET /api/v1/wishlist` **[Inferred]**
20. `POST /api/v1/wishlist/:productId` **[Inferred]**
21. `DELETE /api/v1/wishlist/:productId` **[Inferred]**
22. `POST /api/v1/checkout/validate` **[§18]**

### Phase 5 — Orders & State Machine
23. `POST /api/v1/checkout/place-order` **[§18]**
24. `GET /api/v1/orders/:id` **[§18]**
25. `GET /api/v1/orders/tracking/:receipt` **[§18]**
26. `GET /api/v1/orders` (current user's order history) **[Inferred — customer dashboard needs a list view]**

### Phase 6 — Payment Integration
27. `POST /api/v1/checkout/verify` **[§18]**
28. `POST /api/v1/payments/webhook` **[§18, named in Request Lifecycle §2 diagram]**

### Phase 7 — Admin Console
29. `PUT /api/v1/admin/orders/:id/status` **[§18]**
30. `GET /api/v1/admin/orders` **[Inferred — order queue for staff/admin]**
31. `PUT /api/v1/admin/inventory/:productId` **[Inferred — stock hydration, §5 Admin Journey]**
32. `GET /api/v1/admin/dashboard/sales` **[Inferred — §3 grants "View Sales Analytics" to Admin/Super Admin]**
33. `POST /api/v1/admin/coupons` **[Inferred — §3 grants "Create Coupons" to Admin/Super Admin]**
34. `GET /api/v1/admin/coupons` **[Inferred]**
35. `PUT /api/v1/admin/reviews/:id/moderate` **[Inferred — §3 grants "Moderate Reviews" to Staff/Admin]**
36. `POST /api/v1/reviews` (customer submits review) **[Inferred — §3 grants "Submit Review" to Customer]**

> Endpoints marked **[Inferred]** should be confirmed against the actual product/UI requirements before Phase 4–7 implementation starts — they are derived from the RBAC matrix and ERD, not from an explicit route list, so naming/shape may need adjustment once frontend contracts are finalized.

---

## 5. Repository Layer Plan

Repositories are the **only** layer permitted to call `prisma.*` directly (per the MCSR pattern in §2's Request Lifecycle). Each repository exposes narrow, intention-revealing methods — no generic `findAll`/`update` passthroughs that leak Prisma's query shape into the service layer.

| Repository | Responsibilities | Notable Constraints |
|---|---|---|
| `user.repository.ts` | findByEmail, findById, create, updateProfile | Never returns `passwordHash` to callers outside auth.service |
| `session.repository.ts` | create, findByRefreshTokenHash, invalidate, invalidateAllForUser | Backs Refresh Token Rotation (§9) |
| `address.repository.ts` | listByUser, upsert, setDefault | Enforces single-default-per-user at the data layer |
| `product.repository.ts` | findMany (filtered), findBySlug, create, update, search (GIN index) | Read methods are the ones wrapped by Redis cache-aside in the service layer |
| `inventory.repository.ts` | findByProductId, lockRowsForUpdate (`SELECT ... FOR UPDATE`), adjustQuantities | Houses the raw `$queryRaw` locking logic from §11 — isolated here so no other layer touches raw SQL |
| `cart.repository.ts` | listByUser, upsertItem, removeItem, bulkUpsert (for merge) | `bulkUpsert` backs the cart-merge protocol (§12) |
| `coupon.repository.ts` | findByCode, create, listActive | |
| `order.repository.ts` | create (within transaction), findById, findByReceipt, findByUser, updateStatus | `create` always called inside the same `$transaction` as inventory locking |
| `payment.repository.ts` | create, findByGatewayOrderId, findByOrderId | |
| `review.repository.ts` | create, findByProduct (approved only), findPendingForModeration, updateStatus | |
| `wishlist.repository.ts` | listByUser, add, remove | |

**Cross-cutting rule:** Repositories never invoke other repositories. Cross-entity orchestration (e.g., decrementing inventory *and* creating an order) belongs to the service layer, which composes repository calls inside a shared Prisma transaction handle passed down as an argument.

---

## 6. Service Layer Plan

Services hold all business logic — calculations, multi-step orchestration, third-party SDK calls — and are the only layer that composes multiple repositories or external integrations.

| Service | Responsibilities | Key Architecture Reference |
|---|---|---|
| `auth.service.ts` | Register, login, issue/rotate JWT pairs, RTR breach detection | §9 |
| `user.service.ts` | Profile retrieval, address upsert orchestration | §6 (users, addresses) |
| `product.service.ts` | Catalog reads (cache-aside via `utils/cache.ts`), product CRUD, cache invalidation on write | §20 |
| `inventory.service.ts` | Stock checks, low-stock alert trigger (calls `email.service`), reservation release on order timeout | §11 |
| `cart.service.ts` | Cart-merge orchestration, BYOB selection validation (slot count, stock check) | §10, §12 |
| `checkout.service.ts` | Full pricing pipeline: subtotal → coupon discount → 18% GST → shipping (free >₹999) → total | §13 |
| `order.service.ts` | Order creation inside `$transaction` (locks inventory via repository, decrements stock), status transition state machine with guard rules (e.g., no `SHIPPED → CANCELLED`) | §11, §15 |
| `payment.service.ts` | Create Razorpay order, verify HMAC signature, process webhook idempotently | §14 |
| `review.service.ts` | Submit review (status: PENDING), moderation transitions | §3, §6 |
| `wishlist.service.ts` | Add/remove with existence checks | §7 |
| `coupon.service.ts` | Validate code (expiry, min order value, active flag), compute discount amount | §13 |
| `email.service.ts` | Wraps Resend calls: order confirmation, low-stock alert, shipment notification | §16 |
| `upload.service.ts` | Validates file size/type (≤5MB, jpeg/png/webp), streams to Cloudinary, returns secure URL | §17 |

**Transaction ownership rule:** Any service method that must satisfy ACID guarantees (per §1 Data Integrity goal) — specifically order placement and inventory adjustment — opens the `prisma.$transaction` and passes the transaction client (`tx`) into repository calls. Services never let a repository open its own top-level transaction when it's part of a larger multi-step write.

**Idempotency rule for `payment.service.ts`:** Because both the client-driven `/checkout/verify` call and the Razorpay webhook (§14, "Webhook Redundancy") can independently mark the same order `PAID`, the service must treat order-status-to-PAID as idempotent (check current status before transitioning, short-circuit if already `PAID`).

---

## 7. Controller Layer Plan

Controllers are thin: parse `req`, call exactly one service method (or a small, explicit sequence for genuinely composite actions), map the result to the standard `{success, data, message}` envelope (§18), and forward errors to `errorHandler.middleware.ts` via `next(err)`.

| Controller | Endpoints Owned | Notes |
|---|---|---|
| `auth.controller.ts` | register, login, refresh, logout | Sets/clears HTTP-only cookies per §9 cookie config |
| `user.controller.ts` | profile, addresses (list/upsert) | Reads `req.user` populated by auth middleware |
| `product.controller.ts` | catalog list, detail, create, update, image upload | Query param parsing for `category`/`mood`/`tag` filters (§18) |
| `cart.controller.ts` | cart CRUD, merge | |
| `checkout.controller.ts` | validate, place-order, verify | `place-order` and `verify` are the two most security-sensitive controllers — no business logic here, pure delegation to `checkout.service`/`payment.service` |
| `order.controller.ts` | order detail, tracking, history | Tracking-by-receipt is public (no auth middleware applied) |
| `payment.controller.ts` | webhook receiver | Uses `webhookRaw.middleware.ts` to preserve raw body for signature verification *before* JSON body-parsing mutates it |
| `review.controller.ts` | submit, list-by-product | |
| `wishlist.controller.ts` | list, add, remove | |
| `admin/admin.product.controller.ts` | admin product CRUD passthrough (delegates to `product.service` with elevated checks already enforced by middleware) | |
| `admin/admin.inventory.controller.ts` | stock adjustment | |
| `admin/admin.order.controller.ts` | status transition, order queue | |
| `admin/admin.dashboard.controller.ts` | sales analytics reads | |

---

## 8. Middleware Plan

Ordered exactly as the Request Lifecycle diagram in §2 specifies, applied globally unless noted as route-specific.

| Order | Middleware | Purpose | Scope |
|---|---|---|---|
| 1 | `helmet()` | Secure HTTP headers (HSTS, CSP, clickjacking) | Global |
| 2 | `cors()` | Restrict origin to `FRONTEND_URL`, `credentials: true` | Global |
| 3 | `webhookRaw.middleware.ts` | Capture raw body for `/payments/webhook` only, before JSON parsing | Route-specific, mounted before `express.json()` |
| 4 | `express.json()` / `express.urlencoded()` | Body parsing | Global (excludes webhook route) |
| 5 | `rateLimiter.middleware.ts` (`publicLimiter`) | 100 req/15min per IP per §19 | Global, with stricter variants for `/auth/*` |
| 6 | `auth.middleware.ts` | Read `access_token` cookie, verify JWT, populate `req.user` | All routes except public catalog/tracking/webhook |
| 7 | `rbac.middleware.ts` | Role-gate (e.g., `requireRole(['ADMIN','SUPER_ADMIN'])`) | Admin/staff-only routes, per §3 matrix |
| 8 | `validate.middleware.ts` | Run the route's Zod schema against `req.body`/`req.query`/`req.params`; strip unrecognized keys | Per-route, applied in route definitions |
| 9 | Route handler (controller) | — | — |
| 10 | `errorHandler.middleware.ts` | Catch-all; maps thrown errors to status codes, captures 5xx to Sentry per §21 | Global, registered last |

**Auth middleware refresh handling:** When the access token is expired but a valid refresh cookie is present, `auth.middleware.ts` does **not** silently refresh inline — it returns `401` and the client is expected to call `/api/v1/auth/refresh` explicitly (matches the architecture's diagram in §9, which shows refresh as a distinct client-triggered flow, not transparent middleware retry).

---

## 9. Validation Schemas (Zod)

One schema file per resource; each schema is referenced by `validate.middleware.ts` per-route. Listed by the fields/constraints already implied by the approved Prisma schema (§8) and business rules (§10–§15) — not inventing new constraints.

| Schema File | Key Schemas | Constraints Sourced From |
|---|---|---|
| `auth.validator.ts` | `registerSchema`, `loginSchema` | `User.email` unique/VarChar(255), password min-length policy (not specified in V2 — flag for product decision), `phone` optional |
| `user.validator.ts` | `addressUpsertSchema` | `Address` field lengths/required-ness per §6 #2 |
| `product.validator.ts` | `createProductSchema`, `updateProductSchema`, `productQuerySchema` | `Product` fields §6 #3; price/discountPrice as positive integers (paise) |
| `cart.validator.ts` | `cartItemSchema`, `cartMergeSchema` | Must include `customBoxSelections` shape validation tied to BYOB rules: pack count ∈ {6,12,24}, per §10 |
| `checkout.validator.ts` | `checkoutValidateSchema`, `placeOrderSchema` | Coupon code optional string, shipping address reference, no price fields accepted from client (server computes per §13 integrity rule) |
| `order.validator.ts` | `orderStatusUpdateSchema` | `status` must be one of `OrderStatus` enum; transition legality checked in service layer, not validator (validator only checks shape/enum membership) |
| `payment.validator.ts` | `verifyPaymentSchema` | `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature` all required strings, per §14 signature function signature |
| `review.validator.ts` | `createReviewSchema` | `rating` integer 1–5 (DB constraint mirrored at validation layer), `comment` required text |
| `coupon.validator.ts` | `createCouponSchema` | `discountType` ∈ CouponType enum, `value`/`minOrderValue`/`maxDiscount` positive integers, `expiresAt` future date |

**Shared rule:** every schema uses `.strict()` (or equivalent) so unrecognized properties are rejected/stripped, matching the "Unrecognized properties are stripped" rule in §19.

---

## 10. Testing Strategy

Aligned to Phase 8 (§25) — "Jest unit tests, integration validation scripts" — expanded into concrete coverage targets per layer.

### 10.1 Unit Tests (Jest, layer-isolated, mocked dependencies)
- **Services** are the primary unit-test target since they hold business logic:
  - `checkout.service`: pricing pipeline correctness — coupon discount math, GST rounding, free-shipping threshold boundary (exactly ₹999 vs ₹1000).
  - `payment.service`: signature verification against known-good/known-bad HMAC pairs; idempotent status transition when called twice.
  - `order.service`: state machine — every legal transition succeeds, every illegal transition (e.g., `SHIPPED → CANCELLED`, per §15 guard) throws.
  - `cart.service`: BYOB validation — correct pack-count enforcement (6/12/24), rejection when a selected cookie is `inStock: false`.
  - `coupon.service`: expiry boundary, min-order-value boundary, percentage vs fixed discount calculation, `maxDiscount` cap enforcement.
- **Utils**: `money.ts` paise/rupee conversions and rounding; `jwt.ts` sign/verify round-trip and expiry enforcement; `signature.ts` HMAC correctness.
- **Repositories**: tested against a test database (not mocked, since the value is in verifying actual Prisma query correctness — see Integration Tests) rather than unit-mocked.

### 10.2 Integration Tests (Jest + Supertest, real test DB via Docker/test schema)
- **Auth flow:** register → login → access protected route → refresh → logout → confirm session invalidated.
- **Refresh Token Rotation breach path:** reuse an already-rotated refresh token → confirm entire session tree for that user is revoked (§9).
- **Cart merge protocol:** seed a DB cart, submit a guest-cart payload with overlapping and new items, confirm quantities combine correctly and over-stock items are clamped with a flag in the response (§12).
- **Checkout pricing:** end-to-end `/checkout/validate` with a real coupon, real product prices, confirm totals match manual calculation.
- **Order placement under concurrency:** the most important integration test in the suite — fire concurrent `place-order` requests against a product with `availableQty: 1` and assert exactly one order succeeds and the other receives an "insufficient inventory" error, proving the `SELECT FOR UPDATE` row-lock (§11) actually prevents overselling.
- **Payment webhook idempotency:** send the same webhook payload twice, confirm the order is marked `PAID` once and no duplicate `Payment` record or duplicate confirmation email is created.
- **RBAC boundary tests:** for every admin-only/staff-only route, confirm a `CUSTOMER`-role token receives `403`, and a missing/invalid token receives `401`.

### 10.3 Validation Layer Tests
- Each Zod schema gets boundary-value tests: missing required field, wrong type, extra unrecognized field (must be stripped/rejected), and the documented valid shape.

### 10.4 Manual / Pre-Production Checklist (not automatable, run before Phase 9 go-live)
- Cloudinary upload size/type rejection (≥5MB, non-allowed MIME type) verified against the real SDK, not a mock.
- Razorpay test-mode end-to-end payment using Razorpay's sandbox cards, including a forced webhook-before-client-verify race (simulate client disconnect) to confirm the redundancy path in §14 actually resolves the order to `PAID`.
- Rate limiter manually triggered against `/auth/login` to confirm the 429 response and message match §19.
- Sentry dashboard confirmed to receive a deliberately-thrown 500 from staging.

### 10.5 Coverage Ordering
Tests are written alongside each phase, not deferred entirely to Phase 8 — Phase 8 is reserved for the **concurrency**, **RBAC boundary**, and **webhook idempotency** integration tests specifically, since those require the full stack (DB + Redis + mocked Razorpay/Resend) to be standing, while per-service unit tests are written as each service lands in Phases 2–7.

---

## Summary: Build Sequence At a Glance

```
Schema (Sec 1) → Migrations (Sec 2) → Folder scaffold (Sec 3)
        │
        ▼
Phase 2 Auth ──> Phase 3 Catalog ──> Phase 4 Cart/Wishlist/Checkout-pricing
                                              │
        Phase 8 Testing <── Phase 7 Admin <── Phase 6 Payments <── Phase 5 Orders
              │
              ▼
        Phase 9 Deployment

Within each phase: Validators → Repositories → Services → Controllers → Routes → Tests
```

This ordering — validators and repositories before services, services before controllers — ensures every layer above has a tested, type-safe foundation beneath it before it's consumed, consistent with the MCSR separation mandated in Architecture V2 §1 and §2.

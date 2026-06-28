import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { OrderStatus, ReviewStatus, UserRole, Coupon, Review, User, AuditLog } from "@prisma/client";
import { CouponRepository } from "../repositories/coupon.repository";
import { ReviewRepository } from "../repositories/review.repository";
import { UserRepository } from "../repositories/user.repository";
import { SessionRepository } from "../repositories/session.repository";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { logger } from "../config/logger";
import { NotFoundError } from "../errors/NotFoundError";
import { BadRequestError } from "../errors/BadRequestError";

// In-memory cache fallback when Redis is offline
const localCache: Record<string, string> = {};

export class AdminService {
  private couponRepository = new CouponRepository();
  private reviewRepository = new ReviewRepository();
  private userRepository = new UserRepository();
  private sessionRepository = new SessionRepository();
  private auditLogRepository = new AuditLogRepository();

  private static DASHBOARD_SUMMARY_KEY = "admin:dashboard_summary";
  private static BEST_SELLERS_KEY = "admin:best_sellers";
  private static CATEGORY_SALES_KEY = "admin:category_sales";
  private static TTL_SECONDS = 60;

  /**
   * Helper to check if a customer is suspended in Redis
   */
  static async isCustomerSuspended(userId: string): Promise<boolean> {
    try {
      if (redis.isOpen) {
        const status = await redis.get(`user_suspended:${userId}`);
        return status === "true";
      }
    } catch (err) {
      logger.error("Error reading customer suspension from Redis:", err);
    }
    return localCache[`user_suspended:${userId}`] === "true";
  }

  // --- Dashboard & Analytics ---

  async getDashboardSummary(): Promise<any> {
    try {
      if (redis.isOpen) {
        const cached = await redis.get(AdminService.DASHBOARD_SUMMARY_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      } else {
        const cached = localCache[AdminService.DASHBOARD_SUMMARY_KEY];
        if (cached) {
          return JSON.parse(cached);
        }
      }
    } catch (err) {
      logger.error("Error reading dashboard summary cache:", err);
    }

    const paidStatuses = [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.PACKED,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];

    // Total revenue & orders count
    const summaryAgg = await prisma.order.aggregate({
      where: {
        status: { in: paidStatuses },
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        id: true,
      },
    });

    const revenue = summaryAgg._sum.totalAmount || 0;
    const ordersCount = summaryAgg._count.id || 0;
    const averageOrderValue = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;

    // Total customers count
    const customersCount = await prisma.user.count({
      where: {
        role: UserRole.CUSTOMER,
      },
    });

    // Low stock count
    const lowStockCount = await prisma.inventory.count({
      where: {
        availableQty: {
          lte: prisma.inventory.fields.lowStockThreshold,
        },
      },
    });

    const result = {
      revenue,
      ordersCount,
      averageOrderValue,
      customersCount,
      lowStockCount,
    };

    try {
      const resultStr = JSON.stringify(result);
      if (redis.isOpen) {
        await redis.setEx(
          AdminService.DASHBOARD_SUMMARY_KEY,
          AdminService.TTL_SECONDS,
          resultStr
        );
      } else {
        localCache[AdminService.DASHBOARD_SUMMARY_KEY] = resultStr;
      }
    } catch (err) {
      logger.error("Error writing dashboard summary cache:", err);
    }

    return result;
  }

  async getSalesChart(): Promise<any[]> {
    // We execute daily group query for last 30 days
    const chartData = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COALESCE(SUM(total_amount), 0)::int as revenue,
        COUNT(id)::int as count
      FROM orders
      WHERE status IN ('PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED')
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at) ASC
    `;

    return chartData.map((d: any) => ({
      date: d.date,
      revenue: Number(d.revenue),
      count: Number(d.count),
    }));
  }

  async getBestSellers(): Promise<any[]> {
    try {
      if (redis.isOpen) {
        const cached = await redis.get(AdminService.BEST_SELLERS_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      } else {
        const cached = localCache[AdminService.BEST_SELLERS_KEY];
        if (cached) {
          return JSON.parse(cached);
        }
      }
    } catch (err) {
      logger.error("Error reading best sellers cache:", err);
    }

    const paidStatuses = [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.PACKED,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];

    const sellersAgg = await prisma.orderItem.groupBy({
      by: ["variantId", "name"],
      where: {
        order: {
          status: { in: paidStatuses },
        },
      },
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: 5,
    });

    const result = sellersAgg.map((s: any) => ({
      variantId: s.variantId,
      name: s.name,
      totalSold: s._sum.quantity || 0,
    }));

    try {
      const resultStr = JSON.stringify(result);
      if (redis.isOpen) {
        await redis.setEx(
          AdminService.BEST_SELLERS_KEY,
          AdminService.TTL_SECONDS,
          resultStr
        );
      } else {
        localCache[AdminService.BEST_SELLERS_KEY] = resultStr;
      }
    } catch (err) {
      logger.error("Error writing best sellers cache:", err);
    }

    return result;
  }

  async getCategorySales(): Promise<any[]> {
    try {
      if (redis.isOpen) {
        const cached = await redis.get(AdminService.CATEGORY_SALES_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      } else {
        const cached = localCache[AdminService.CATEGORY_SALES_KEY];
        if (cached) {
          return JSON.parse(cached);
        }
      }
    } catch (err) {
      logger.error("Error reading category sales cache:", err);
    }

    const paidStatuses = [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.PACKED,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: paidStatuses },
        },
      },
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    });

    const categoryMap: Record<string, { categoryName: string; revenue: number; quantity: number }> = {};
    for (const item of orderItems) {
      const categoryName = item.product?.category?.name || "Uncategorized";
      const categoryId = item.product?.category?.id || "uncategorized";
      const revenue = item.price * item.quantity;
      
      if (!categoryMap[categoryId]) {
        categoryMap[categoryId] = { categoryName, revenue: 0, quantity: 0 };
      }
      categoryMap[categoryId].revenue += revenue;
      categoryMap[categoryId].quantity += item.quantity;
    }

    const result = Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue);

    try {
      const resultStr = JSON.stringify(result);
      if (redis.isOpen) {
        await redis.setEx(
          AdminService.CATEGORY_SALES_KEY,
          AdminService.TTL_SECONDS,
          resultStr
        );
      } else {
        localCache[AdminService.CATEGORY_SALES_KEY] = resultStr;
      }
    } catch (err) {
      logger.error("Error writing category sales cache:", err);
    }

    return result;
  }

  // --- Customer Management ---

  async listCustomers(
    skip = 0,
    take = 10,
    filters: { search?: string; role?: UserRole; isVerified?: boolean } = {}
  ): Promise<{ data: Omit<User, "passwordHash">[]; total: number }> {
    const where: any = {};

    if (filters.role) {
      where.role = filters.role;
    }
    if (filters.isVerified !== undefined) {
      where.isVerified = filters.isVerified;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    // Map to include status dynamically from Redis and strip passwordHash
    const data = await Promise.all(
      users.map(async (u: User) => {
        const { passwordHash: _, ...userWithoutPassword } = u;
        const suspended = await AdminService.isCustomerSuspended(u.id);
        return {
          ...userWithoutPassword,
          status: suspended ? "SUSPENDED" : "ACTIVE",
        };
      })
    );

    return { data, total };
  }

  async getCustomerProfile(id: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        addresses: true,
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        loyaltyPoints: true,
      },
    });

    if (!user) {
      throw new NotFoundError("Customer not found");
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    const suspended = await AdminService.isCustomerSuspended(user.id);

    return {
      ...userWithoutPassword,
      status: suspended ? "SUSPENDED" : "ACTIVE",
    };
  }

  async updateCustomerStatus(
    id: string,
    status: "ACTIVE" | "SUSPENDED",
    actorId: string,
    ipAddress?: string | null
  ): Promise<any> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("Customer not found");
    }

    const redisKey = `user_suspended:${id}`;

    if (status === "SUSPENDED") {
      try {
        if (redis.isOpen) {
          await redis.set(redisKey, "true");
        }
      } catch (err) {
        logger.error("Error setting customer suspension in Redis:", err);
      }
      localCache[redisKey] = "true";
      // Force sessions invalidation
      await this.sessionRepository.invalidateAllForUser(id);
      await this.userRepository.incrementTokenVersion(id);
      logger.info(`🚫 Customer ${id} has been SUSPENDED by admin ${actorId}`);
    } else {
      try {
        if (redis.isOpen) {
          await redis.del(redisKey);
        }
      } catch (err) {
        logger.error("Error deleting customer suspension in Redis:", err);
      }
      delete localCache[redisKey];
      logger.info(`✅ Customer ${id} has been activated by admin ${actorId}`);
    }

    await this.auditLogRepository.create({
      userId: actorId,
      action: status === "SUSPENDED" ? "CUSTOMER_SUSPENDED" : "CUSTOMER_ACTIVATED",
      entity: "User",
      entityId: id,
      details: { email: user.email },
      ipAddress,
    });

    return { id, status };
  }

  async updateCustomerRole(
    id: string,
    role: UserRole,
    actorId: string,
    ipAddress?: string | null
  ): Promise<any> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("Customer not found");
    }

    // Guard: Prevent modifying SUPER_ADMIN role unless actor is SUPER_ADMIN
    const actor = await prisma.user.findUnique({ where: { id: actorId } });
    if (user.role === UserRole.SUPER_ADMIN && actor?.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestError("Forbidden: Cannot modify SUPER_ADMIN roles");
    }

    const updatedUser = await this.userRepository.update(id, { role });
    
    // Invalidate sessions on privilege changes
    await this.sessionRepository.invalidateAllForUser(id);
    await this.userRepository.incrementTokenVersion(id);

    await this.auditLogRepository.create({
      userId: actorId,
      action: "USER_ROLE_UPDATED",
      entity: "User",
      entityId: id,
      details: { email: user.email, oldRole: user.role, newRole: role },
      ipAddress,
    });

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  // --- Coupon CRUD Management ---

  async createCoupon(data: any, actorId: string, ipAddress?: string | null): Promise<Coupon> {
    const coupon = await this.couponRepository.create(data);
    
    await this.auditLogRepository.create({
      userId: actorId,
      action: "COUPON_CREATED",
      entity: "Coupon",
      entityId: coupon.id,
      details: { code: coupon.code, value: coupon.value },
      ipAddress,
    });

    return coupon;
  }

  async updateCoupon(id: string, data: any, actorId: string, ipAddress?: string | null): Promise<Coupon> {
    const coupon = await this.couponRepository.update(id, data);

    await this.auditLogRepository.create({
      userId: actorId,
      action: "COUPON_UPDATED",
      entity: "Coupon",
      entityId: coupon.id,
      details: { code: coupon.code, changes: data },
      ipAddress,
    });

    return coupon;
  }

  async getCoupon(id: string): Promise<Coupon> {
    const coupon = await this.couponRepository.findById(id);
    if (!coupon || coupon.isDeleted) {
      throw new NotFoundError("Coupon not found");
    }
    return coupon;
  }

  async listCoupons(skip = 0, take = 10, filters: { active?: boolean; search?: string } = {}): Promise<{ data: Coupon[]; total: number }> {
    const [data, total] = await Promise.all([
      this.couponRepository.findMany(skip, take, filters),
      this.couponRepository.count(filters),
    ]);
    return { data, total };
  }

  async deleteCoupon(id: string, actorId: string, ipAddress?: string | null): Promise<void> {
    const coupon = await this.couponRepository.findById(id);
    if (!coupon || coupon.isDeleted) {
      throw new NotFoundError("Coupon not found");
    }

    await this.couponRepository.softDelete(id);

    await this.auditLogRepository.create({
      userId: actorId,
      action: "COUPON_DELETED",
      entity: "Coupon",
      entityId: id,
      details: { code: coupon.code },
      ipAddress,
    });
  }

  // --- Review Moderation ---

  async listReviews(skip = 0, take = 10, filters: { status?: ReviewStatus; productId?: string } = {}): Promise<{ data: Review[]; total: number }> {
    const [data, total] = await Promise.all([
      this.reviewRepository.findMany(skip, take, filters),
      this.reviewRepository.count(filters),
    ]);
    return { data, total };
  }

  async moderateReview(
    id: string,
    status: ReviewStatus,
    actorId: string,
    ipAddress?: string | null
  ): Promise<Review> {
    const review = await this.reviewRepository.findById(id);
    if (!review) {
      throw new NotFoundError("Review not found");
    }

    const updatedReview = await this.reviewRepository.updateStatus(id, status);

    // Sync product stats on approved transitions
    const stats = await this.reviewRepository.calculateProductRatingStats(review.productId);
    await prisma.product.update({
      where: { id: review.productId },
      data: {
        averageRating: stats.averageRating,
        reviewCount: stats.reviewCount,
      },
    });

    await this.auditLogRepository.create({
      userId: actorId,
      action: "REVIEW_MODERATED",
      entity: "Review",
      entityId: id,
      details: { productId: review.productId, oldStatus: review.status, newStatus: status },
      ipAddress,
    });

    return updatedReview;
  }

  // --- Audit Logs ---

  async listAuditLogs(
    skip = 0,
    take = 10,
    filters: { userId?: string; action?: string; entity?: string } = {}
  ): Promise<{ data: AuditLog[]; total: number }> {
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.entity) where.entity = filters.entity;

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data, total };
  }
}

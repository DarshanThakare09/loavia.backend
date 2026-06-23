import { Request, Response } from "express";
import { AdminService } from "../services/admin.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { UserRole, ReviewStatus } from "@prisma/client";

const adminService = new AdminService();

// --- Dashboard & Analytics ---

export const getDashboardSummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await adminService.getDashboardSummary();
  return sendSuccess(res, summary, "Dashboard summary stats retrieved successfully");
});

export const getSalesChart = asyncHandler(async (_req: Request, res: Response) => {
  const chart = await adminService.getSalesChart();
  return sendSuccess(res, chart, "Sales chart data retrieved successfully");
});

export const getBestSellers = asyncHandler(async (_req: Request, res: Response) => {
  const bestSellers = await adminService.getBestSellers();
  return sendSuccess(res, bestSellers, "Best sellers data retrieved successfully");
});

export const getCategorySales = asyncHandler(async (_req: Request, res: Response) => {
  const categorySales = await adminService.getCategorySales();
  return sendSuccess(res, categorySales, "Category sales distribution retrieved successfully");
});

// --- Customer Management ---

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const filters = {
    search: req.query.search as string,
    role: req.query.role as UserRole,
    isVerified: req.query.isVerified !== undefined ? req.query.isVerified === "true" : undefined,
  };

  const result = await adminService.listCustomers(skip, limit, filters);
  return sendSuccess(res, result, "Customers list retrieved successfully");
});

export const getCustomerProfile = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const profile = await adminService.getCustomerProfile(id);
  return sendSuccess(res, profile, "Customer profile retrieved successfully");
});

export const updateCustomerStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const actorId = req.user!.id;
  const ipAddress = req.ip;

  const result = await adminService.updateCustomerStatus(id, status, actorId, ipAddress);
  return sendSuccess(res, result, `Customer status updated successfully to ${status}`);
});

export const updateCustomerRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;
  const actorId = req.user!.id;
  const ipAddress = req.ip;

  const result = await adminService.updateCustomerRole(id, role, actorId, ipAddress);
  return sendSuccess(res, result, `Customer role updated successfully to ${role}`);
});

// --- Coupon CRUD Management ---

export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user!.id;
  const ipAddress = req.ip;

  const coupon = await adminService.createCoupon(req.body, actorId, ipAddress);
  return sendSuccess(res, coupon, "Coupon created successfully", 201);
});

export const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const actorId = req.user!.id;
  const ipAddress = req.ip;

  const coupon = await adminService.updateCoupon(id, req.body, actorId, ipAddress);
  return sendSuccess(res, coupon, "Coupon updated successfully");
});

export const getCouponDetails = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const coupon = await adminService.getCoupon(id);
  return sendSuccess(res, coupon, "Coupon details retrieved successfully");
});

export const listCoupons = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const filters = {
    active: req.query.active !== undefined ? req.query.active === "true" : undefined,
    search: req.query.search as string,
  };

  const result = await adminService.listCoupons(skip, limit, filters);
  return sendSuccess(res, result, "Coupons list retrieved successfully");
});

export const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const actorId = req.user!.id;
  const ipAddress = req.ip;

  await adminService.deleteCoupon(id, actorId, ipAddress);
  return sendSuccess(res, { id }, "Coupon soft-deleted successfully");
});

// --- Review Moderation ---

export const listReviews = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const filters = {
    status: req.query.status as ReviewStatus,
    productId: req.query.productId as string,
  };

  const result = await adminService.listReviews(skip, limit, filters);
  return sendSuccess(res, result, "Reviews list retrieved successfully");
});

export const moderateReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const actorId = req.user!.id;
  const ipAddress = req.ip;

  const review = await adminService.moderateReview(id, status, actorId, ipAddress);
  return sendSuccess(res, review, `Review status updated successfully to ${status}`);
});

// --- Audit Logs ---

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const filters = {
    userId: req.query.userId as string,
    action: req.query.action as string,
    entity: req.query.entity as string,
  };

  const result = await adminService.listAuditLogs(skip, limit, filters);
  return sendSuccess(res, result, "Audit logs list retrieved successfully");
});

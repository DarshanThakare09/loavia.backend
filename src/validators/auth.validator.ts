import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  phone: z.string().max(20).optional(),
}).strict();

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
}).strict();

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
}).strict();

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
}).strict();

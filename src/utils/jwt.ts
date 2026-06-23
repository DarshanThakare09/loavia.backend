import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string;
  role: string;
  name: string;
  tokenVersion: number;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

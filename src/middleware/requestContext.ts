import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers["x-request-id"] as string) || uuidv4();
  
  req.id = requestId;
  req.timestamp = Date.now();
  req.ipAddress = req.ip || req.socket.remoteAddress || "";
  req.userAgentString = (req.headers["user-agent"] as string) || "";

  // Set the Request ID header on the response
  res.setHeader("X-Request-Id", requestId);

  next();
};

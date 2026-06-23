export {};

declare global {
  namespace Express {
    interface Request {
      id: string;
      timestamp: number;
      ipAddress: string;
      userAgentString: string;
      user?: {
        id: string;
        role: string;
      };
    }
  }
}


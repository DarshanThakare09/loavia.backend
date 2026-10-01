import Razorpay from "razorpay";
import { env } from "../config/env";

export const mockRazorpayOrdersMap = new Map<string, string>();

// Derived from RAZORPAY_ENABLED=true in environment.
// False by default — server starts and runs fully without Razorpay credentials.
export const isRazorpayEnabled = env.razorpayEnabled;

let client: any;

if (process.env.NODE_ENV === "test") {
  // Test mode: always use the in-memory mock regardless of credentials
  client = {
    orders: {
      create: async (params: any) => {
        const id = `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        if (params.receipt) {
          mockRazorpayOrdersMap.set(id, params.receipt);
        }
        return {
          id,
          amount: params.amount,
          currency: params.currency || "INR",
          receipt: params.receipt,
          status: "created",
        };
      },
      fetch: async (id: string) => {
        return {
          id,
          receipt: mockRazorpayOrdersMap.get(id) || "LOAVIA-PAY-TEST-RECEIPT",
          status: "created",
        };
      },
      fetchPayments: async (_id: string) => {
        return {
          items: [
            {
              id: `pay_mock_${Date.now()}`,
              method: "card",
              amount: 10000,
            },
          ],
        };
      },
    },
    payments: {
      refund: async (id: string, params: any) => {
        return {
          id: `rfnd_mock_${Date.now()}`,
          amount: params.amount,
          payment_id: id,
          status: "processed",
        };
      },
    },
  };
} else if (isRazorpayEnabled) {
  // Live mode: credentials are guaranteed present when isRazorpayEnabled is true
  // (env.ts validates them at startup)
  client = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID!,
    key_secret: env.RAZORPAY_KEY_SECRET!,
  });
} else {
  // Disabled stub — all payment gateway calls will throw a clear error.
  // Payment endpoints return 503 before reaching this code (see controllers).
  client = {
    orders: {
      create: async () => { throw new Error("Payment gateway is not configured. Set RAZORPAY_ENABLED=true."); },
      fetch: async () => { throw new Error("Payment gateway is not configured. Set RAZORPAY_ENABLED=true."); },
      fetchPayments: async () => { throw new Error("Payment gateway is not configured. Set RAZORPAY_ENABLED=true."); },
    },
    payments: {
      refund: async () => { throw new Error("Payment gateway is not configured. Set RAZORPAY_ENABLED=true."); },
    },
  };
}

export const razorpay = client;

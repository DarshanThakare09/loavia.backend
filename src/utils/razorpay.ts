import Razorpay from "razorpay";
import { env } from "../config/env";

export const mockRazorpayOrdersMap = new Map<string, string>();

let client: any;

if (process.env.NODE_ENV === "test") {
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
            }
          ]
        };
      }
    },
    payments: {
      refund: async (id: string, params: any) => {
        return {
          id: `rfnd_mock_${Date.now()}`,
          amount: params.amount,
          payment_id: id,
          status: "processed",
        };
      }
    }
  };
} else {
  client = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

export const razorpay = client;

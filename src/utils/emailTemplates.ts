function escapeHtml(unsafe: string): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatInr(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
}

function baseLayout(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #121214;
      color: #eaeaea;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #121214;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #1e1e22;
      border: 1px solid #2d2d34;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    .header {
      padding: 30px 40px;
      text-align: center;
      border-bottom: 1px solid #2d2d34;
    }
    .logo {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 4px;
      color: #d4af37;
      text-transform: uppercase;
      margin: 0;
    }
    .subtitle {
      font-size: 11px;
      letter-spacing: 2px;
      color: #8a8a93;
      text-transform: uppercase;
      margin-top: 5px;
    }
    .content {
      padding: 40px;
      line-height: 1.6;
      font-size: 15px;
    }
    h1 {
      font-size: 20px;
      color: #d4af37;
      margin-top: 0;
      margin-bottom: 20px;
      font-weight: 600;
    }
    p {
      margin-top: 0;
      margin-bottom: 20px;
      color: #eaeaea;
    }
    .btn-container {
      text-align: center;
      margin: 30px 0;
    }
    .btn {
      display: inline-block;
      background-color: #d4af37;
      color: #121214;
      text-decoration: none;
      padding: 14px 28px;
      font-weight: 600;
      border-radius: 8px;
      font-size: 14px;
      letter-spacing: 1px;
      text-transform: uppercase;
      box-shadow: 0 4px 10px rgba(212, 175, 55, 0.2);
    }
    .footer {
      padding: 30px 40px;
      background-color: #18181b;
      border-top: 1px solid #2d2d34;
      text-align: center;
      font-size: 12px;
      color: #8a8a93;
    }
    .footer a {
      color: #d4af37;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background-color: #2d2d34;
      margin: 20px 0;
    }
    .receipt-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .receipt-table th {
      text-align: left;
      border-bottom: 1px solid #2d2d34;
      padding: 10px 0;
      font-size: 13px;
      text-transform: uppercase;
      color: #8a8a93;
      letter-spacing: 1px;
    }
    .receipt-table td {
      padding: 12px 0;
      border-bottom: 1px solid #1e1e22;
      font-size: 14px;
    }
    .receipt-total-row th {
      border-bottom: none;
      font-weight: 600;
      color: #eaeaea;
    }
    .receipt-total-row td {
      border-bottom: none;
      font-weight: 600;
      color: #d4af37;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">Loavia</div>
        <div class="subtitle">Premium Artisan Cookies</div>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>This is an automated email from LOAVIA. Please do not reply directly.</p>
        <p>© 2026 LOAVIA. All rights reserved. | <a href="#">Unsubscribe</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export function renderVerificationEmail(name: string, link: string): string {
  const title = "Verify Your Email";
  const content = `
    <h1>Verify Your Account</h1>
    <p>Dear ${escapeHtml(name)},</p>
    <p>Thank you for choosing LOAVIA. To complete your signup and verify your email address, please click the button below:</p>
    <div class="btn-container">
      <a href="${escapeHtml(link)}" class="btn" target="_blank">Verify Email</a>
    </div>
    <p>Or copy and paste this link in your browser:</p>
    <p style="word-break: break-all; font-size: 13px; color: #8a8a93;">${escapeHtml(link)}</p>
    <div class="divider"></div>
    <p>This verification link is valid for 24 hours. If you did not register for a LOAVIA account, please ignore this email.</p>
  `;
  return baseLayout(title, content);
}

export function renderWelcomeEmail(name: string): string {
  const title = "Welcome to LOAVIA";
  const content = `
    <h1>Welcome to LOAVIA</h1>
    <p>Dear ${escapeHtml(name)},</p>
    <p>Your email has been verified successfully. Welcome to the exclusive LOAVIA family!</p>
    <p>We craft premium, small-batch artisan cookies using only the finest chocolate chunks, organic dairy, and gourmet ingredients. You can now build your own boxes, manage orders, and unlock loyalty points.</p>
    <div class="btn-container">
      <a href="#" class="btn">Explore Products</a>
    </div>
    <div class="divider"></div>
    <p>We are delighted to have you with us. Treat yourself to the extraordinary.</p>
  `;
  return baseLayout(title, content);
}

export function renderPasswordResetEmail(name: string, link: string): string {
  const title = "Password Reset Request";
  const content = `
    <h1>Reset Your Password</h1>
    <p>Hello ${escapeHtml(name)},</p>
    <p>We received a request to reset the password for your LOAVIA account. Click the button below to set a new password:</p>
    <div class="btn-container">
      <a href="${escapeHtml(link)}" class="btn" target="_blank">Reset Password</a>
    </div>
    <p>Or copy and paste this link in your browser:</p>
    <p style="word-break: break-all; font-size: 13px; color: #8a8a93;">${escapeHtml(link)}</p>
    <div class="divider"></div>
    <p>This link is valid for <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email and your password will remain unchanged.</p>
  `;
  return baseLayout(title, content);
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number; // in Paise
}

export function renderOrderReceiptEmail(
  name: string,
  receiptNumber: string,
  items: ReceiptItem[],
  subtotal: number, // in Paise
  shippingFee: number, // in Paise
  discountAmount: number, // in Paise
  taxAmount: number, // in Paise
  totalAmount: number // in Paise
): string {
  const title = `Order Confirmation - ${receiptNumber}`;

  let itemsHtml = "";
  items.forEach((item) => {
    itemsHtml += `
      <tr>
        <td>${escapeHtml(item.name)} <span style="color: #8a8a93;">x ${item.quantity}</span></td>
        <td style="text-align: right;">${formatInr(item.price * item.quantity)}</td>
      </tr>
    `;
  });

  const content = `
    <h1>Order Confirmed</h1>
    <p>Thank you for your order, ${escapeHtml(name)}!</p>
    <p>Your payment has been received successfully, and we are preparing your order. Your receipt number is <strong>${escapeHtml(receiptNumber)}</strong>.</p>
    
    <div class="divider"></div>
    
    <h3>Order Summary</h3>
    <table class="receipt-table">
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
        <tr>
          <td style="border-top: 1px solid #2d2d34; padding-top: 10px; color: #8a8a93;">Subtotal</td>
          <td style="border-top: 1px solid #2d2d34; padding-top: 10px; text-align: right;">${formatInr(subtotal)}</td>
        </tr>
        ${
          discountAmount > 0
            ? `
        <tr>
          <td style="color: #8a8a93;">Discount</td>
          <td style="text-align: right; color: #22c55e;">-${formatInr(discountAmount)}</td>
        </tr>`
            : ""
        }
        <tr>
          <td style="color: #8a8a93;">Shipping Fee</td>
          <td style="text-align: right;">${formatInr(shippingFee)}</td>
        </tr>
        <tr>
          <td style="color: #8a8a93;">Tax (18% GST)</td>
          <td style="text-align: right;">${formatInr(taxAmount)}</td>
        </tr>
        <tr class="receipt-total-row">
          <th style="padding-top: 15px;">Total paid</th>
          <td style="padding-top: 15px; text-align: right;">${formatInr(totalAmount)}</td>
        </tr>
      </tbody>
    </table>

    <div class="divider"></div>
    <p>We will email you with your tracking details once your cookies are freshly baked and dispatched.</p>
  `;
  return baseLayout(title, content);
}

export function renderLatePaymentReviewEmail(name: string, receiptNumber: string): string {
  const title = `Order Under Review - ${receiptNumber}`;
  const content = `
    <h1>Payment Received - Review Required</h1>
    <p>Hello ${escapeHtml(name)},</p>
    <p>We received your payment for order <strong>${escapeHtml(receiptNumber)}</strong>, but the transaction was completed after your checkout session reservation expired.</p>
    <p>Because the stock reservation expired, your selected items were released and are currently out of stock. **We have not oversold your items.**</p>
    <div class="divider"></div>
    <p><strong>What happens next?</strong></p>
    <p>Our kitchen and support team have flagged your order for manual review. We are currently checking if we can restock the ingredients to fulfill your order immediately. If we cannot, we will reach out to you to issue a full refund to your original payment method.</p>
    <p>No action is needed from you. We will contact you within 24 hours.</p>
  `;
  return baseLayout(title, content);
}

export function renderShipmentUpdateEmail(
  name: string,
  receiptNumber: string,
  trackingNumber: string,
  courierPartner: string,
  status: string
): string {
  const title = `Shipment Update - ${receiptNumber}`;
  const content = `
    <h1>Your Order is ${escapeHtml(status)}</h1>
    <p>Hello ${escapeHtml(name)},</p>
    <p>Great news! Your order <strong>${escapeHtml(receiptNumber)}</strong> is on its way.</p>
    <div style="background-color: #18181b; border: 1px solid #2d2d34; padding: 20px; border-radius: 8px; margin: 25px 0;">
      <p style="margin-bottom: 10px;"><strong>Courier Partner:</strong> ${escapeHtml(courierPartner)}</p>
      <p style="margin-bottom: 10px;"><strong>Tracking ID:</strong> ${escapeHtml(trackingNumber)}</p>
      <p style="margin-bottom: 0;"><strong>Status:</strong> ${escapeHtml(status)}</p>
    </div>
    <div class="btn-container">
      <a href="#" class="btn">Track Order</a>
    </div>
    <div class="divider"></div>
    <p>Freshly baked cookies are coming your way soon!</p>
  `;
  return baseLayout(title, content);
}

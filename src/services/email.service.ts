import { Resend } from "resend";
import { logger } from "../config/logger";
import { env } from "../config/env";
import {
  renderVerificationEmail,
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderOrderReceiptEmail,
  renderLatePaymentReviewEmail,
  renderShipmentUpdateEmail,
  ReceiptItem,
} from "../utils/emailTemplates";

export { ReceiptItem };

export class EmailService {
  private resend: Resend | null = null;
  static mockSentEmails: Array<{ to: string; subject: string; html: string }> = [];

  constructor() {
    if (env.NODE_ENV !== "test" && env.RESEND_API_KEY !== "mock") {
      this.resend = new Resend(env.RESEND_API_KEY);
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    logger.info(`📧 Sending email to ${to} with subject "${subject}"`);
    
    if (env.NODE_ENV === "test" || env.RESEND_API_KEY === "mock" || !this.resend) {
      logger.info(`🧪 [Mock Email Mode] Captured email to ${to}`);
      EmailService.mockSentEmails.push({ to, subject, html });
      return;
    }

    try {
      const response = await this.resend.emails.send({
        from: "LOAVIA <noreply@loavia.in>",
        to,
        subject,
        html,
      });

      if (response.error) {
        throw new Error(`Resend API Error: ${JSON.stringify(response.error)}`);
      }
      logger.info(`✅ Email sent successfully via Resend. ID: ${response.data?.id}`);
    } catch (err: any) {
      logger.error(`❌ Failed to send email to ${to}: ${err.message}`);
      throw err;
    }
  }

  // Verification Email
  async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    const link = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    const html = renderVerificationEmail(name, link);
    await this.sendEmail(email, "Verify Your LOAVIA Account", html);
  }

  // Welcome Email
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const html = renderWelcomeEmail(name);
    await this.sendEmail(email, "Welcome to LOAVIA!", html);
  }

  // Password Reset Email
  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
    const link = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    const html = renderPasswordResetEmail(name, link);
    await this.sendEmail(email, "Reset Your LOAVIA Password", html);
  }

  // Order Receipt Email
  async sendOrderReceiptEmail(
    email: string,
    name: string,
    receiptNumber: string,
    items: ReceiptItem[],
    subtotal: number,
    shippingFee: number,
    discountAmount: number,
    taxAmount: number,
    totalAmount: number
  ): Promise<void> {
    const html = renderOrderReceiptEmail(
      name,
      receiptNumber,
      items,
      subtotal,
      shippingFee,
      discountAmount,
      taxAmount,
      totalAmount
    );
    await this.sendEmail(email, `LOAVIA Order Confirmation - ${receiptNumber}`, html);
  }

  // Late Payment Review Email
  async sendLatePaymentReviewEmail(email: string, name: string, receiptNumber: string): Promise<void> {
    const html = renderLatePaymentReviewEmail(name, receiptNumber);
    await this.sendEmail(email, `LOAVIA Order Under Review - ${receiptNumber}`, html);
  }

  // Shipment Update Email
  async sendShipmentUpdateEmail(
    email: string,
    name: string,
    receiptNumber: string,
    trackingNumber: string,
    courierPartner: string,
    status: string
  ): Promise<void> {
    const html = renderShipmentUpdateEmail(name, receiptNumber, trackingNumber, courierPartner, status);
    await this.sendEmail(email, `LOAVIA Shipment Update - ${receiptNumber}`, html);
  }
}

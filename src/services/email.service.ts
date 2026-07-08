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
  renderContactResponseEmail,
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

    // Detect placeholder / unconfigured API key
    if (
      !env.RESEND_API_KEY ||
      env.RESEND_API_KEY === "re_123456789" ||
      env.RESEND_API_KEY.length < 20
    ) {
      logger.warn(`⚠️  RESEND_API_KEY is not configured. Email to ${to} was NOT sent. Set a real key in .env`);
      throw new Error("Email service is not configured. Please set a valid RESEND_API_KEY in your .env file.");
    }

    // In development, use Resend's free sandbox sender to avoid domain verification issues
    const fromAddress =
      env.NODE_ENV === "production"
        ? "LOAVIA <noreply@loavia.in>"
        : "LOAVIA <onboarding@resend.dev>";

    try {
      const response = await this.resend.emails.send({
        from: fromAddress,
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
    if (env.RESEND_API_KEY === "mock" || env.NODE_ENV !== "production") {
      logger.info(`🔗 [Verification Link] ${link}`);
    }
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
    if (env.RESEND_API_KEY === "mock" || env.NODE_ENV !== "production") {
      logger.info(`🔗 [Password Reset Link] ${link}`);
    }
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

  // Contact Response Email
  async sendContactResponseEmail(
    email: string,
    name: string,
    originalMessage: string,
    responseText: string
  ): Promise<void> {
    const html = renderContactResponseEmail(name, originalMessage, responseText);
    await this.sendEmail(email, "Response to your LOAVIA Inquiry", html);
  }
}

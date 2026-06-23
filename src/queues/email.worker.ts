import { redis } from "../config/redis";
import { logger } from "../config/logger";
import { EmailService } from "../services/email.service";
import { EmailQueue, EmailJob } from "./email.queue";
import { AuditLogRepository } from "../repositories/auditLog.repository";
import { env } from "../config/env";

export class EmailWorker {
  private emailService = new EmailService();
  private auditLogRepository = new AuditLogRepository();
  private isRunning = false;
  private loopTimeout: NodeJS.Timeout | null = null;
  private pollIntervalMs = env.NODE_ENV === "test" ? 100 : 1000;

  /**
   * Starts the background worker.
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("⚠️ Email worker is already running.");
      return;
    }
    this.isRunning = true;
    logger.info("🚀 Email queue background worker started.");
    this.runLoop();
  }

  /**
   * Stops the background worker gracefully.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }
    logger.info("⚡ Email queue background worker stopped.");
  }

  private runLoop(): void {
    this.loopTimeout = setTimeout(async () => {
      if (!this.isRunning) return;

      try {
        if (redis.isOpen) {
          // 1. Promote due delayed jobs
          await EmailQueue.promoteDelayedJobs();

          // 2. Pop next job from active queue
          const jobStr = await redis.lPop("email_queue");
          if (jobStr) {
            const job = JSON.parse(jobStr) as EmailJob;
            await this.processJob(job);
          }
        }
      } catch (err: any) {
        logger.error(`❌ Error in email worker loop: ${err.message}`);
      }

      // Re-schedule next loop execution
      if (this.isRunning) {
        this.runLoop();
      }
    }, this.pollIntervalMs);
  }

  private async processJob(job: EmailJob): Promise<void> {
    const statusKey = EmailQueue.getJobTrackingKey(job.id);
    
    // Enforce idempotency: ignore completed jobs
    const currentStatus = await redis.get(statusKey);
    if (currentStatus === "completed") {
      logger.info(`⚠️ Email job ${job.id} already completed. Ignoring duplicate task.`);
      return;
    }

    logger.info(`⚙️ Processing email job ${job.id} (${job.type}) attempt ${job.attempts}`);

    try {
      // Execute the email send based on job type
      switch (job.type) {
        case "VERIFICATION":
          await this.emailService.sendVerificationEmail(job.to, job.recipientName, job.payload.token);
          break;
        case "WELCOME":
          await this.emailService.sendWelcomeEmail(job.to, job.recipientName);
          break;
        case "PASSWORD_RESET":
          await this.emailService.sendPasswordResetEmail(job.to, job.recipientName, job.payload.token);
          break;
        case "ORDER_CONFIRMATION":
          await this.emailService.sendOrderReceiptEmail(
            job.to,
            job.recipientName,
            job.payload.receiptNumber,
            job.payload.items,
            job.payload.subtotal,
            job.payload.shippingFee,
            job.payload.discountAmount,
            job.payload.taxAmount,
            job.payload.totalAmount
          );
          break;
        case "LATE_PAYMENT_REVIEW":
          await this.emailService.sendLatePaymentReviewEmail(job.to, job.recipientName, job.payload.receiptNumber);
          break;
        case "SHIPMENT_UPDATE":
          await this.emailService.sendShipmentUpdateEmail(
            job.to,
            job.recipientName,
            job.payload.receiptNumber,
            job.payload.trackingNumber,
            job.payload.courierPartner,
            job.payload.status
          );
          break;
        default:
          throw new Error(`Unknown job type: ${(job as any).type}`);
      }

      // Mark status as completed in Redis (7 days TTL)
      await redis.setEx(statusKey, 7 * 24 * 60 * 60, "completed");

      // Audit Log: EMAIL_JOB_COMPLETED
      await this.auditLogRepository.create({
        userId: job.payload.userId || null,
        action: "EMAIL_JOB_COMPLETED",
        entity: "User",
        entityId: job.payload.userId || "00000000-0000-0000-0000-000000000000",
        details: { jobId: job.id, type: job.type, to: job.to, attempts: job.attempts },
      });

      logger.info(`✅ Email job ${job.id} completed successfully.`);
    } catch (err: any) {
      logger.error(`❌ Error sending email job ${job.id}: ${err.message}`);

      if (job.attempts < 3) {
        // Increment attempts and schedule retry
        job.attempts += 1;
        const delaySeconds = env.NODE_ENV === "test" ? 1 : Math.pow(2, job.attempts - 1) * 30;
        await EmailQueue.scheduleRetry(job, delaySeconds);

        // Audit Log: EMAIL_JOB_RETRIED
        await this.auditLogRepository.create({
          userId: job.payload.userId || null,
          action: "EMAIL_JOB_RETRIED",
          entity: "User",
          entityId: job.payload.userId || "00000000-0000-0000-0000-000000000000",
          details: { jobId: job.id, type: job.type, attempts: job.attempts - 1, error: err.message },
        });
      } else {
        // Retries exhausted
        await redis.setEx(statusKey, 7 * 24 * 60 * 60, "failed");
        await redis.rPush("email_queue_failed", JSON.stringify(job));

        // Audit Log: EMAIL_JOB_FAILED
        await this.auditLogRepository.create({
          userId: job.payload.userId || null,
          action: "EMAIL_JOB_FAILED",
          entity: "User",
          entityId: job.payload.userId || "00000000-0000-0000-0000-000000000000",
          details: { jobId: job.id, type: job.type, attempts: job.attempts, error: err.message, severity: "CRITICAL" },
        });

        logger.error(`❌ Email job ${job.id} failed after all retries.`);
      }
    }
  }
}
export const emailWorker = new EmailWorker();

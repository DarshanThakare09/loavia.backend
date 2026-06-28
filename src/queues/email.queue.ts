import { redis } from "../config/redis";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../config/logger";

export interface EmailJob {
  id: string;
  type: "VERIFICATION" | "WELCOME" | "PASSWORD_RESET" | "ORDER_CONFIRMATION" | "LATE_PAYMENT_REVIEW" | "SHIPMENT_UPDATE";
  to: string;
  recipientName: string;
  payload: any;
  attempts: number;
  createdAt: string;
}

export class EmailQueue {
  private static QUEUE_KEY = "email_queue";
  private static DELAYED_KEY = "email_queue_delayed";

  static getJobTrackingKey(jobId: string): string {
    return `email_job_status:${jobId}`;
  }

  /**
   * Enqueues an email job. If a customId is provided, it helps implement idempotency at the trigger level.
   */
  static async enqueue(
    type: EmailJob["type"],
    to: string,
    recipientName: string,
    payload: any,
    customId?: string
  ): Promise<string> {
    const jobId = customId || uuidv4();
    const statusKey = this.getJobTrackingKey(jobId);

    try {
      if (redis.isOpen) {
        // Check if job already completed or queued
        const existingStatus = await redis.get(statusKey);
        if (existingStatus === "completed") {
          logger.info(`⚠️ Email job ${jobId} already completed. Skipping enqueue.`);
          return jobId;
        }
        if (existingStatus === "queued" && customId) {
          logger.info(`⚠️ Email job ${jobId} already in queue. Skipping duplicate enqueue.`);
          return jobId;
        }
      }
    } catch (redisErr) {
      logger.error("Error reading from Redis in EmailQueue:", redisErr);
    }

    const job: EmailJob = {
      id: jobId,
      type,
      to,
      recipientName,
      payload,
      attempts: 1,
      createdAt: new Date().toISOString(),
    };

    try {
      if (redis.isOpen) {
        // Set job status in Redis as queued (TTL: 7 days)
        await redis.setEx(statusKey, 7 * 24 * 60 * 60, "queued");
        await redis.rPush(this.QUEUE_KEY, JSON.stringify(job));
        logger.info(`📥 Enqueued email job ${jobId} (${type}) to ${to}`);
      } else {
        logger.warn(`⚠️ Redis is down. Logged email job details to console instead of queue: ${JSON.stringify(job)}`);
      }
    } catch (redisErr) {
      logger.error("Error writing to Redis in EmailQueue:", redisErr);
      logger.warn(`⚠️ Falling back to logging email job details: ${JSON.stringify(job)}`);
    }

    return jobId;
  }

  /**
   * Schedules a delayed email job (for exponential backoff retries).
   */
  static async scheduleRetry(job: EmailJob, delaySeconds: number): Promise<void> {
    const executeTimestamp = Math.floor(Date.now() / 1000) + delaySeconds;
    const statusKey = this.getJobTrackingKey(job.id);
    
    await redis.setEx(statusKey, 7 * 24 * 60 * 60, "retrying");
    await redis.zAdd(this.DELAYED_KEY, {
      score: executeTimestamp,
      value: JSON.stringify(job),
    });
    logger.info(`⏰ Scheduled retry for email job ${job.id} in ${delaySeconds} seconds`);
  }

  /**
   * Helper to promote due delayed jobs back to the active queue.
   */
  static async promoteDelayedJobs(): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    
    // Fetch all jobs that are due
    const dueJobs = await redis.zRangeByScore(this.DELAYED_KEY, 0, now);
    if (dueJobs.length === 0) return 0;

    for (const jobStr of dueJobs) {
      const job = JSON.parse(jobStr) as EmailJob;
      const statusKey = this.getJobTrackingKey(job.id);

      // Make sure it wasn't marked completed/cancelled in the meantime
      const status = await redis.get(statusKey);
      if (status === "completed") {
        await redis.zRem(this.DELAYED_KEY, jobStr);
        continue;
      }

      await redis.setEx(statusKey, 7 * 24 * 60 * 60, "queued");
      await redis.rPush(this.QUEUE_KEY, jobStr);
      await redis.zRem(this.DELAYED_KEY, jobStr);
      logger.info(`🚀 Promoted delayed email job ${job.id} back to active queue.`);
    }

    return dueJobs.length;
  }
}

import { Request, Response } from "express";
import { redis } from "../config/redis";
import { EmailQueue } from "../queues/email.queue";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const getQueueStats = asyncHandler(async (_req: Request, res: Response) => {
  const activeCount = await redis.lLen("email_queue");
  const failedCount = await redis.lLen("email_queue_failed");
  const delayedCount = await redis.zCard("email_queue_delayed");

  const activeJobsRaw = await redis.lRange("email_queue", 0, 49);
  const failedJobsRaw = await redis.lRange("email_queue_failed", 0, 49);

  const activeJobs = activeJobsRaw.map((j) => JSON.parse(j));
  const failedJobs = failedJobsRaw.map((j) => JSON.parse(j));

  return sendSuccess(
    res,
    {
      activeCount,
      failedCount,
      delayedCount,
      activeJobs,
      failedJobs,
    },
    "Email queue statistics retrieved successfully"
  );
});

export const retryFailedJobs = asyncHandler(async (_req: Request, res: Response) => {
  let retriedCount = 0;

  while (true) {
    const jobStr = await redis.lPop("email_queue_failed");
    if (!jobStr) break;

    const job = JSON.parse(jobStr);
    // Reset attempts and set status back to queued
    job.attempts = 1;
    const statusKey = EmailQueue.getJobTrackingKey(job.id);
    await redis.setEx(statusKey, 7 * 24 * 60 * 60, "queued");
    await redis.rPush("email_queue", JSON.stringify(job));

    retriedCount++;
  }

  return sendSuccess(
    res,
    {
      retriedCount,
    },
    `${retriedCount} failed email jobs re-queued successfully`
  );
});

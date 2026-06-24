process.env.NODE_ENV = "test";
import app from "../app";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { UserRole } from "@prisma/client";
import { hashPassword } from "./crypto";
import { emailWorker } from "../queues/email.worker";
import { EmailQueue } from "../queues/email.queue";
import { EmailService } from "../services/email.service";

const ADMIN_EMAIL = "admin_email_test@loavia.in";
const CUSTOMER_EMAIL = "customer_email_test@loavia.in";
const TEST_PASSWORD = "password123";

function parseCookies(cookieHeaders: string[] | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeaders) return cookies;
  cookieHeaders.forEach((header) => {
    const [cookie] = header.split(";");
    const [name, value] = cookie.split("=");
    cookies[name.trim()] = value.trim();
  });
  return cookies;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("🚀 Starting Email System E2E Integration Tests...");

  if (!redis.isOpen) {
    await redis.connect();
  }

  // Clear queues & cache keys
  await redis.del("email_queue");
  await redis.del("email_queue_failed");
  await redis.del("email_queue_delayed");
  const keys = await redis.keys("email_job_status:*");
  if (keys.length > 0) {
    await redis.del(keys);
  }

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api/v1`;

  let adminCookie = "";
  let customerUser: any = null;

  try {
    // 1. Setup DB Mock data
    console.log("🧹 Cleaning test database records...");
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } } });
    // Keep 00000000 uuid logs clean too
    await prisma.auditLog.deleteMany({
      where: {
        entityId: "00000000-0000-0000-0000-000000000000",
        action: { in: ["EMAIL_JOB_COMPLETED", "EMAIL_JOB_RETRIED", "EMAIL_JOB_FAILED"] },
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } });

    console.log("👤 Creating test users...");
    const hashedPassword = await hashPassword(TEST_PASSWORD);
    
    await prisma.user.create({
      data: {
        name: "Test Admin",
        email: ADMIN_EMAIL,
        passwordHash: hashedPassword,
        role: UserRole.ADMIN,
        isVerified: true,
      },
    });

    customerUser = await prisma.user.create({
      data: {
        name: "Test Customer",
        email: CUSTOMER_EMAIL,
        passwordHash: hashedPassword,
        role: UserRole.CUSTOMER,
        isVerified: false,
      },
    });

    // 2. Authenticate
    console.log("🔑 Authenticating test users...");
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: TEST_PASSWORD }),
    });
    const adminCookies = parseCookies(adminLoginRes.headers.getSetCookie());
    adminCookie = `access_token=${adminCookies.access_token}`;

    await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CUSTOMER_EMAIL, password: TEST_PASSWORD }),
    });

    // Reset captured emails
    EmailService.mockSentEmails = [];

    // 3. Test Email Verification Enqueue (Customer signup simulation)
    console.log("📥 Testing Email Queue Enqueue...");
    const job1Id = await EmailQueue.enqueue(
      "VERIFICATION",
      CUSTOMER_EMAIL,
      "Test Customer",
      { token: "test_token_123", userId: customerUser.id }
    );
    if (!job1Id) throw new Error("Verification job ID missing");

    // Check Redis list length
    const activeCount = await redis.lLen("email_queue");
    if (activeCount !== 1) throw new Error(`Queue length mismatch: ${activeCount}`);

    // Verify job tracking status is "queued"
    const statusVal = await redis.get(EmailQueue.getJobTrackingKey(job1Id));
    if (statusVal !== "queued") throw new Error(`Invalid status: ${statusVal}`);

    console.log("  ↳ Verification email job successfully enqueued.");

    // 4. Test Job Idempotency
    console.log("🛡️ Testing Email Job Idempotency...");
    // Try to enqueue same job ID again
    await EmailQueue.enqueue(
      "VERIFICATION",
      CUSTOMER_EMAIL,
      "Test Customer",
      { token: "test_token_123", userId: customerUser.id },
      job1Id
    );
    const activeCountDup = await redis.lLen("email_queue");
    if (activeCountDup !== 1) throw new Error("Idempotency failed: duplicated enqueuing occurred");
    console.log("  ↳ Duplicate enqueues correctly bypassed.");

    // 5. Test Worker Loop Processing
    console.log("⚙️ Starting worker and checking job executions...");
    emailWorker.start();

    // Give worker time to poll and execute job1
    await delay(1500);

    // Verify mock email was sent
    if ((EmailService.mockSentEmails.length as number) !== 1) {
      throw new Error(`Email mock verify failed. Sent: ${EmailService.mockSentEmails.length}`);
    }
    const sentEmail = EmailService.mockSentEmails[0];
    if (sentEmail.to !== CUSTOMER_EMAIL || !sentEmail.html.includes("verify-email?token=test_token_123")) {
      throw new Error(`Incorrect email structure sent: ${JSON.stringify(sentEmail)}`);
    }

    // Verify Redis tracking status is now "completed"
    const statusValPost = await redis.get(EmailQueue.getJobTrackingKey(job1Id));
    if (statusValPost !== "completed") throw new Error(`Invalid post status: ${statusValPost}`);

    // Verify Audit log has EMAIL_JOB_COMPLETED
    const completedAudits = await prisma.auditLog.findMany({
      where: { action: "EMAIL_JOB_COMPLETED" },
    });
    const jobAudit = completedAudits.find((a: any) => a.details && (a.details as any).jobId === job1Id);
    if (!jobAudit) {
      throw new Error("Missing EMAIL_JOB_COMPLETED audit log in database");
    }

    console.log("  ↳ Worker processed active queue job and recorded audit successfully.");

    // Test idempotency bypass inside worker: push a job already completed directly to redis queue and verify it is ignored
    const statusKey = EmailQueue.getJobTrackingKey("dummy_job_id");
    await redis.setEx(statusKey, 3600, "completed");
    await redis.rPush("email_queue", JSON.stringify({
      id: "dummy_job_id",
      type: "WELCOME",
      to: CUSTOMER_EMAIL,
      recipientName: "Test Customer",
      payload: { userId: customerUser.id },
      attempts: 1,
      createdAt: new Date().toISOString()
    }));
    await delay(1000);
    // Captured emails count should still be 1 (ignored dummy_job_id)
    if ((EmailService.mockSentEmails.length as number) !== 1) {
      throw new Error("Worker failed to bypass completed job");
    }
    console.log("  ↳ Worker idempotent bypass check passed.");

    // 6. Test Shipment Tracking Enqueue
    console.log("🚚 Testing Shipment update email enqueuing...");
    await EmailQueue.enqueue(
      "SHIPMENT_UPDATE",
      CUSTOMER_EMAIL,
      "Test Customer",
      {
        receiptNumber: "LOAVIA-EMAIL-TEST-123",
        trackingNumber: "TRK12345",
        courierPartner: "Delhivery",
        status: "SHIPPED",
        userId: customerUser.id,
      }
    );
    await delay(1000);
    if ((EmailService.mockSentEmails.length as number) !== 2) {
      throw new Error("Shipment update email not sent");
    }
    const trkMail = EmailService.mockSentEmails[1];
    if (!trkMail.html.includes("Delhivery") || !trkMail.html.includes("TRK12345")) {
      throw new Error("Shipment details missing in mail layout");
    }
    console.log("  ↳ Shipment updates template rendered and dispatched.");

    // 7. Test Email Retries and Backoff (Simulation of failure)
    console.log("⏰ Testing Queue Retries & Exponential Backoff...");
    
    // Inject a special email address to fail
    const failingJobId = await EmailQueue.enqueue(
      "WELCOME",
      "fail@loavia.in", // EmailService.sendEmail will fail when sending to this address
      "Failing Customer",
      { userId: customerUser.id }
    );

    // Patch EmailService prototype to throw when target is fail@loavia.in
    const originalSend = EmailService.prototype.sendEmail;
    EmailService.prototype.sendEmail = async function(to: string, subject: string, html: string) {
      if (to === "fail@loavia.in") {
        throw new Error("Simulated Resend API Timeout");
      }
      return originalSend.call(this, to, subject, html);
    };

    // Wait for attempt 1
    await delay(1000);

    // Verify it is placed in delayed set
    const delayedCount = await redis.zCard("email_queue_delayed");
    if (delayedCount !== 1) {
      throw new Error(`Expected failing job in delayed queue, count: ${delayedCount}`);
    }

    // Verify EMAIL_JOB_RETRIED audit log exists
    const retryAudits = await prisma.auditLog.findMany({
      where: { action: "EMAIL_JOB_RETRIED" },
    });
    const jobRetried = retryAudits.filter((a: any) => a.details && (a.details as any).jobId === failingJobId);
    if (jobRetried.length < 1) {
      throw new Error("Missing EMAIL_JOB_RETRIED audit log");
    }

    console.log("  ↳ Attempt 1 failed and scheduled for retry successfully.");

    // Run attempt 2 (let the worker naturally promote and process it after 1s delay)
    console.log("  ↳ Waiting for Attempt 2 to execute naturally...");
    await delay(2500);

    // Verify attempt 2 was retried
    const retryAudits2 = await prisma.auditLog.findMany({
      where: { action: "EMAIL_JOB_RETRIED" },
    });
    const jobRetried2 = retryAudits2.filter((a: any) => a.details && (a.details as any).jobId === failingJobId);
    if (jobRetried2.length < 2) {
      throw new Error(`Expected at least 2 retry audit logs, got ${jobRetried2.length}`);
    }
    console.log("  ↳ Attempt 2 failed and scheduled for retry successfully.");

    // Run attempt 3 (let the worker naturally promote and process it after 1s delay)
    console.log("  ↳ Waiting for Attempt 3 to execute naturally...");
    await delay(2500);

    // Verify no more delayed jobs
    const delayedCountFinal = await redis.zCard("email_queue_delayed");
    if (delayedCountFinal !== 0) throw new Error("Delayed queue not empty after 3rd attempt");

    // Verify pushed to failed dead letter queue
    const failedQueueLen = await redis.lLen("email_queue_failed");
    if (failedQueueLen !== 1) throw new Error(`Expected 1 failed job in dead letter queue, got ${failedQueueLen}`);

    // Verify status key is "failed"
    const finalStatus = await redis.get(EmailQueue.getJobTrackingKey(failingJobId));
    if (finalStatus !== "failed") throw new Error(`Expected failed status, got: ${finalStatus}`);

    // Verify EMAIL_JOB_FAILED audit log exists
    const failedAudits = await prisma.auditLog.findMany({
      where: { action: "EMAIL_JOB_FAILED" },
    });
    const jobFailed = failedAudits.filter((a: any) => a.details && (a.details as any).jobId === failingJobId);
    if (jobFailed.length !== 1) {
      throw new Error("Missing EMAIL_JOB_FAILED audit log");
    }

    console.log("  ↳ Retries exhausted, job moved to dead letter queue, and critical audit logged.");

    // Restore original send method
    EmailService.prototype.sendEmail = originalSend;

    // 8. Test Admin Queue APIs
    console.log("📊 Testing Admin Queue Statistics and Retry endpoints...");
    
    // Call GET stats
    const statsRes = await fetch(`${baseUrl}/admin/emails/queue`, {
      headers: { Cookie: adminCookie },
    });
    const statsData = await statsRes.json() as any;
    if (statsRes.status !== 200 || !statsData.success) {
      throw new Error(`Stats endpoint failed: ${JSON.stringify(statsData)}`);
    }
    if (statsData.data.failedCount !== 1 || statsData.data.activeCount !== 0) {
      throw new Error(`Stats data mismatch: ${JSON.stringify(statsData.data)}`);
    }
    console.log("  ↳ Admin queue stats endpoint working correctly.");

    // Call POST retry
    const retryRes = await fetch(`${baseUrl}/admin/emails/retry`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    const retryData = await retryRes.json() as any;
    if (retryRes.status !== 200 || !retryData.success || retryData.data.retriedCount !== 1) {
      throw new Error(`Retry failed: ${JSON.stringify(retryData)}`);
    }

    // Check failed queue is empty and active queue has 0 or 1 (depending on worker poll timing)
    const postFailedLen = await redis.lLen("email_queue_failed");
    const postActiveLen = await redis.lLen("email_queue");
    if (postFailedLen !== 0 || (postActiveLen !== 1 && postActiveLen !== 0)) {
      throw new Error(`Failed re-queuing check: failed=${postFailedLen}, active=${postActiveLen}`);
    }

    // Verify it processed successfully now that sendEmail works (it shouldn't fail fail@loavia.in anymore)
    await delay(1000);
    const postProcessActiveLen = await redis.lLen("email_queue");
    if (postProcessActiveLen !== 0) {
      throw new Error(`Queue not processed after retry: ${postProcessActiveLen}`);
    }
    // Captured emails count should be 3 (job1, shipment update, failing job successfully retried)
    if ((EmailService.mockSentEmails.length as number) !== 3) {
      throw new Error(`Retry send failed. Sent count: ${EmailService.mockSentEmails.length}`);
    }

    console.log("  ↳ Admin failed retry trigger processed successfully.");

    console.log("\n🎉 ALL EMAIL SYSTEM E2E INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("\n❌ E2E Integration Test Failure:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    console.log("🧹 Cleaning up test database records...");
    await emailWorker.stop();
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } } });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: "00000000-0000-0000-0000-000000000000",
        action: { in: ["EMAIL_JOB_COMPLETED", "EMAIL_JOB_RETRIED", "EMAIL_JOB_FAILED"] },
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } } });
    await prisma.$disconnect();

    // Clear queue items
    await redis.del("email_queue");
    await redis.del("email_queue_failed");
    await redis.del("email_queue_delayed");
    const keys = await redis.keys("email_job_status:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
    
    if (redis.isOpen) {
      await redis.disconnect();
    }
    server.close();
  }
}

runTests();

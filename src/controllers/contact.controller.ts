import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { BadRequestError } from "../errors/BadRequestError";
import { EmailService } from "../services/email.service";
import { logger } from "../config/logger";

const ADMIN_EMAIL = process.env.ADMIN_ENQUIRY_EMAIL || "teamdiamond0011@gmail.com";

export const submitContactMessage = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, phone, subject, message, enquiryType } = req.body;
  if (!name || !email || !subject || !message) {
    throw new BadRequestError("Name, email, subject, and message are required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    throw new BadRequestError("Invalid email address");
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
  });

  const contactMessage = await prisma.contactMessage.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      subject: subject.trim(),
      message: message.trim(),
      enquiryType: enquiryType?.trim() || "GENERAL",
      userId: user ? user.id : null,
    },
  });

  // Send notification email to admin (non-blocking)
  try {
    const emailService = new EmailService();
    const html = buildAdminNotificationEmail(contactMessage);
    await emailService.sendEmail(
      ADMIN_EMAIL,
      `New Enquiry: ${subject.trim()} — ${name.trim()}`,
      html
    );
  } catch (err: any) {
    logger.error(`❌ Failed to send admin enquiry notification: ${err.message}`);
  }

  sendSuccess(res, contactMessage, "Message submitted successfully");
});

function buildAdminNotificationEmail(msg: {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  enquiryType: string;
  createdAt: Date;
}): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Enquiry</title>
<style>
  body{margin:0;padding:0;background:#121214;color:#eaeaea;font-family:Inter,-apple-system,sans-serif;}
  .wrap{max-width:600px;margin:40px auto;background:#1e1e22;border:1px solid #2d2d34;border-radius:12px;overflow:hidden;}
  .hdr{padding:24px 32px;border-bottom:1px solid #2d2d34;text-align:center;}
  .logo{font-size:22px;font-weight:700;letter-spacing:4px;color:#d4af37;text-transform:uppercase;}
  .body{padding:32px;}
  h2{color:#d4af37;margin:0 0 20px;}
  .row{display:flex;gap:8px;margin-bottom:12px;}
  .label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#8a8a93;min-width:110px;}
  .val{color:#eaeaea;font-size:14px;}
  .msg-box{background:#18181b;border-left:4px solid #d4af37;padding:16px;border-radius:6px;margin-top:20px;white-space:pre-wrap;font-size:14px;line-height:1.6;}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#d4af37;color:#121214;text-transform:uppercase;letter-spacing:1px;}
  .ftr{padding:20px 32px;background:#18181b;border-top:1px solid #2d2d34;text-align:center;font-size:12px;color:#8a8a93;}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr"><div class="logo">Loavia</div><div style="font-size:11px;letter-spacing:2px;color:#8a8a93;margin-top:4px;">NEW ENQUIRY NOTIFICATION</div></div>
  <div class="body">
    <h2>New Contact Enquiry</h2>
    <div class="row"><span class="label">Type</span><span class="val"><span class="badge">${escape(msg.enquiryType)}</span></span></div>
    <div class="row"><span class="label">Name</span><span class="val">${escape(msg.name)}</span></div>
    <div class="row"><span class="label">Email</span><span class="val">${escape(msg.email)}</span></div>
    ${msg.phone ? `<div class="row"><span class="label">Phone</span><span class="val">${escape(msg.phone)}</span></div>` : ""}
    <div class="row"><span class="label">Subject</span><span class="val">${escape(msg.subject)}</span></div>
    <div class="row"><span class="label">Received</span><span class="val">${new Date(msg.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span></div>
    <div class="msg-box">${escape(msg.message)}</div>
  </div>
  <div class="ftr">© 2026 LOAVIA — Admin Notification</div>
</div>
</body>
</html>`;
}

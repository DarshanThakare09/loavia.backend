import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { BadRequestError } from "../errors/BadRequestError";

export const submitContactMessage = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    throw new BadRequestError("All fields are required");
  }

  // Check if email matches a registered user in our system
  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email.trim().toLowerCase(),
        mode: "insensitive"
      }
    }
  });

  const contactMessage = await prisma.contactMessage.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
      userId: user ? user.id : null
    }
  });

  sendSuccess(res, contactMessage, "Message submitted successfully");
});

import { z } from "zod";
import { ShipmentStatus } from "@prisma/client";

export const shipmentUpdateSchema = z.object({
  trackingNumber: z.string().min(1, "Tracking number is required").max(100),
  courierPartner: z.string().min(1, "Courier partner is required").max(100),
  status: z.nativeEnum(ShipmentStatus).optional(),
});

export const addTrackingEventSchema = z.object({
  status: z.string().min(1, "Status is required").max(50),
  location: z.string().max(255).optional().nullable(),
  description: z.string().min(1, "Description is required"),
});

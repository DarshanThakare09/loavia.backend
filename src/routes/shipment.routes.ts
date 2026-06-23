import { Router } from "express";
import { ShipmentController } from "../controllers/shipment.controller";

const router = Router();
const controller = new ShipmentController();

// Publicly accessible shipment tracking history
router.get("/orders/:id/tracking", controller.getTracking);

export default router;

import { Router } from "express";
import { submitContactMessage } from "../controllers/contact.controller";

const router = Router();

router.post("/contact", submitContactMessage);

export default router;

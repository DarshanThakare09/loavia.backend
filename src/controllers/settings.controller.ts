import { Request, Response } from "express";
import { SettingsService } from "../services/settings.service";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";

const settingsService = new SettingsService();

export class SettingsController {
  getSettings = asyncHandler(async (_req: Request, res: Response) => {
    const settings = await settingsService.getSettings();
    sendSuccess(res, settings, "Settings retrieved successfully");
  });

  updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const settings = await settingsService.updateSettings(req.body);
    sendSuccess(res, settings, "Settings updated successfully");
  });
}

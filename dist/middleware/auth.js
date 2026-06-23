"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jwt_1 = require("../utils/jwt");
const user_repository_1 = require("../repositories/user.repository");
const UnauthorizedError_1 = require("../errors/UnauthorizedError");
const asyncHandler_1 = require("../utils/asyncHandler");
const userRepository = new user_repository_1.UserRepository();
exports.authenticate = (0, asyncHandler_1.asyncHandler)(async (req, _res, next) => {
    const token = req.cookies.access_token;
    if (!token) {
        throw new UnauthorizedError_1.UnauthorizedError("Access token is missing");
    }
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        // Fetch user from DB to verify active status and tokenVersion
        const user = await userRepository.findById(payload.sub);
        if (!user) {
            throw new UnauthorizedError_1.UnauthorizedError("User no longer exists");
        }
        // Check if tokenVersion matches
        if (payload.tokenVersion !== user.tokenVersion) {
            throw new UnauthorizedError_1.UnauthorizedError("Token has been invalidated");
        }
        // Attach user information to request
        req.user = {
            id: user.id,
            role: user.role,
        };
        next();
    }
    catch (error) {
        throw new UnauthorizedError_1.UnauthorizedError("Invalid or expired access token");
    }
});

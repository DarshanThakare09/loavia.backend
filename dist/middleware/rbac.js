"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
const ForbiddenError_1 = require("../errors/ForbiddenError");
const UnauthorizedError_1 = require("../errors/UnauthorizedError");
function requireRole(allowedRoles) {
    return (req, _res, next) => {
        if (!req.user) {
            throw new UnauthorizedError_1.UnauthorizedError("Authentication required");
        }
        if (!allowedRoles.includes(req.user.role)) {
            throw new ForbiddenError_1.ForbiddenError("Insufficient permissions to access this resource");
        }
        next();
    };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContext = void 0;
const uuid_1 = require("uuid");
const requestContext = (req, res, next) => {
    const requestId = req.headers["x-request-id"] || (0, uuid_1.v4)();
    req.id = requestId;
    req.timestamp = Date.now();
    req.ipAddress = req.ip || req.socket.remoteAddress || "";
    req.userAgentString = req.headers["user-agent"] || "";
    // Set the Request ID header on the response
    res.setHeader("X-Request-Id", requestId);
    next();
};
exports.requestContext = requestContext;

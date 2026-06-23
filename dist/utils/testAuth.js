"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("../app"));
const prisma_1 = require("../config/prisma");
const email_service_1 = require("../services/email.service");
const client_1 = require("@prisma/client");
// Intercept email services to capture tokens
let lastVerificationToken = "";
let lastResetToken = "";
email_service_1.EmailService.prototype.sendVerificationEmail = async (_email, _name, token) => {
    lastVerificationToken = token;
};
email_service_1.EmailService.prototype.sendPasswordResetEmail = async (_email, _name, token) => {
    lastResetToken = token;
};
const TEST_EMAIL = "test@loavia.in";
const TEST_PASSWORD = "password123";
const NEW_PASSWORD = "newpassword123";
function parseCookies(cookieHeaders) {
    const cookies = {};
    if (!cookieHeaders)
        return cookies;
    cookieHeaders.forEach((header) => {
        const [cookie] = header.split(";");
        const [name, value] = cookie.split("=");
        cookies[name.trim()] = value.trim();
    });
    return cookies;
}
async function runTests() {
    console.log("🚀 Starting Authentication E2E Integration Tests...");
    // Start Server on a random port
    const server = app_1.default.listen(0);
    const address = server.address();
    const baseUrl = `http://localhost:${address.port}/api/v1`;
    try {
        // 1. Clean Database
        console.log("🧹 Cleaning test user database records...");
        await prisma_1.prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => { });
        // 2. Register Flow
        console.log("📝 Running Register Flow...");
        const regRes = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Test User",
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                phone: "1234567890",
            }),
        });
        const regData = await regRes.json();
        if (regRes.status !== 201 || !regData.success) {
            throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
        }
        console.log("✅ User registered successfully. Token captured.");
        // 3. Login BEFORE verification should fail
        console.log("🔒 Verifying login attempt before email verification fails...");
        const preVerifyLogin = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        });
        const preVerifyData = await preVerifyLogin.json();
        if (preVerifyLogin.status !== 400 || preVerifyData.success) {
            throw new Error(`Login should have failed, got status: ${preVerifyLogin.status}`);
        }
        console.log("✅ Login blocked successfully for unverified email.");
        // 4. Email Verification Flow
        console.log("📧 Verifying Email Verification Flow...");
        if (!lastVerificationToken) {
            throw new Error("No verification token captured!");
        }
        const verifyRes = await fetch(`${baseUrl}/auth/verify-email?token=${lastVerificationToken}`);
        const verifyData = await verifyRes.json();
        if (verifyRes.status !== 200 || !verifyData.success) {
            throw new Error(`Email verification failed: ${JSON.stringify(verifyData)}`);
        }
        const dbUser = await prisma_1.prisma.user.findUnique({ where: { email: TEST_EMAIL } });
        if (!dbUser?.isVerified) {
            throw new Error("User.isVerified was not updated to true in the database");
        }
        const dbLoyalty = await prisma_1.prisma.loyaltyPoints.findUnique({ where: { userId: dbUser.id } });
        if (!dbLoyalty || dbLoyalty.points !== 100) {
            throw new Error("User did not receive 100 registration loyalty points");
        }
        console.log("✅ Email verified. Database state and loyalty points validated.");
        // 5. Login Flow
        console.log("🔑 Running Login Flow...");
        const loginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        });
        const loginData = await loginRes.json();
        if (loginRes.status !== 200 || !loginData.success) {
            throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
        }
        // Extract Cookies
        const setCookieHeaders = loginRes.headers.getSetCookie();
        let cookies = parseCookies(setCookieHeaders);
        let accessTokenCookie = cookies.access_token;
        let refreshTokenCookie = cookies.refresh_token;
        if (!accessTokenCookie || !refreshTokenCookie) {
            throw new Error("Cookies access_token or refresh_token were not set");
        }
        console.log("✅ Login successful. HTTP-Only cookies captured.");
        // 6. Access /me (Auth Middleware check)
        console.log("👤 Testing /me endpoint (Authenticate middleware)...");
        const meRes = await fetch(`${baseUrl}/auth/me`, {
            headers: { Cookie: `access_token=${accessTokenCookie}` },
        });
        const meData = await meRes.json();
        if (meRes.status !== 200 || !meData.success || meData.data.role !== "CUSTOMER") {
            throw new Error(`Me endpoint failed: ${JSON.stringify(meData)}`);
        }
        console.log("✅ Authenticate middleware validated. Retrieved role CUSTOMER.");
        // 7. Access /admin-only (RBAC check - should fail)
        console.log("🚫 Testing RBAC restriction (CUSTOMER attempting Admin endpoint)...");
        const adminRes = await fetch(`${baseUrl}/auth/admin-only`, {
            headers: { Cookie: `access_token=${accessTokenCookie}` },
        });
        const adminData = await adminRes.json();
        if (adminRes.status !== 403 || adminData.success) {
            throw new Error(`Admin endpoint should have returned 403, got: ${adminRes.status}`);
        }
        console.log("✅ RBAC authorization blocked CUSTOMER successfully.");
        // 8. Refresh Token Rotation (RTR) Flow
        console.log("🔄 Running Refresh Token Rotation (RTR)...");
        const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
            method: "POST",
            headers: { Cookie: `refresh_token=${refreshTokenCookie}` },
        });
        const refreshData = await refreshRes.json();
        if (refreshRes.status !== 200 || !refreshData.success) {
            throw new Error(`Token refresh failed: ${JSON.stringify(refreshData)}`);
        }
        const rotatedCookies = parseCookies(refreshRes.headers.getSetCookie());
        const newAccessToken = rotatedCookies.access_token;
        const newRefreshToken = rotatedCookies.refresh_token;
        if (!newAccessToken || !newRefreshToken) {
            throw new Error("Rotated cookies missing");
        }
        console.log("✅ RTR complete. Rotated cookies received.");
        // 9. RTR Reuse Breach Detection
        console.log("🚨 Testing RTR Reuse Breach Detection (Using old refresh token)...");
        const reuseRes = await fetch(`${baseUrl}/auth/refresh`, {
            method: "POST",
            headers: { Cookie: `refresh_token=${refreshTokenCookie}` },
        });
        const reuseData = await reuseRes.json();
        if (reuseRes.status !== 401 || reuseData.success) {
            throw new Error(`Reuse should have failed with 401, got: ${reuseRes.status}`);
        }
        // Verify all sessions are invalidated in DB
        const activeSessionsCount = await prisma_1.prisma.session.count({
            where: { userId: dbUser.id, isValid: true },
        });
        if (activeSessionsCount !== 0) {
            throw new Error("Active sessions were not invalidated after RTR breach detection");
        }
        console.log("✅ RTR Reuse Breach detected. Invalidation of all user sessions verified.");
        // 10. Logout Flow (Relogin first to get valid cookies, then logout)
        console.log("🚪 Running Logout Flow...");
        const reloginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        });
        const reloginCookies = parseCookies(reloginRes.headers.getSetCookie());
        const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
            method: "POST",
            headers: { Cookie: `refresh_token=${reloginCookies.refresh_token}` },
        });
        const logoutCookies = parseCookies(logoutRes.headers.getSetCookie());
        if (logoutCookies.access_token !== "" || logoutCookies.refresh_token !== "") {
            throw new Error("Cookies were not cleared on logout");
        }
        console.log("✅ Logout successful. Cookies cleared.");
        // 11. Forgot Password Flow
        console.log("❓ Running Forgot Password Flow...");
        const forgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL }),
        });
        const forgotData = await forgotRes.json();
        if (forgotRes.status !== 200 || !forgotData.success) {
            throw new Error(`Forgot password failed: ${JSON.stringify(forgotData)}`);
        }
        console.log("✅ Reset token generated.");
        // 12. Reset Password Flow
        console.log("🔑 Running Reset Password Flow...");
        if (!lastResetToken) {
            throw new Error("No reset token captured!");
        }
        const resetRes = await fetch(`${baseUrl}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: lastResetToken, password: NEW_PASSWORD }),
        });
        const resetData = await resetRes.json();
        if (resetRes.status !== 200 || !resetData.success) {
            throw new Error(`Password reset failed: ${JSON.stringify(resetData)}`);
        }
        console.log("✅ Password reset successful.");
        // 13. Verify password change
        console.log("🔐 Testing login with OLD password fails...");
        const oldLogin = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        });
        if (oldLogin.status !== 400) {
            throw new Error("Login with old password should have been blocked");
        }
        console.log("🔐 Testing login with NEW password succeeds...");
        const newLogin = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: NEW_PASSWORD }),
        });
        if (newLogin.status !== 200) {
            throw new Error("Login with new password failed");
        }
        console.log("✅ Password reset connection verified.");
        // 14. RBAC Verification (Update user role to ADMIN and try endpoint)
        console.log("👑 Testing RBAC Auth (ADMIN role)...");
        await prisma_1.prisma.user.update({
            where: { email: TEST_EMAIL },
            data: { role: client_1.UserRole.ADMIN },
        });
        const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: TEST_EMAIL, password: NEW_PASSWORD }),
        });
        const adminCookies = parseCookies(adminLoginRes.headers.getSetCookie());
        const adminOnlyRes = await fetch(`${baseUrl}/auth/admin-only`, {
            headers: { Cookie: `access_token=${adminCookies.access_token}` },
        });
        const adminOnlyData = await adminOnlyRes.json();
        if (adminOnlyRes.status !== 200 || !adminOnlyData.success) {
            throw new Error(`Admin failed to access admin endpoint: ${JSON.stringify(adminOnlyData)}`);
        }
        console.log("✅ RBAC check successful. ADMIN accessed endpoint successfully.");
        console.log("\n🎉 ALL AUTHENTICATION INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
    }
    catch (error) {
        console.error("\n❌ E2E Integration Test Failure:");
        console.error(error);
        process.exitCode = 1;
    }
    finally {
        // Cleanup and Shutdown
        await prisma_1.prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => { });
        await prisma_1.prisma.$disconnect();
        server.close();
    }
}
runTests();

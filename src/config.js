function readNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function createConfig() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const databaseUrl = process.env.DATABASE_URL || "";
  const authSecret = process.env.AUTH_SECRET || (nodeEnv === "production" ? databaseUrl : "dev-only-auth-secret");
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "";
  const paymentProvider = String(process.env.PAYMENT_PROVIDER || (paystackSecretKey ? "paystack" : "demo")).toLowerCase();

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: readNumber("PORT", 3000),
    databaseUrl,
    trustProxy: readBoolean("TRUST_PROXY", nodeEnv === "production"),
    maxRequestBody: process.env.MAX_REQUEST_BODY || "20kb",
    rateLimitWindowMs: readNumber("RATE_LIMIT_WINDOW_MS", 60 * 1000),
    rateLimitMax: readNumber("RATE_LIMIT_MAX", nodeEnv === "production" ? 120 : 1000),
    authSecret,
    cookieSecure: readBoolean("COOKIE_SECURE", nodeEnv === "production"),
    adminEmail: process.env.ADMIN_EMAIL || "",
    adminPassword: process.env.ADMIN_PASSWORD || "",
    paymentProvider: ["demo", "paystack"].includes(paymentProvider) ? paymentProvider : "demo",
    paystackSecretKey,
    paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL || "",
    notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL || "",
    notificationFromEmail: process.env.NOTIFICATION_FROM_EMAIL || "no-reply@fuelup.local",
    resendApiKey: process.env.RESEND_API_KEY || "",
    autoMigrate: readBoolean("AUTO_MIGRATE", true),
    appName: "FuelUp"
  };
}

module.exports = { createConfig };

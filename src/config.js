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

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: readNumber("PORT", 3000),
    databaseUrl,
    trustProxy: readBoolean("TRUST_PROXY", nodeEnv === "production"),
    maxRequestBody: process.env.MAX_REQUEST_BODY || "20kb",
    rateLimitWindowMs: readNumber("RATE_LIMIT_WINDOW_MS", 60 * 1000),
    rateLimitMax: readNumber("RATE_LIMIT_MAX", nodeEnv === "production" ? 120 : 1000),
    appName: "FuelUp"
  };
}

module.exports = { createConfig };

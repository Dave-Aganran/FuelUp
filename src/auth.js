const crypto = require("crypto");

const authCookieName = "fu_auth";
const csrfCookieName = "fu_csrf";

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function signedValue(value, secret) {
  return `${value}.${sign(value, secret)}`;
}

function verifySignedValue(signed, secret) {
  const index = String(signed || "").lastIndexOf(".");
  if (index < 1) {
    return null;
  }

  const value = signed.slice(0, index);
  const signature = signed.slice(index + 1);
  const expected = sign(value, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }

  return value;
}

function parseCookies(request, _response, next) {
  request.cookies = {};
  const header = request.headers.cookie || "";
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) {
      continue;
    }
    request.cookies[rawName] = decodeURIComponent(rawValue.join("="));
  }
  next();
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key.toString("hex"));
    });
  });
  return `scrypt:${salt}:${derived}`;
}

async function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash || "").split(":");
  if (method !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key.toString("hex"));
    });
  });

  const left = Buffer.from(derived, "hex");
  const right = Buffer.from(hash, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function cookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/"
  };
}

function createAuthToken(user, config) {
  const payload = base64Url(JSON.stringify({
    id: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 12
  }));
  return signedValue(payload, config.authSecret);
}

function readAuthToken(token, config) {
  const payload = verifySignedValue(token, config.authSecret);
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function createCsrfToken(config) {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, cookie: signedValue(token, config.authSecret) };
}

function setAuthCookies(response, user, config) {
  const csrf = createCsrfToken(config);
  response.cookie(authCookieName, createAuthToken(user, config), cookieOptions(config));
  response.cookie(csrfCookieName, csrf.cookie, cookieOptions(config));
  return csrf.token;
}

function clearAuthCookies(response, config) {
  response.clearCookie(authCookieName, cookieOptions(config));
  response.clearCookie(csrfCookieName, cookieOptions(config));
}

function attachUser(config) {
  return async (request, _response, next) => {
    request.user = readAuthToken(request.cookies[authCookieName], config);
    next();
  };
}

function requireAuth(request, response, next) {
  if (!request.user) {
    response.redirect(`/login?next=${encodeURIComponent(request.originalUrl)}`);
    return;
  }
  next();
}

function requireCsrf(config) {
  return (request, response, next) => {
    const cookieToken = verifySignedValue(request.cookies[csrfCookieName], config.authSecret);
    const bodyToken = String(request.body.csrfToken || "");
    if (!cookieToken || !bodyToken || cookieToken !== bodyToken) {
      response.status(403).send("Security check failed. Refresh the page and try again.");
      return;
    }
    next();
  };
}

function getCsrfToken(request, config) {
  return verifySignedValue(request.cookies[csrfCookieName], config.authSecret) || "";
}

module.exports = {
  attachUser,
  clearAuthCookies,
  getCsrfToken,
  hashPassword,
  parseCookies,
  requireAuth,
  requireCsrf,
  setAuthCookies,
  verifyPassword
};

import { randomUUID } from "crypto";

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [key, ...value] = part.trim().split("=");
    acc[key] = decodeURIComponent(value.join("="));
    return acc;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const opts = {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
    ...options
  };
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push("Secure");
  if (opts.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

export function getOrCreateSessionId(cookieHeader, options = {}) {
  const cookies = parseCookies(cookieHeader);
  const existing = cookies.ct_sid;
  if (existing) {
    return { sessionId: existing, setCookie: null };
  }
  const sessionId = randomUUID();
  // Only set Secure when the request is actually HTTPS; otherwise browsers will ignore the cookie.
  const secure =
    typeof options.secure === "boolean" ? options.secure : process.env.NODE_ENV === "production";
  const setCookie = serializeCookie("ct_sid", sessionId, { secure });
  return { sessionId, setCookie };
}

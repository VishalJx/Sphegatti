import path from "node:path";
import express from "express";
import crypto from "node:crypto";
import type { StorageConnector, Release } from "./storage/types";
import { registerUser, loginUser, validateApiKey } from "./users";

const sha256Cache = new Map<string, string>();

// In-memory rate limiter — 10 attempts per 15 min per IP on auth routes
const authAttempts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const limit = 10;
  const entry = authAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    authAttempts.set(ip, { count: 1, resetAt: now + window });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

function clientIp(req: express.Request): string {
  const forwarded = req.get("x-forwarded-for");
  return (typeof forwarded === "string" ? forwarded.split(",")[0] : req.ip) ?? "unknown";
}

function isValidEmail(email: string): boolean {
  const at = email.indexOf("@");
  if (at < 1 || at === email.length - 1) return false;
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1 && !domain.includes("@");
}

const ALLOWED_PLATFORMS = new Set(["android", "ios"]);

export function createServer(storage: StorageConnector, port = 4000) {
  const app = express();
  app.disable("x-powered-by");

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "0"); // modern browsers don't need it; CSP is better
    next();
  });

  app.use(express.json({ limit: "16kb" }));

  // Serve landing page + dashboard as static files
  const webDir = path.resolve(__dirname, "../web");
  app.use(express.static(webDir));
  app.get("/dashboard", (_req, res) => {
    res.sendFile(path.join(webDir, "dashboard.html"));
  });

  // ── Auth routes ───────────────────────────────────────────────────────────

  app.post("/api/register", async (req, res) => {
    if (!checkRateLimit(clientIp(req))) {
      return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    }

    const { email, password } = req.body as { email?: unknown; password?: unknown };

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "email and password are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const result = await registerUser(email, password);
    if ("error" in result) return res.status(400).json({ error: result.error });

    return res.status(201).json({ email: result.user.email, apiKey: result.user.apiKey });
  });

  app.post("/api/login", async (req, res) => {
    if (!checkRateLimit(clientIp(req))) {
      return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    }

    const { email, password } = req.body as { email?: unknown; password?: unknown };

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "email and password are required" });
    }

    const result = await loginUser(email, password);
    if ("error" in result) {
      // Same delay as a found-but-wrong-password to prevent user enumeration
      return res.status(401).json({ error: result.error });
    }

    return res.json({ email: result.user.email, apiKey: result.user.apiKey });
  });

  // ── OTA routes ────────────────────────────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/updates/check", async (req, res) => {
    const { appId, platform, runtimeVersion, channel, currentUpdateId } = req.query;

    if (
      typeof appId !== "string" ||
      typeof platform !== "string" ||
      typeof runtimeVersion !== "string" ||
      typeof channel !== "string" ||
      typeof currentUpdateId !== "string"
    ) {
      return res.status(400).json({
        error: "appId, platform, runtimeVersion, channel and currentUpdateId are required",
      });
    }

    const releases = await storage.loadReleases();

    const candidates = releases
      .filter(
        (r) =>
          r.published &&
          r.appId === appId &&
          r.platform === platform &&
          r.runtimeVersion === runtimeVersion &&
          r.channel === channel
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (candidates.length === 0) {
      return res.json({ updateAvailable: false, reason: "no_releases" });
    }

    const latest = candidates[0];

    if (latest.id === currentUpdateId) {
      return res.json({ updateAvailable: false });
    }

    const publicUrl = storage.getBundlePublicUrl(latest);
    let bundleUrl: string;

    if (publicUrl) {
      bundleUrl = publicUrl;
    } else {
      const proto = req.get("x-forwarded-proto") ?? req.protocol;
      const host = req.get("host");
      bundleUrl = `${proto}://${host}/bundles/${latest.id}`;

      if (!sha256Cache.has(latest.bundlePath)) {
        try {
          const content = await storage.readBundle(latest.bundlePath);
          sha256Cache.set(
            latest.bundlePath,
            crypto.createHash("sha256").update(content).digest("hex")
          );
        } catch {
          return res.status(503).json({ error: "Release bundle is missing" });
        }
      }
    }

    const sha256 = sha256Cache.get(latest.bundlePath) ?? "";

    return res.json({ updateAvailable: true, updateId: latest.id, bundleUrl, sha256 });
  });

  app.post(
    "/releases/publish",
    express.raw({ type: "application/octet-stream", limit: "100mb" }),
    async (req, res) => {
      const key = req.get("x-api-key") ?? "";
      if (!(await validateApiKey(key))) {
        return res.status(401).json({ error: "Invalid or missing API key" });
      }

      const { appId, platform, channel, runtimeVersion } = req.query;

      if (
        typeof appId !== "string" ||
        typeof platform !== "string" ||
        typeof channel !== "string" ||
        typeof runtimeVersion !== "string"
      ) {
        return res.status(400).json({
          error: "appId, platform, channel, runtimeVersion are required query params",
        });
      }

      if (!ALLOWED_PLATFORMS.has(platform)) {
        return res.status(400).json({ error: "platform must be android or ios" });
      }
      if (appId.length > 128 || channel.length > 64 || runtimeVersion.length > 32) {
        return res.status(400).json({ error: "Parameter too long" });
      }

      const content = req.body as Buffer;
      if (!Buffer.isBuffer(content) || content.length === 0) {
        return res.status(400).json({ error: "Request body (bundle) is empty" });
      }

      const releaseId = `release-${Date.now()}`;
      const sha256 = crypto.createHash("sha256").update(content).digest("hex");

      const bundlePath = await storage.uploadBundle(releaseId, platform, content);

      const release: Release = {
        id: releaseId,
        appId,
        platform,
        runtimeVersion,
        channel,
        published: true,
        createdAt: new Date().toISOString(),
        bundlePath,
      };

      const existing = await storage.loadReleases();
      await storage.saveReleases([...existing, release]);

      sha256Cache.set(bundlePath, sha256);

      return res.status(201).json({ releaseId, sha256 });
    }
  );

  app.get("/bundles/:id", async (req, res) => {
    const releases = await storage.loadReleases();
    const release = releases.find((r) => r.id === req.params.id);

    if (!release) {
      return res.status(404).json({ error: "Release not found" });
    }

    const publicUrl = storage.getBundlePublicUrl(release);
    if (publicUrl) {
      return res.redirect(302, publicUrl);
    }

    let content: Buffer;
    try {
      content = await storage.readBundle(release.bundlePath);
    } catch {
      return res.status(404).json({ error: "Bundle not found" });
    }

    res.setHeader("Content-Type", "application/javascript");
    return res.send(content);
  });

  return {
    app,
    start(): Promise<void> {
      return new Promise((resolve) => {
        app.listen(port, "0.0.0.0", () => {
          console.log(`OTA server listening on port ${port}`);
          resolve();
        });
      });
    },
  };
}

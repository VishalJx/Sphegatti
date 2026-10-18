import express from "express";
import crypto from "node:crypto";
import type { StorageConnector } from "./storage/types";

const sha256Cache = new Map<string, string>();

export function createServer(storage: StorageConnector, port = 4000) {
  const app = express();
  app.use(express.json());

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
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

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
      const host = req.get("host");
      bundleUrl = `http://${host}/bundles/${latest.id}`;

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

    return res.json({
      updateAvailable: true,
      updateId: latest.id,
      bundleUrl,
      sha256,
    });
  });

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

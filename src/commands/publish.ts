import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { loadConfig } from "../config";
import { createStorageConnector } from "../storage/factory";
import type { Release } from "../storage/types";

export type PublishOptions = {
  platform: string;
  channel: string;
  entryFile: string;
  runtimeVersion?: string;
};

export async function publishCommand(options: PublishOptions) {
  const config = loadConfig();
  const storage = createStorageConnector(config);

  const platform = options.platform;
  const channel = options.channel;
  const runtimeVersion = options.runtimeVersion ?? config.runtimeVersion;
  const appId = config.appId;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ota-publish-"));
  const tmpBundle = path.join(tmpDir, `index.${platform}.bundle`);

  try {
    console.log(`Building ${platform} bundle...`);
    execSync(
      [
        "npx react-native bundle",
        `--platform ${platform}`,
        "--dev false",
        `--entry-file ${options.entryFile}`,
        `--bundle-output ${tmpBundle}`,
        `--assets-dest ${tmpDir}`,
      ].join(" "),
      { stdio: "inherit" }
    );

    const content = fs.readFileSync(tmpBundle);
    const sha256 = crypto.createHash("sha256").update(content).digest("hex");
    const releaseId = `release-${Date.now()}`;

    console.log(`\nUploading bundle (${(content.length / 1024).toFixed(1)} KB)...`);
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

    console.log("");
    console.log("─────────────────────────────────────────");
    console.log(`Release ID : ${releaseId}`);
    console.log(`Platform   : ${platform}`);
    console.log(`Channel    : ${channel}`);
    console.log(`Runtime    : ${runtimeVersion}`);
    console.log(`SHA-256    : ${sha256}`);
    console.log("─────────────────────────────────────────");
    console.log("Done. Run 'npx ota serve' to start the update server.");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import { loadConfig } from "../config";

export type PublishOptions = {
  platform: string;
  channel: string;
  entryFile: string;
  runtimeVersion?: string;
  apiKey?: string;
  serverUrl?: string;
};

export async function publishCommand(options: PublishOptions) {
  const config = loadConfig();

  const serverUrl =
    options.serverUrl ?? config.publish?.serverUrl ?? "https://sphegatti.onrender.com";
  const apiKey = options.apiKey ?? config.publish?.apiKey ?? "";

  if (!apiKey) {
    throw new Error(
      "API key is required. Set publish.apiKey in ota.config.js or pass --api-key <key>."
    );
  }

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

    const params = new URLSearchParams({ appId, platform, channel, runtimeVersion });
    const url = `${serverUrl}/releases/publish?${params}`;

    console.log(`\nUploading bundle (${(content.length / 1024).toFixed(1)} KB) to ${serverUrl}...`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-api-key": apiKey,
      },
      body: content,
    });

    const data = (await res.json()) as { releaseId?: string; sha256?: string; error?: string };

    if (!res.ok) {
      throw new Error(data.error ?? `Server returned HTTP ${res.status}`);
    }

    console.log("");
    console.log("─────────────────────────────────────────");
    console.log(`Release ID : ${data.releaseId}`);
    console.log(`Platform   : ${platform}`);
    console.log(`Channel    : ${channel}`);
    console.log(`Runtime    : ${runtimeVersion}`);
    console.log(`SHA-256    : ${data.sha256}`);
    console.log("─────────────────────────────────────────");
    console.log("Done. Update is live.");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

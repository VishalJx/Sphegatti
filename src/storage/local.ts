import path from "node:path";
import fs from "node:fs";
import type { Release, StorageConnector } from "./types.js";

export class LocalStorageConnector implements StorageConnector {
  constructor(private readonly dir: string) {
    fs.mkdirSync(path.join(dir, "bundles"), { recursive: true });
  }

  async uploadBundle(
    releaseId: string,
    platform: string,
    content: Buffer
  ): Promise<string> {
    const bundleDir = path.join(this.dir, "bundles", releaseId);
    fs.mkdirSync(bundleDir, { recursive: true });
    const bundlePath = path.join(bundleDir, `index.${platform}.bundle`);
    fs.writeFileSync(bundlePath, content);
    return bundlePath;
  }

  getBundlePublicUrl(_release: Release): null {
    return null;
  }

  async readBundle(bundlePath: string): Promise<Buffer> {
    return fs.readFileSync(bundlePath);
  }

  async saveReleases(releases: Release[]): Promise<void> {
    const metaPath = path.join(this.dir, "releases.json");
    fs.writeFileSync(metaPath, JSON.stringify({ releases }, null, 2));
  }

  async loadReleases(): Promise<Release[]> {
    const metaPath = path.join(this.dir, "releases.json");
    if (!fs.existsSync(metaPath)) return [];
    return (JSON.parse(fs.readFileSync(metaPath, "utf-8")) as { releases: Release[] }).releases;
  }
}

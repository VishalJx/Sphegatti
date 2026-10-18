import path from "node:path";
import fs from "node:fs";
import type { Release, StorageConnector } from "./types";

export class LocalStorageConnector implements StorageConnector {
  constructor(private readonly dir: string) {
    fs.mkdirSync(path.join(dir, "bundles"), { recursive: true });
  }

  async uploadBundle(
    releaseId: string,
    platform: string,
    content: Buffer
  ): Promise<string> {
    const relativeKey = `bundles/${releaseId}/index.${platform}.bundle`;
    const absolutePath = path.join(this.dir, relativeKey);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
    return relativeKey;
  }

  getBundlePublicUrl(_release: Release): null {
    return null;
  }

  async readBundle(relativeKey: string): Promise<Buffer> {
    return fs.readFileSync(path.join(this.dir, relativeKey));
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

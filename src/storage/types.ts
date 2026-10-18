export type Release = {
  id: string;
  appId: string;
  platform: string;
  runtimeVersion: string;
  channel: string;
  published: boolean;
  createdAt: string;
  bundlePath: string;
};

export interface StorageConnector {
  uploadBundle(releaseId: string, platform: string, content: Buffer): Promise<string>;
  getBundlePublicUrl(release: Release): string | null;
  readBundle(bundlePathOrKey: string): Promise<Buffer>;
  saveReleases(releases: Release[]): Promise<void>;
  loadReleases(): Promise<Release[]>;
}

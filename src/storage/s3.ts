import type { Release, StorageConnector } from "./types";
import type { S3StorageConfig } from "../config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S3Client = any;

export class S3StorageConnector implements StorageConnector {
  private s3: S3Client | undefined;
  private readonly metaKey: string;

  constructor(private readonly config: S3StorageConfig) {
    this.metaKey = `${config.keyPrefix ?? ""}releases.json`;
  }

  private async getClient(): Promise<S3Client> {
    if (this.s3) return this.s3 as S3Client;
    try {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.s3 = new S3Client({ region: this.config.region });
      return this.s3 as S3Client;
    } catch {
      throw new Error(
        "S3 storage requires @aws-sdk/client-s3. Install it with: npm install @aws-sdk/client-s3"
      );
    }
  }

  async uploadBundle(
    releaseId: string,
    platform: string,
    content: Buffer
  ): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await this.getClient();
    const key = `${this.config.keyPrefix ?? ""}${releaseId}/index.${platform}.bundle`;
    await s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: content,
        ContentType: "application/javascript",
      })
    );
    return key;
  }

  getBundlePublicUrl(release: Release): string {
    if (this.config.cloudfrontDomain) {
      const domain = this.config.cloudfrontDomain.replace(/\/$/, "");
      const base = domain.startsWith("http") ? domain : `https://${domain}`;
      return `${base}/${release.bundlePath}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${release.bundlePath}`;
  }

  async readBundle(_key: string): Promise<Buffer> {
    throw new Error(
      "S3StorageConnector serves bundles via public URL — readBundle should not be called"
    );
  }

  async saveReleases(releases: Release[]): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await this.getClient();
    await s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.metaKey,
        Body: JSON.stringify({ releases }, null, 2),
        ContentType: "application/json",
      })
    );
  }

  async loadReleases(): Promise<Release[]> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await this.getClient();
    try {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: this.metaKey })
      );
      const body = await (response.Body as { transformToString(): Promise<string> }).transformToString();
      return (JSON.parse(body) as { releases: Release[] }).releases;
    } catch (e: unknown) {
      if ((e as { name?: string }).name === "NoSuchKey") return [];
      throw e;
    }
  }
}

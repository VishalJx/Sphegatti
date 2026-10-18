import path from "node:path";
import fs from "node:fs";

export type LocalStorageConfig = {
  type: "local";
  localDir?: string;
  requireConnector?: boolean;
};

export type S3StorageConfig = {
  type: "s3";
  bucket: string;
  region: string;
  keyPrefix?: string;
  cloudfrontDomain?: string;
  requireConnector?: boolean;
};

export type OtaStorageConfig = LocalStorageConfig | S3StorageConfig;

export type OtaConfig = {
  appId: string;
  runtimeVersion: string;
  server?: { port?: number };
  storage?: OtaStorageConfig;
};

export function loadConfig(cwd = process.cwd()): OtaConfig {
  for (const file of ["ota.config.js", "ota.config.cjs"]) {
    const full = path.join(cwd, file);
    if (fs.existsSync(full)) {
      return require(full) as OtaConfig;
    }
  }
  throw new Error(
    `No ota.config.js found in ${cwd}. Run 'ota init' to create one.`
  );
}

import path from "node:path";
import type { OtaConfig } from "../config";
import type { StorageConnector } from "./types";
import { LocalStorageConnector } from "./local";
import { S3StorageConnector } from "./s3";

export function createStorageConnector(config: OtaConfig): StorageConnector {
  const storageConfig = config.storage;
  const storageType = storageConfig?.type ?? "local";

  if (storageType === "s3") {
    if (!storageConfig || storageConfig.type !== "s3") {
      throw new Error("S3 storage config is missing bucket and region");
    }
    return new S3StorageConnector(storageConfig);
  }

  const localConfig = storageConfig?.type === "local" ? storageConfig : undefined;

  if (localConfig?.requireConnector) {
    throw new Error(
      "requireConnector is true but storage type is 'local'. " +
      "Configure an S3 bucket or set requireConnector: false."
    );
  }

  const localDir = path.resolve(
    process.cwd(),
    localConfig?.localDir ?? "./ota-storage"
  );
  return new LocalStorageConnector(localDir);
}

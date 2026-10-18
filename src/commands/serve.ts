import { loadConfig } from "../config";
import { createStorageConnector } from "../storage/factory";
import { createServer } from "../server";

export async function serveCommand() {
  const config = loadConfig();
  const storage = createStorageConnector(config);
  const port = config.server?.port ?? 4000;
  const server = createServer(storage, port);
  await server.start();
}

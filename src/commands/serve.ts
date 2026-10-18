import { loadConfig } from "../config.js";
import { createStorageConnector } from "../storage/factory.js";
import { createServer } from "../server.js";

export async function serveCommand() {
  const config = loadConfig();
  const storage = createStorageConnector(config);
  const port = config.server?.port ?? 4000;
  const server = createServer(storage, port);
  await server.start();
}

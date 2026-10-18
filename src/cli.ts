#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { publishCommand } from "./commands/publish.js";
import { serveCommand } from "./commands/serve.js";

const program = new Command();

program
  .name("ota")
  .description("OTA update platform for React Native")
  .version("1.0.0");

program
  .command("init")
  .description("Create ota.config.js and print native integration steps")
  .action(() => initCommand().catch((e: Error) => { console.error(e.message); process.exit(1); }));

program
  .command("publish")
  .description("Build, hash, and push a new OTA release")
  .option("-p, --platform <platform>", "Target platform (android|ios)", "android")
  .option("-c, --channel <channel>", "Release channel", "production")
  .option("--entry-file <file>", "React Native entry file", "index.js")
  .option("--runtime-version <version>", "Override runtimeVersion from config")
  .action((opts: { platform: string; channel: string; entryFile: string; runtimeVersion?: string }) =>
    publishCommand(opts).catch((e: Error) => { console.error(e.message); process.exit(1); })
  );

program
  .command("serve")
  .description("Start the OTA HTTP server")
  .action(() => serveCommand().catch((e: Error) => { console.error(e.message); process.exit(1); }));

program.parse(process.argv);

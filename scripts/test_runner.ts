// =============================================================================
// File        : test_runner.ts
// Author      : yukimemi
// Last Change : 2025/12/31 21:45:38
// =============================================================================

import { join } from "@std/path";
import { exists } from "@std/fs";

async function runCommand(cmd: string[], cwd?: string) {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const output = await command.output();
  if (!output.success) {
    throw new Error(`Command failed: ${cmd.join(" ")}`);
  }
}

async function main() {
  const cacheDir = join(Deno.cwd(), ".test_cache");
  const denopsPath = join(cacheDir, "denops.vim");

  if (!(await exists(denopsPath))) {
    console.log("Cloning denops.vim for testing...");
    await runCommand(["git", "clone", "https://github.com/vim-denops/denops.vim", denopsPath]);
  } else {
    // Optional: Pull latest denops.vim
    // console.log("Updating denops.vim...");
    // await runCommand(["git", "pull"], denopsPath);
  }

  // Set environment variable
  Deno.env.set("DENOPS_TEST_DENOPS_PATH", denopsPath);
  Deno.env.set("DENOPS_TEST_VERBOSE", "1"); // Optional: for detailed output
  Deno.env.set("DENOPS_TEST_CONNECT_TIMEOUT", "60000"); // 60 sec timeout

  // Run deno test
  const args = Deno.args.length > 0 ? Deno.args : ["tests/"];
  const testCmd = ["deno", "test", "-A", "--no-check", ...args];

  console.log(`Running: ${testCmd.join(" ")}`);

  const command = new Deno.Command(testCmd[0], {
    args: testCmd.slice(1),
    env: {
      DENOPS_TEST_DENOPS_PATH: denopsPath,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await command.spawn().status;

  if (!status.success) {
    Deno.exit(status.code);
  }
}

if (import.meta.main) {
  main();
}

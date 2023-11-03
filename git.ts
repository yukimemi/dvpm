// =============================================================================
// File        : git.ts
// Author      : yukimemi
// Last Change : 2023/11/03 21:24:57.
// =============================================================================

import * as path from "https://deno.land/std@0.204.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.204.0/fs/exists.ts";
import { TextLineStream } from "https://deno.land/std@0.204.0/streams/mod.ts";

export class Git {
  public gitDir: string;

  constructor(public base: string) {
    this.gitDir = path.join(base, ".git");
  }

  private async git(args: string[]): Promise<Deno.CommandOutput> {
    const cmd = new Deno.Command("git", { args: ["-C", this.base, ...args] });
    return await cmd.output();
  }

  private cmdOutToString(output: Deno.CommandOutput): string {
    return new TextDecoder().decode(output.stdout).trim();
  }

  public async getHead(): Promise<string> {
    const headFile = path.join(this.gitDir, "HEAD");
    return (await Deno.readTextFile(headFile)).trim();
  }

  public async getRevisionGit(): Promise<string> {
    return this.cmdOutToString(await this.git(["rev-parse", "HEAD"]));
  }

  public async checkout(rev: string): Promise<void> {
    await this.git(["checkout", rev]);
  }

  public async getBranchGit(): Promise<string> {
    return this.cmdOutToString(
      await this.git(["rev-parse", "--abbrev-ref", "HEAD"]),
    );
  }

  public async getRevision(): Promise<string> {
    const head = await this.getHead();
    const ref = head.substring(5);
    const refFile = path.join(this.gitDir, ref);
    if (await exists(refFile)) {
      const ref = await Deno.readTextFile(refFile);
      return ref.split("\n")[0].trim();
    }
    const packedRefs = await Deno.open(path.join(this.gitDir, "packed-refs"));
    const lineStream = packedRefs.readable.pipeThrough(new TextDecoderStream()).pipeThrough(
      new TextLineStream(),
    );

    for await (const line of lineStream) {
      if (line.match(`/ ${ref}/`)) {
        return line.split(" ")[0];
      }
    }
    return await this.getRevisionGit();
  }

  public async getBranch(): Promise<string> {
    const head = await this.getHead();
    if (head.match(/^ref: refs\/heads\//)) {
      return head.substring(16);
    }
    return await this.getBranchGit();
  }

  public async getLog(
    from: string,
    to: string,
    argOption: string[] = [],
  ): Promise<Deno.CommandOutput> {
    return await this.git(["log", ...argOption, `${from}..${to}`]);
  }

  public async getDiff(
    from: string,
    to: string,
  ): Promise<Deno.CommandOutput> {
    return await this.git(["diff", `${from}..${to}`, "--", "doc", "README", "README.md"]);
  }

  public static async clone(
    url: string,
    dst: string,
    branch?: string,
  ): Promise<Deno.CommandOutput> {
    let args = ["clone", "--recursive", "--filter=blob:none"];
    if (branch) {
      args.push(`--branch=${branch}`);
    }
    args = args.concat([url, dst]);
    const cmd = new Deno.Command("git", { args });
    return await cmd.output();
  }

  public async pull(branch?: string): Promise<Deno.CommandOutput> {
    const currentBranch = await this.getBranch();
    branch ??= currentBranch;
    if (branch !== currentBranch) {
      await this.checkout(branch);
    }
    const args = ["-C", this.base, "pull", "--ff", "--ff-only"];
    const cmd = new Deno.Command("git", { args });
    return await cmd.output();
  }
}

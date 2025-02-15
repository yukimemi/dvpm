// =============================================================================
// File        : git.ts
// Author      : yukimemi
// Last Change : 2024/09/29 00:24:42.
// =============================================================================

import * as path from "jsr:@std/path@1.0.8";
import { exists } from "jsr:@std/fs@1.0.13";
import { TextLineStream } from "jsr:@std/streams@1.0.9";

/**
 * Git
 */
export class Git {
  /// Returns the path to the .git directory
  public gitDir: string;

  /// Creates a new Git instance
  constructor(public base: string) {
    this.gitDir = path.join(base, ".git");
  }

  /// Executes a git command
  private async git(args: string[]): Promise<Deno.CommandOutput> {
    const cmd = new Deno.Command("git", { args: ["-C", this.base, ...args] });
    return await cmd.output();
  }

  /// Converts a CommandOutput to a string
  private cmdOutToString(output: Deno.CommandOutput): string {
    return new TextDecoder().decode(output.stdout).trim();
  }

  /**
   * Get the HEAD
   */
  public async getHead(): Promise<string> {
    const headFile = path.join(this.gitDir, "HEAD");
    return (await Deno.readTextFile(headFile)).trim();
  }

  /**
   * Get the revision from git
   */
  public async getRevisionGit(): Promise<string> {
    return this.cmdOutToString(await this.git(["rev-parse", "HEAD"]));
  }

  /**
   * Checkout a revision
   */
  public async checkout(rev: string): Promise<void> {
    await this.git(["checkout", rev]);
  }

  /**
   * Get the current branch from git
   */
  public async getBranchGit(): Promise<string> {
    return this.cmdOutToString(
      await this.git(["rev-parse", "--abbrev-ref", "HEAD"]),
    );
  }

  /**
   * Get the default branch from git
   */
  public async getDefaultBranchGit(): Promise<string> {
    const branch = path.basename(this.cmdOutToString(
      await this.git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]),
    ));
    if (branch.match(/fatal: /)) {
      await this.git(["remote", "set-head", "origin", "--auto"]);
      return path.basename(this.cmdOutToString(
        await this.git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]),
      ));
    }
    return branch;
  }

  /**
   * Get the revision
   */
  public async getRevision(): Promise<string> {
    const head = await this.getHead();
    const ref = head.substring(5);
    const refFile = path.join(this.gitDir, ref);
    if (await exists(refFile)) {
      const ref = await Deno.readTextFile(refFile);
      return ref.split("\n")[0].trim();
    }
    const packedRefs = await Deno.open(path.join(this.gitDir, "packed-refs"));
    const lineStream = packedRefs.readable.pipeThrough(new TextDecoderStream())
      .pipeThrough(
        new TextLineStream(),
      );

    for await (const line of lineStream) {
      if (line.match(`/ ${ref}/`)) {
        return line.split(" ")[0];
      }
    }
    return await this.getRevisionGit();
  }

  /**
   * Get the current branch
   */
  public async getBranch(): Promise<string> {
    const head = await this.getHead();
    if (head.match(/^ref: refs\/heads\//)) {
      return head.substring(16);
    }
    return await this.getBranchGit();
  }

  /**
   * Get the git log
   */
  public async getLog(
    from: string,
    to: string,
    argOption: string[] = [],
  ): Promise<Deno.CommandOutput> {
    return await this.git(["log", ...argOption, `${from}..${to}`]);
  }

  /**
   * Get the git diff
   */
  public async getDiff(
    from: string,
    to: string,
  ): Promise<Deno.CommandOutput> {
    return await this.git([
      "diff",
      `${from}..${to}`,
      "--",
      "doc",
      "README",
      "README.md",
    ]);
  }

  /**
   * Clone a git repository
   */
  public static async clone(
    url: string,
    dst: string,
    rev?: string,
    depth = 0,
  ): Promise<Deno.CommandOutput> {
    let args = ["clone", "--recursive", "--filter=blob:none"];
    if (rev) {
      args.push(`--branch=${rev}`);
    }
    if (depth > 0) {
      args.push(`--depth=${depth}`);
    }
    args = args.concat([url, dst]);
    const cmd = new Deno.Command("git", { args });
    return await cmd.output();
  }

  /**
   * Pull a git repository
   */
  public async pull(branch?: string): Promise<Deno.CommandOutput> {
    const currentBranch = await this.getBranch();
    branch ??= await this.getDefaultBranchGit();
    if (branch !== currentBranch) {
      await this.checkout(branch);
    }
    const args = ["-C", this.base, "pull", "--ff"];
    const cmd = new Deno.Command("git", { args });
    return await cmd.output();
  }
}

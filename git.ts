// =============================================================================
// File        : git.ts
// Author      : yukimemi
// Last Change : 2025/12/27 21:05:00.
// =============================================================================

import * as path from "@std/path";
import { exists } from "@std/fs";
import { TextLineStream } from "@std/streams";
import { cmdOutToString } from "./util.ts";

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
    const output = await this.git(["rev-parse", "HEAD"]);
    return cmdOutToString(output.stdout)[0] ?? "";
  }

  /**
   * Check if the given ref is a local branch.
   */
  private async isBranch(ref: string): Promise<boolean> {
    const args = ["show-ref", "--verify", `refs/heads/${ref}`];
    const output = await this.git(args);
    return output.success;
  }

  /**
   * Checkout a revision
   */
  public async checkout(rev: string): Promise<Deno.CommandOutput> {
    return await this.git(["checkout", rev]);
  }

  /**
   * Get the default branch from git
   */
  public async getDefaultBranchGit(): Promise<string> {
    const output = await this.git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
    const branch = path.basename(cmdOutToString(output.stdout)[0] ?? "");
    if (branch.match(/fatal: /)) {
      await this.git(["remote", "set-head", "origin", "--auto"]);
      const output = await this.git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
      return path.basename(cmdOutToString(output.stdout)[0] ?? "");
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
   * Returns undefined if in detached HEAD state.
   */
  public async getBranch(): Promise<string | undefined> {
    const head = await this.getHead();
    if (head.match(/^ref: refs\/heads\//)) {
      return head.substring(16);
    }
    // `git rev-parse --abbrev-ref HEAD` returns "HEAD" when in a detached HEAD state.
    // However, since it's not an actual branch name, we return `undefined` here.
    const output = await this.git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branchName = cmdOutToString(output.stdout)[0] ?? "";
    return branchName === "HEAD" ? undefined : branchName;
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
   * Get the git diff stat
   */
  public async getDiffStat(
    from: string,
    to: string,
  ): Promise<Deno.CommandOutput> {
    return await this.git(["diff", "--stat", `${from}..${to}`]);
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
   * Returns CommandOutput if pull was performed, undefined if skipped (e.g. for tags).
   */
  public async pull(refToPull?: string): Promise<Deno.CommandOutput> {
    const currentRef = await this.getBranch();
    const targetRef = refToPull ?? await this.getDefaultBranchGit();

    const isTargetRefABranch = await this.isBranch(targetRef);

    if (!isTargetRefABranch) {
      if (currentRef !== targetRef) {
        await this.git(["fetch"]);
        await this.checkout(targetRef);
      }
      return {
        success: true,
        code: 0,
        stdout: new Uint8Array(),
        stderr: new Uint8Array(),
        signal: null,
      };
    }
    if (currentRef === undefined || currentRef !== targetRef) {
      await this.git(["fetch"]);
      await this.checkout(targetRef);
    }

    return await this.git(["pull", "--ff"]);
  }
}

// =============================================================================
// File        : git.ts
// Author      : yukimemi
// Last Change : 2025/12/30 22:45:00.
// =============================================================================

import * as path from "@std/path";
import { exists } from "@std/fs";
import { TextLineStream } from "@std/streams";
import { cmdOutToString } from "./util.ts";

/**
 * Git class provides a wrapper around git commands.
 */
export class Git {
  /**
   * The path to the .git directory.
   */
  public gitDir: string;

  /**
   * Creates a new Git instance.
   *
   * @param base - Base directory of the git repository.
   */
  constructor(public base: string) {
    this.gitDir = path.join(base, ".git");
  }

  /**
   * Executes a git command.
   *
   * @param args - Arguments for the git command.
   * @returns Command output.
   */
  private async git(args: string[]): Promise<Deno.CommandOutput> {
    const cmd = new Deno.Command("git", { args: ["-C", this.base, ...args] });
    return await cmd.output();
  }

  /**
   * Gets the content of the HEAD file.
   *
   * @returns HEAD content.
   */
  public async getHead(): Promise<string> {
    const headFile = path.join(this.gitDir, "HEAD");
    return (await Deno.readTextFile(headFile)).trim();
  }

  /**
   * Gets the current revision using `git rev-parse HEAD`.
   *
   * @returns Revision string.
   */
  public async getRevisionGit(): Promise<string> {
    const output = await this.git(["rev-parse", "HEAD"]);
    return cmdOutToString(output.stdout)[0] ?? "";
  }

  /**
   * Checks if the given ref is a local branch.
   *
   * @param ref - Reference to check.
   * @returns True if it's a branch, false otherwise.
   */
  private async isBranch(ref: string): Promise<boolean> {
    const args = ["show-ref", "--verify", `refs/heads/${ref}`];
    const output = await this.git(args);
    return output.success;
  }

  /**
   * Checks out a specific revision.
   *
   * @param rev - Revision to checkout.
   * @returns Command output.
   */
  public async checkout(rev: string): Promise<Deno.CommandOutput> {
    return await this.git(["checkout", rev]);
  }

  /**
   * Gets the default branch name from the remote `origin`.
   *
   * @returns Default branch name.
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
   * Gets the current revision, attempting to read from files directly for performance.
   * Falls back to `git rev-parse HEAD` if necessary.
   *
   * @returns Revision string.
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
   * Gets the current branch name.
   *
   * @returns Branch name or undefined if in detached HEAD state.
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
   * Gets the git log between two revisions.
   *
   * @param from - Start revision.
   * @param to - End revision.
   * @param argOption - Additional git log arguments.
   * @returns Command output.
   */
  public async getLog(
    from: string,
    to: string,
    argOption: string[] = [],
  ): Promise<Deno.CommandOutput> {
    return await this.git(["log", ...argOption, `${from}..${to}`]);
  }

  /**
   * Gets the git diff between two revisions for specific documentation files.
   *
   * @param from - Start revision.
   * @param to - End revision.
   * @returns Command output.
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
   * Gets the git diff statistics between two revisions.
   *
   * @param from - Start revision.
   * @param to - End revision.
   * @returns Command output.
   */
  public async getDiffStat(
    from: string,
    to: string,
  ): Promise<Deno.CommandOutput> {
    return await this.git(["diff", "--stat", `${from}..${to}`]);
  }

  /**
   * Clones a git repository.
   *
   * @param url - Repository URL.
   * @param dst - Destination directory.
   * @param rev - Optional revision to checkout.
   * @param depth - Optional clone depth.
   * @returns Command output.
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
   * Cleans the repository by removing untracked files and resetting tracked files.
   *
   * @returns Command output.
   */
  public async clean(): Promise<Deno.CommandOutput> {
    await this.git(["checkout", "."]);
    return await this.git(["clean", "-fd"]);
  }

  /**
   * Pulls the latest changes from the remote repository.
   *
   * @param refToPull - Optional reference to pull. Defaults to the default branch.
   * @param shouldClean - Whether to clean local changes before pulling.
   * @returns Command output.
   */
  public async pull(refToPull?: string, shouldClean = false): Promise<Deno.CommandOutput> {
    const currentRef = await this.getBranch();
    const targetRef = refToPull ?? await this.getDefaultBranchGit();

    if (shouldClean) {
      await this.clean();
    }

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

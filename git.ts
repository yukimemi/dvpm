import * as git from "https://esm.sh/simple-git@3.19.1/";
import * as path from "https://deno.land/std@0.192.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.192.0/fs/exists.ts";
import { readLines } from "https://deno.land/std@0.192.0/io/mod.ts";

export class Git {
  public g: git.SimpleGit;
  public gitDir: string;

  constructor(public base: string) {
    this.g = git.simpleGit(base);
    this.gitDir = path.join(base, ".git");
  }

  public async getHead(): Promise<string> {
    const headFile = path.join(this.gitDir, "HEAD");
    return (await Deno.readTextFile(headFile)).trim();
  }

  public async getRevision(): Promise<string> {
    const head = await this.getHead();
    const ref = head.substring(5);
    const refFile = path.join(this.gitDir, ref);
    if (await exists(refFile)) {
      const ref = await Deno.readTextFile(refFile);
      return ref.split("\n")[0].trim();
    }
    for await (
      const line of readLines(
        await Deno.open(path.join(this.gitDir, "packed-refs")),
      )
    ) {
      if (line.match(`/ ${ref}/`)) {
        return line.split(" ")[0];
      }
    }
    return await this.g.revparse("HEAD");
  }

  public async getBranch(): Promise<string> {
    const head = await this.getHead();
    if (head.match(/^ref: refs\/heads\//)) {
      return head.substring(16);
    }
    return (await this.g.branch()).current;
  }

  public async getLog(from: string, to: string, argOption: string[] = []) {
    const args = ["-C", this.base, "log", ...argOption, `${from}..${to}`];
    const cmd = new Deno.Command("git", { args });
    return await cmd.output();
  }

  public static async clone(url: string, dst: string, branch?: string) {
    const args = branch
      ? [
        "clone",
        "--branch",
        branch,
        url,
        dst,
      ]
      : [
        "clone",
        url,
        dst,
      ];
    const cmd = new Deno.Command("git", { args });
    return await cmd.output();
  }

  public async pull(branch?: string) {
    const currentBranch = await this.getBranch();
    branch ??= currentBranch;
    if (branch !== currentBranch) {
      this.g.checkout(branch);
    }
    console.log(`Update ${this.base}, branch: ${branch}`);
    const args = ["-C", this.base, "pull", "--ff-only", "--rebase=false"];
    const cmd = new Deno.Command("git", { args });
    return await cmd.output();
  }
}

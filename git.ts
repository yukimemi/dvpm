import * as git from "https://esm.sh/simple-git@3.19.0";

export class Git {
  public g: git.SimpleGit;

  constructor(
    public base: string,
  ) {
    this.g = git.simpleGit(base).env({ ...Deno.env.toObject() });
  }

  public static async clone(url: string, dst: string, branch?: string) {
    const cloneResult = branch
      ? await git.simpleGit().clone(url, dst, { "--branch": branch })
      : await git.simpleGit().clone(url, dst);
    return cloneResult;
  }

  public async pull(branch?: string) {
    const head = await this.g.revparse("HEAD");
    const currentBranch = (await this.g.branch()).current;
    branch ??= currentBranch;
    const remote = (await this.g.getRemotes())[0].name;
    console.log(`Update ${this.base}, remote: ${remote}, branch: ${branch}`);
    if (branch !== currentBranch) {
      this.g.checkout(branch);
    }
    const pullResult = await this.g.pull(remote, branch);
    if (pullResult && pullResult.summary.changes) {
      return this.g.log({ from: head });
    }
  }
}

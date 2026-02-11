import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: Deno.env.get("GITHUB_TOKEN"),
});

async function getLatestVimVersion(): Promise<string> {
  const { data } = await octokit.repos.getLatestRelease({
    owner: "vim",
    repo: "vim-win32-installer",
  });
  return data.tag_name;
}

async function getLatestNeovimVersion(): Promise<string> {
  const { data } = await octokit.repos.getLatestRelease({
    owner: "neovim",
    repo: "neovim",
  });
  return data.tag_name;
}

type UpdateResult = {
  vim: { old?: string; new: string };
  neovim: { old?: string; new: string };
};

async function updateWorkflowFile(
  filePath: string,
  vimVersion: string,
  neovimVersion: string,
): Promise<UpdateResult> {
  const content = await Deno.readTextFile(filePath);
  const result: UpdateResult = {
    vim: { new: vimVersion },
    neovim: { new: neovimVersion },
  };

  const lines = content.split("\n");
  let inVimSetup = false;
  let inNeovimSetup = false;

  const newLines = lines.map((line) => {
    if (line.includes("rhysd/action-setup-vim") || line.includes("thinca/action-setup-vim")) {
      inVimSetup = true;
      inNeovimSetup = false;
    } else if (inVimSetup && line.includes("neovim: true")) {
      inNeovimSetup = true;
    } else if (line.trim() === "" || line.startsWith("    -") || line.startsWith("  -")) {
      // New step or empty line
      if (!line.includes("version:")) {
        inVimSetup = false;
        inNeovimSetup = false;
      }
    }

    if (inVimSetup && (line.includes("version:") || line.includes("vim_version:"))) {
      const regex = /((?:vim_)?version:\s+")(v\d+\.\d+\.\d+)(")/;
      const match = line.match(regex);
      if (match) {
        const [fullMatch, p1, oldVer, p3] = match;
        const targetVer = inNeovimSetup ? neovimVersion : vimVersion;
        if (oldVer !== targetVer) {
          if (inNeovimSetup) {
            result.neovim.old = oldVer;
          } else {
            result.vim.old = oldVer;
          }
          return line.replace(fullMatch, `${p1}${targetVer}${p3}`);
        }
      }
    }
    return line;
  });

  const newContent = newLines.join("\n");

  if (content !== newContent) {
    console.log(`Updating ${filePath}...`);
    await Deno.writeTextFile(filePath, newContent);
  } else {
    console.log(`${filePath} is up to date.`);
  }

  return result;
}

async function main() {
  try {
    console.log("Fetching latest versions...");
    const vimVersion = await getLatestVimVersion();
    const neovimVersion = await getLatestNeovimVersion();

    console.log(`Latest Vim: ${vimVersion}`);
    console.log(`Latest Neovim: ${neovimVersion}`);

    const result1 = await updateWorkflowFile(
      ".github/workflows/deno.yml",
      vimVersion,
      neovimVersion,
    );
    const result2 = await updateWorkflowFile(
      ".github/workflows/automerge.yml",
      vimVersion,
      neovimVersion,
    );

    // Merge results (assuming changes are consistent across files)
    const vimOld = result1.vim.old || result2.vim.old;
    const neovimOld = result1.neovim.old || result2.neovim.old;

    // Write to GITHUB_OUTPUT
    const githubOutput = Deno.env.get("GITHUB_OUTPUT");
    if (githubOutput) {
      const messages: string[] = [];
      if (vimOld) {
        messages.push(`- Vim: ${vimOld} -> ${vimVersion}`);
      }
      if (neovimOld) {
        messages.push(`- Neovim: ${neovimOld} -> ${neovimVersion}`);
      }

      if (messages.length > 0) {
        const body = messages.join("\n");
        const delimiter = crypto.randomUUID();
        await Deno.writeTextFile(
          githubOutput,
          `body<<${delimiter}\n${body}\n${delimiter}\n`,
          {
            append: true,
          },
        );
        console.log(`Output body to GITHUB_OUTPUT: ${body}`);
      } else {
        console.log("No version changes detected.");
      }
    }
  } catch (error) {
    console.error(error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}

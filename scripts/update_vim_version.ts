import { Octokit } from "npm:@octokit/rest";

const octokit = new Octokit({
  auth: Deno.env.get("GITHUB_TOKEN"),
});

async function getLatestVimVersion(): Promise<string> {
  // Use vim-win32-installer releases as the source of truth for stable versions available on Windows
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

async function updateWorkflowFile(
  filePath: string,
  vimVersion: string,
  neovimVersion: string,
) {
  const content = await Deno.readTextFile(filePath);
  let newContent = content;

  // Update Vim version
  // Match: version: "v9.1.xxxx" or vim_version: "v9.1.xxxx"
  newContent = newContent.replace(
    /(version:\s+")v\d+\.\d+\.\d+(")/g,
    `$1${vimVersion}$2`,
  );
  newContent = newContent.replace(
    /(vim_version:\s+")v\d+\.\d+\.\d+(")/g,
    `$1${vimVersion}$2`,
  );

  // Update Neovim version
  // This might overlap with Vim version replacement if not careful.
  // Ideally, we should target specific steps, but regex global replace is simple.
  // However, Neovim version is also v0.x.x.
  // The above regex v\d+\.\d+\.\d+ matches both v9.1.2022 and v0.11.5.
  
  // So we need to be more specific.
  
  // Vim update: look for specific context or update logic.
  // Actually, simpler approach:
  // Update rhysd/action-setup-vim for Vim (Ubuntu)
  // Update thinca/action-setup-vim for Vim (Windows/Mac)
  // Update rhysd/action-setup-vim for Neovim
  
  // Let's reload and do it properly.
  
  // Reset content
  newContent = content;

  // Ubuntu Vim (rhysd) & Windows/Mac Vim (thinca)
  // We can assume Vim version starts with v9.
  newContent = newContent.replace(
    /((?:vim_)?version:\s+")v9\.\d+\.\d+(")/g,
    `$1${vimVersion}$2`,
  );

  // Neovim (rhysd/thinca)
  // Assume Neovim version starts with v0.
  newContent = newContent.replace(
    /((?:vim_)?version:\s+")v0\.\d+\.\d+(")/g,
    `$1${neovimVersion}$2`,
  );

  if (content !== newContent) {
    console.log(`Updating ${filePath}...`);
    await Deno.writeTextFile(filePath, newContent);
  } else {
    console.log(`${filePath} is up to date.`);
  }
}

async function main() {
  try {
    console.log("Fetching latest versions...");
    const vimVersion = await getLatestVimVersion();
    const neovimVersion = await getLatestNeovimVersion();

    console.log(`Latest Vim: ${vimVersion}`);
    console.log(`Latest Neovim: ${neovimVersion}`);

    await updateWorkflowFile(
      ".github/workflows/deno.yml",
      vimVersion,
      neovimVersion,
    );
    await updateWorkflowFile(
      ".github/workflows/automerge.yml",
      vimVersion,
      neovimVersion,
    );
  } catch (error) {
    console.error(error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}

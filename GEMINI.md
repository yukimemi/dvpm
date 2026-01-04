# Release Process

The following is the release workflow for `dvpm`:

1. **Bump version**: Update the `version` field in `deno.json`.
2. **Commit changes**: Commit the changes. Use the `--no-verify` flag if the git hooks fail.
3. **Push changes**: Push the commit to the remote repository: `git push origin main`.
4. **Publish**: Run `deno publish` to publish the new version to JSR.
5. **Create tag**: Create a git tag for the new version: `git tag <version>`.
6. **Push tag**: Push the tag to the remote repository: `git push origin <version>`.

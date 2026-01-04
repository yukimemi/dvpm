# Release Process

The following is the release workflow for `dvpm`:

1. **Verify**: Run `deno task ci` to ensure all tests, linting, and formatting pass.
2. **Review**: Check the current status and changes using `git status` and `git diff`.
3. **Bump version**: Update the `version` field in `deno.json`.
4. **Commit changes**: Commit the changes. Use the `--no-verify` flag if the git hooks fail.
5. **Push changes**: Push the commit to the remote repository: `git push origin main`.
6. **Publish**: Run `deno publish` to publish the new version to JSR.
7. **Create tag**: Create a git tag for the new version: `git tag <version>`.
8. **Push tag**: Push the tag to the remote repository: `git push origin <version>`.

# Runner setup: going live with verify_patch

`verify_patch` (and `generate_report` with `runner_run_ids`) never runs project code on the MCP server. They ask a GitHub Actions
workflow in a separate runner repository to build and test the project, then read back its `result.json`. Until you do the steps
below the tool answers with a clear "not configured" message.

**Status: fixture-tested only.** The GitHub client, zip reader, verdict logic and widget are covered by tests against a fake GitHub.
Nothing in this path has been dispatched against the real GitHub API yet. Treat the first real dispatch (step 4) as the acceptance test.

## 1. Create the runner repository

1. Create a repository for the runner, for example `your-org/metamorph-runner`. It can be private.
2. Copy into it, keeping paths: `.github/workflows/metamorph-runner.yml` and the whole `runner/` directory (Dockerfile, `metamorph-run.mjs`, `rector.php`, `rules/`).
3. Make sure the workflow exists on the branch you will dispatch (default `main`). `workflow_dispatch` only works for a workflow file that is on that ref.
4. The workflow uses `permissions: contents: read` and no secrets. Do not add any.

## 2. Create the token

Use a **fine-grained personal access token**, not a classic one.

- Resource owner: the owner of the runner repository.
- Repository access: **Only select repositories** and pick the runner repository only.
- Repository permissions: **Actions: Read and write**. Leave everything else at "No access" (GitHub adds Metadata: read automatically).
- Expiration: the shortest you are willing to rotate (for example 90 days). Put the expiry date in your calendar.

Actions write is needed to dispatch the workflow, Actions read to poll runs and download the artifact. The token can run workflows in that one
repository and read its run results; it cannot read code or reach any other repository.

## 3. Set the environment in NitroCloud

Set these in the project environment variables of the deployed server (not in a file in the repository):

| Variable | Value |
|---|---|
| `METAMORPH_GITHUB_TOKEN` | the fine-grained token from step 2 |
| `METAMORPH_RUNNER_REPO` | `owner/name` of the runner repository |
| `METAMORPH_RUNNER_REF` | optional, branch or tag holding the workflow (default `main`) |

Redeploy or restart so the server picks them up. The token is only ever sent to `api.github.com`; it is never logged, returned or put in an error message.
The artifact download follows GitHub's redirect without the token, and only to the hosts GitHub documents for artifacts
(`*.blob.core.windows.net`, `*.actions.githubusercontent.com`).

`verify_patch` also needs the existing `METAMORPH_TOKEN_SECRET` (the approval token flow) and a `write` scope API key.

## 4. Dispatch once by hand

Before trusting the tool, run the workflow yourself with the GitHub CLI, using the demo repository and no patch:

```bash
gh workflow run metamorph-runner.yml \
  --repo your-org/metamorph-runner --ref main \
  -f repo_url=https://github.com/dhilipa01/metamorph-demo-legacy \
  -f subfolder=php-shop \
  -f checks=light \
  -f request_id=manual-1

gh run list --repo your-org/metamorph-runner --workflow metamorph-runner.yml --limit 3
gh run watch --repo your-org/metamorph-runner        # pick the run
```

The run name contains the `request_id` (`Metamorph runner manual-1`). The first run builds the image from scratch and can take around 20 minutes;
later runs are faster only if you add layer caching or publish the image.

To test the patch path, gzip and base64 a diff and pass it as `patch_gz_b64` (the cap is 60,000 characters after compression, 65,535 for all inputs together):

```bash
gh workflow run metamorph-runner.yml --repo your-org/metamorph-runner --ref main \
  -f repo_url=https://github.com/dhilipa01/metamorph-demo-legacy -f subfolder=php-shop \
  -f patch_gz_b64="$(gzip -9c fix.diff | base64 -w0)" -f request_id=manual-2
```

## 5. Check the result

```bash
gh run download <run-id> --repo your-org/metamorph-runner -n metamorph-result -D out
cat out/result.json | head -40
```

Look for: `"schema": 1`, the expected `repo` and `commit`, `patchApplied` (true only for the patched run), the `checks` list, `buildOk` and `tests`.
For the php-shop demo expect `buildOk: false` with `composer-install` failing (the repository's lockfile is a stub and the runner image has PHP 8.4):
that is the correct, honest outcome, and `verify_patch` reports it as `verified: false` with the reason "composer install failed".

Then call `verify_patch` from your MCP client (it needs `repo_url`, `stage` and the `approval_token` from `preview_changes`). Expect `status: "running"` with run ids on the first call
because runs take minutes; call it again with `run_id` and `baseline_run_id` until `status` is `completed`. Pass the same ids to `generate_report` as
`runner_run_ids: { baseline, patched }` to fill the report's Verification section.

## Known limits

- The runner clones the default branch of the repository; a `/tree/<branch>` URL is verified against the default branch and `verify_patch` says so in `notes`.
- Env file changes (contents are never sent anywhere) are left out of the verified patch.
- Legacy projects often cannot install on the runner's PHP 8.4 or Node 22 (old PHP constraints, stub lockfiles). That shows as "build not verified", never as a pass.
- Artifacts are kept 3 days; a run older than that cannot be read again.
- Cost: every `verify_patch` starts two runs (patched and baseline) on GitHub-hosted runners. Watch your Actions minutes.
- Rotate the token before it expires; an expired token shows as "HTTP 401 ... Check that METAMORPH_GITHUB_TOKEN is valid".

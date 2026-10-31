# DEMO: Metamorph MCP (under 3 minutes, recorded in NitroStudio)

Total: 15 + 35 + 40 + 40 + 20 + 20 = 170s (2:50). Repo: `https://github.com/dhilipa01/metamorph-demo-legacy`, subfolder `php-shop`.

## Pre-flight checklist
- [ ] NitroCloud dashboard: app `metamorph`, latest deployment is Live
- [ ] `GET <deployed-url>/mcp/health` returns 200
- [ ] Write-scope key in hand (plain key, from the password manager). Never show it on screen; paste before recording
- [ ] Host has `METAMORPH_TOKEN_SECRET` set (else preview returns no token and apply refuses)
- [ ] Ports 3001 and 3002 free if using local: `ss -ltnp | grep -E ":(3001|3002)"`
- [ ] Studio launched (`nitrostudio`), signed in with API key, remote server added: HTTP, URL ends `/mcp`, Bearer token
- [ ] Dry run the full sequence once; the approval token lives only 300s, so do preview and apply back to back
- [ ] Widgets render in Studio (not yet verified at time of writing): check assess, plan and apply
- [ ] Notifications off, window large, font readable, no key or secret visible
- [ ] Fallback: if the remote fails, run locally with `npm run dev`, `METAMORPH_AUTH=off`, and say it is a local run

## Beat 1: Problem (0:00-0:15)
- Screen: Studio with the server connected, tool list visible
- Tool call: none
- Say: "Legacy code piles up vulnerable dependencies, and nobody wants to touch it blind. Metamorph is an MCP server that scores a legacy repo, plans the upgrade, and shows the exact diff before anything changes."

## Beat 2: Connect + assess (0:15-0:50)
- Screen: server list showing connected, then the assess result and score dashboard
- Tool call: `assess_project`
```json
{ "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop" }
```
- Say: "Connected over HTTP with a Bearer key. I point it at a public repo, a PHP shop. Score: 17 out of 100. The findings are vulnerable dependencies. Read-only, no repo code is run."

## Beat 3: Plan + preview with diff (0:50-1:30)
- Screen: plan dashboard with stages, then the preview diff
- Tool calls:
```json
plan_modernization: { "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop", "goal": "patch_advisory" }
preview_changes:    { "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop", "stage": "patch-dependencies", "goal": "patch_advisory" }
```
- Say: "The plan is ordered stages with risk and rollback. I preview the first one: here is the exact diff, bumping guzzle and symfony http-kernel. The preview also hands back a signed approval token, valid five minutes, tied to this plan and this patch."
- Note: pass the same `goal` to plan and preview. If the plan lacks `patch-dependencies` for that goal, use the stage id the plan shows

## Beat 4: Apply, before/after (1:30-2:10)
- Screen: apply_stage result, score widget 17 to 41
- Tool call (paste the real token from preview; do not show it for long):
```json
{ "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop", "stage": "patch-dependencies", "goal": "patch_advisory", "approval_token": "<approvalToken from preview_changes>" }
```
- Say: "Now apply, with a write key. It patches a throwaway copy, not my repo. Score goes from 17 to 41. Fixed: the guzzle and symfony http-kernel advisories. It is a projection; I get the patch, run git apply, and re-assess to confirm."

## Beat 5: Security, bogus token refused (2:10-2:30)
- Screen: error message from the refused call
- Tool call: same as beat 4 with a fake token
```json
{ "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop", "stage": "patch-dependencies", "goal": "patch_advisory", "approval_token": "bogus.token" }
```
- Say: "Security: a made-up token is refused. Real tokens are HMAC-signed, bound to the plan and patch hash, and expire in 300 seconds. Scopes are read, plan, write. Only apply needs write."

## Beat 6: Close + roadmap (2:30-2:50)
- Screen: README roadmap section, or the php-shop-modernized score of 100 if shown
- Tool call: none (optional: `assess_project` on `php-shop` subfolder replaced by `php-shop-modernized`, only if time allows)
- Say: "Five tools live, 391 tests. Designed but not built yet: PHP to Node mapping, cloud skeletons, a Build mode, and CVE watch. Metamorph: assess, plan, preview, approve, apply."

## If something goes wrong
- `Cannot POST /`: URL missing `/mcp`
- 401: wrong or missing key; 403: key scope too low (apply needs write)
- Token expired: run preview again and apply within 300s
- "Waiting for widget server" (local): free ports 3001 and 3002 and retry

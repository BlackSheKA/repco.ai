Deploy current `development` branch: version bump, push (triggers Vercel preview), and merge into `main` locally — without pushing main. Code-only — no database changes.

## Arguments

Optional argument: `patch` (default), `minor`, or `major` to control the version bump.

Examples:
- `/project:deploy-to-test` — bumps patch (0.0.1 → 0.0.2)
- `/project:deploy-to-test minor` — bumps minor (0.0.2 → 0.1.0)
- `/project:deploy-to-test major` — bumps major (0.1.0 → 1.0.0)

## Steps

1. **Check current branch** — must be on `development`. If not, abort.
2. **Check working tree** — if there are uncommitted changes, ask user whether to commit them first.
3. **Version bump** on `development`:
   - Read current version from `package.json`
   - Bump according to argument (default: `patch`)
   - Update `package.json` version field
   - Commit: `chore: bump version to vX.Y.Z`
   - Create git tag `vX.Y.Z`
4. **Push development to remote** — triggers Vercel preview deploy:
   ```bash
   git push origin development --tags
   ```
5. **Merge into main (locally only — do NOT push main):**
   ```bash
   git checkout main
   git merge development
   git checkout development
   ```
6. **Report the result:**
   - Show new version number
   - Show the preview URL pattern: `https://repco-ai-git-development-outsi.vercel.app`
     (note: protected by Vercel SSO — open in browser logged into Vercel)
   - Confirm `main` is ready with the merge but NOT pushed
   - Remind: "Main is ready locally. Test the preview, then run `/deploy-to-production` to push main and ship to repco.ai."

## Important
- **Do NOT push `main`** — that's what `/deploy-to-production` does
- Never force-push to `main`
- If merge has conflicts, stop and report them — do not auto-resolve
- Vercel cron only runs on production deployments — preview deploys won't auto-trigger crons

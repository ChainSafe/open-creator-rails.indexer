---
description: Bump the open-creator-rails submodule to a target tag and walk the post-bump checklist
argument-hint: <tag-or-ref>
---

Bump the `open-creator-rails` submodule to `$ARGUMENTS` and walk the post-bump checklist from `.claude/CLAUDE.md`. **Report findings before making derivative changes** — the user decides what needs handler / schema / docs updates based on the diff.

## Workflow

1. **Verify clean state.** Run `git -C open-creator-rails status`. If the submodule worktree has uncommitted changes, surface the diff and stop — don't auto-discard the user's in-flight work.

2. **Resolve the target ref.** If `$ARGUMENTS` is empty, list the submodule's recent tags (`git -C open-creator-rails tag --sort=-creatordate | head`) and ask the user which one. Otherwise verify the ref exists (`git -C open-creator-rails rev-parse --verify $ARGUMENTS`).

3. **Capture the current pin** for later diff comparisons:
   ```
   git -C open-creator-rails rev-parse HEAD
   ```
   Remember this SHA — you'll diff against it in steps 7–9.

4. **Check out the target.** `git -C open-creator-rails checkout $ARGUMENTS`. Confirm worktree is clean afterwards.

5. **Regenerate ABIs.** `pnpm sync` (runs `forge build` then `sync-abis.js`). Surface any errors. The settings.json adds `$HOME/.foundry/bin` to PATH; if `forge: command not found` appears, foundry isn't installed at the expected path.

6. **Regenerate deployment files.** `pnpm sync:deployments`. Show the diff for `config/deployments/*.json`. Address rotations or removals (e.g. Sepolia asset_1's address change in #47) need to be flagged.

7. **Diff `_claimable()` math.** **This is the critical fidelity check.** Show the diff of `open-creator-rails/src/Asset.sol`'s `_claimable` function between the previous pin and the new one:
   ```
   git -C open-creator-rails diff <previous-sha>..HEAD -- src/Asset.sol | grep -A 100 "_claimable"
   ```
   If non-empty, `src/handlers/claimable.ts`'s `computeClaimable` needs a mirroring update. Recommend specific TypeScript changes; do not auto-apply.

8. **Diff event signatures.** Show the diff of the regenerated ABI files focused on `"type": "event"` entries:
   ```
   git diff -- config/AssetABI.ts config/AssetRegistryABI.ts
   ```
   Highlight:
   - **New fields on existing events** — handler must capture, schema entity needs the column, GraphQL typeDefs need the field.
   - **Entirely new events** — need a fresh `ponder.on()` handler in `src/handlers/` + schema entity + GraphQL surface.
   - **Renamed or removed fields** — breaking; flag for the user.

9. **Diff seed-script signatures.** Show the diff of `open-creator-rails/scripts/*.sh`. The indexer's `scripts/seed-local.sh` calls these directly:
   ```
   git -C open-creator-rails diff <previous-sha>..HEAD -- scripts/
   ```
   Positional-arg changes silently break `pnpm dev:local` (the seed has `set -e` but `cast send` failures inside subshells don't always trip it). Flag any arg-list changes for the user to mirror in `seed-local.sh`.

10. **Summarise required follow-ups.** List the concrete edits the user needs to make:
    - Handler updates (which files, which event/function).
    - Schema entity additions or field changes (`ponder.schema.ts`).
    - Doc updates (`data-model.md`, `queries.md`) per the maintenance rules in CLAUDE.md.
    - Seed-script signature mirroring (`scripts/seed-local.sh`).
    - Recommend running `pnpm dev:local` end-to-end to smoke-test once the edits land.

## Notes

- **Don't commit** the submodule bump or any derivative changes. The user commits manually after reviewing.
- **Don't auto-add handlers** for newly-discovered events without explicit user direction — flag and ask.
- **The `_claimable()` fidelity check (step 7) is the load-bearing item.** A silent divergence here causes claimable amounts to drift from on-chain truth, exactly the failure mode the architecture doc warns about. If the diff is non-trivial, treat it as the highest-priority follow-up.
- If `pnpm sync` or `pnpm sync:deployments` fails, **stop and surface the error**. Don't proceed to diff steps against a half-bumped state.

# fweep release process

## Migration policy reference
This release process depends on the migration policy in [migration-process.md](/Users/rileypb/dev/Inform/fweep/migration-process.md), especially the current transition rule:

- `v2` ships using the existing implicit compatibility behavior in the loader and load-time normalization
- formal explicit map-document migrations begin with `v3`
- release review for `v2` verifies current compatibility behavior rather than retrofitting a formal migration framework
- release review for `v3` and later requires explicit stepwise migrations for schema-affecting changes

## Branch model
- GitHub Pages deploys from `main`
- each release is assembled on a branch named `vN`
- nothing is merged into `main` until the release is ready
- `git diff main...vN` is the release delta to review

## Release identity
- The release number `N` is the number in the release branch name `vN`.
- Release numbers advance only when a branch is being prepared for merge to `main` as the next published release.
- Release notes should consistently refer to the release as `vN`.
- If git tags are introduced later, the tag should match the release name `vN`.

## Release workflow
When preparing `release vN`:

0. Fetch the git history to ensure the release branch is up to date with `main` and the diff is accurate.
1. Review `main...vN` to understand exactly what will ship.
2. Audit persisted-data impact:
   - for `v2`, verify that the existing implicit compatibility behavior is sufficient
   - for `v3` and later, confirm that all schema-affecting changes have the required explicit migrations and tests
3. Verify the release manually:
   - confirm older saved maps still load correctly
   - confirm import/export behavior still works for the supported map shapes involved in the release
4. If the release audit finds missing migration work:
   - for `v2`, resolve the compatibility gap without retrofitting the full formal migration framework unless that becomes necessary
   - for `v3` and later, add the missing schema-version bump, migration, and tests before release
5. Draft release notes:
   - base them primarily on `main...vN`
   - summarize user-visible changes, compatibility notes, and any migration or persistence implications
   - use commit messages only when the diff needs extra context or grouping
   - user reviews the release notes before proceeding to validation and merge
6. Run release validation:
   - run the required automated checks for the release branch
   - complete the manual smoke-test checklist
   - treat any failing build, failing test, or broken core editing flow as a release blocker
7. After verification, commit any release-specific fixes on `vN`.
8. Open a pull request from `vN` to `main`.
9. Merge to `main` only after the release branch is verified and approved.
10. After merge, confirm the GitHub Pages deployment from `main` completed successfully.
11. Perform post-deploy smoke checks against the deployed site.

## Automated validation
Before merge, the release branch should pass:

- the production build
- the relevant automated test suite
- any additional validation added later that is required for shipping

If a check fails, the release is blocked until the failure is understood and either fixed or explicitly deferred by policy.

## Manual smoke tests
Before merge, verify at minimum:

- the app loads successfully from the release branch build
- opening an existing map works
- creating and saving a map works
- reloading a saved map works
- import/export works for the map shapes affected by the release
- the user-visible features changed in `main...vN` behave as intended

For `v2`, include explicit checks that older saved maps still load correctly under the current implicit compatibility behavior.

For `v3` and later, include explicit checks that migrated maps can load, save, and reload correctly after migration.

## Release checklist
- `main...vN` reviewed
- persisted-data impact reviewed
- migration policy satisfied for this release
- automated validation passed
- manual compatibility verification completed
- release notes drafted from `main...vN` with commit messages used as needed
- release fixes committed on `vN`
- PR from `vN` to `main` opened
- PR reviewed and approved
- GitHub Pages deployment confirmed after merge
- post-deploy smoke checks completed

## Release notes
- Draft release notes before merge so they can be reviewed alongside the release PR.
- Base release notes on `main...vN`.
- Use commit messages only to recover intent or group changes when the diff alone is not enough.
- Record the long-form release notes in `release-notes.md`.
- Keep `release-notes.md` cumulative across releases:
  - use `# fweep release notes` as the document title
  - add each release as its own section such as `## v2`, `## v3`, and so on
  - append new release notes instead of replacing the file contents
- Use a shorter blurb when creating the published release.
- Use a more polished narrative version when creating the PR from `vN` to `main`.
- Organize notes around:
  - user-visible changes
  - compatibility or migration notes
  - notable fixes
- Internal refactors with no user-visible effect may be omitted unless they affect compatibility, reliability, or future migration work.

## Approval and signoff
- The release should not be merged until it has an explicit go-ahead after diff review, migration review, automated validation, and smoke testing.
- Any unresolved issue affecting core editing, map loading, saving, importing, exporting, or deployment is a release blocker unless consciously deferred.

## Deployment and rollback
- After merging `vN` to `main`, verify that GitHub Pages built and published the expected revision.
- Perform basic smoke checks on the deployed site, not only on the branch build.
- If the deployed release is broken, prefer fixing from a dedicated follow-up branch based on the release state and merging the fix back to `main`.
- Record any rollback or hotfix decision in the release notes or PR discussion so the release history stays understandable.

## Notes
- Release number and map schema version are not the same thing.
- Not every release needs a schema migration.
- If a migration gap is discovered late, follow the late-discovered migration guidance in [migration-process.md](/Users/rileypb/dev/Inform/fweep/migration-process.md).

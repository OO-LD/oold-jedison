# Working on the OO-LD fork

Upstream contribution rules are in `CONTRIBUTING.md` and still apply to anything under `src/`
that is not `src/oold/`. This file covers only what is specific to the fork.

See `SPEC.md` for what the fork is supposed to do.

## Layout

| Path | Origin | Rule |
|---|---|---|
| `src/` | upstream | Patch only where no extension point exists, one commit per patch |
| `src/oold/` | fork | All OO-LD code lives here |
| `src-docs/` | upstream | Playground source, extended with the OO-LD demos |
| `dist/`, `docs/` | generated | Never edit by hand, never resolve a conflict in them |

A change under `src/` that carries nothing OO-LD specific is a bug report or a pull request
against upstream first, and is only carried here while that is pending.

## Branches

`main` tracks `germanbisurgi/jedison` and carries no fork commits. All work lands on `oold`.
Keeping `main` clean is what makes a rebase a rebase rather than a merge.

## First-time clone setup

Two things are not carried in the repository and have to be set per clone.

```bash
git config merge.ours.driver true
```

`.gitattributes` marks `dist/`, `docs/` and `yarn.lock` with `merge=ours`. Git has no built-in
driver of that name, so without this line the attribute is silently ignored and the generated
files conflict on every sync.

The project declares `yarn@1.22.22`. Where yarn is not installed and corepack is unavailable,
corepack having been unbundled from the Node distribution as of Node 25, prefix every command:

```bash
npx --yes yarn@1.22.22 install --frozen-lockfile
npx --yes yarn@1.22.22 unit
```

## Node version

Upstream CI pins nothing and runs whatever `ubuntu-24.04` ships, so there is no declared
supported version. On an odd-numbered Node release the install fails, because the `postcss/nanoid`
entry in the upstream `resolutions` block pulls `nanoid@6`, whose `engines` field admits only
`^22 || ^24 || >=26`. The restriction is a support statement rather than a technical one.

Either use an even-numbered release, which is what CI effectively does, or install with:

```bash
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-engines
```

## Syncing with upstream

```bash
git fetch upstream --tags
git checkout main && git merge --ff-only upstream/main && git push
git checkout oold && git rebase main
npx --yes yarn@1.22.22 install
npx --yes yarn@1.22.22 build        # regenerate dist/ and docs/
npx --yes yarn@1.22.22 unit
git add dist docs && git commit -m "chore: rebuild after upstream sync"
```

The rebuild is not optional. `merge=ours` keeps our copy of the generated output, which is by
definition stale once upstream source has moved, so the build is what makes it true again.

After a sync, check the upstream `CHANGELOG.md` for the range that came in. A release that adds
an extension point may mean a fork patch can be dropped, and a release that changes `RefParser`,
`UiResolver` or the editor resolution order may mean one has to be rewritten.

## Live backend tests

`tests/unit/tests/oold-backend-live.test.js` queries the public endpoints the specification
names, `query.wikidata.org` and `demo.open-semantic-lab.org`. It is skipped unless `OOLD_LIVE=1`,
because a suite that fails when a third-party service is slow stops being evidence about this
code.

```bash
OOLD_LIVE=1 npx --yes jest --config=./tests/unit/jest.config.cjs tests/unit/tests/oold-backend-live.test.js
```

Run it when a backend adapter changes. A mocked adapter only proves it agrees with the fixture
its own author wrote, so these are what establish that the fixtures were not wishful.

Not every Wikidata entity carries an English `rdfs:label` in the query service graph, so a live
test asserts against one that demonstrably does rather than against a famous identifier.

## Known end-to-end flake

Whichever `@oold` scenario runs first fails its `_selectExample` wait roughly one run in
two, and the same scenario passes when it is not first. A suite-level warm-up navigation did
not remove it, and upstream shows the same pattern in its `@constraint` scenarios on a clean
v1.31.1 checkout, so it is the harness rather than this code.

Re-run before treating a single first-scenario failure as a regression. A failure in any
other position is real.

## Before opening a pull request

```bash
npx --yes yarn@1.22.22 lint
npx --yes yarn@1.22.22 unit
npx --yes yarn@1.22.22 e2e
```

The upstream suites must pass unmodified. They are the evidence that the layering held, so a
change to an upstream test is a finding to discuss rather than a step in the task.

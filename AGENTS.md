# Working on this repo

Context for coding agents. Read this before changing anything.

## What this is

A put–call parity speed drill for macOS, in the spirit of Zetamac. A native
Swift shell hosts a `WKWebView`; the drill itself is plain HTML, CSS and
JavaScript with no framework, no build step and no dependencies.

The app never touches the network. Fonts are bundled, assets are served from
inside the app bundle over a custom `pcp://` URL scheme. Keep it that way.

## Layout

```
src/levels.js          problem generators, one per level
src/engine.js          state, timing, scoring, input — skin-agnostic
src/history.js         the history screen: high scores, recent runs, averages
src/skins.js           skin registry
src/base.css           @font-face, reset, centring. Deliberately boring.
src/index.html         the one DOM every skin renders into
src/skins/<id>/        skin.js (one line) + skin.css (everything visual)
src/mac/main.swift     the WKWebView shell
scripts/build-app.sh   compile, bundle, sign, install
scripts/make-icon.swift
tests/levels.test.js   parity verification, no framework — plain node
```

## Invariants

Break these and the drill is wrong, not just ugly.

1. **All money is integer cents.** Never store or compare prices as floats.
   `levels.js` builds every problem in cents so answers land exactly on the
   0.05 grid; `parseCents` converts typed input the same way. Float money
   reintroduces rounding drift that silently marks correct answers wrong.

2. **Advancing means you were right.** On typed levels a wrong answer simply
   does not advance. On J/K levels a wrong key *holds the problem* and records
   one fumble. If a wrong answer ever advanced, the two shapes would give
   contradictory feedback and the keypress would read as "accepts anything".

3. **A fumble counts once per problem.** Retrying must not inflate the miss
   count. Guarded by `game.fumbled`.

4. **Reserve layout space that comes and goes.** The J/K trade rows are
   present on every problem and hidden with `visibility`, never `display`, so
   a mixed run never jumps.

5. **Best scores compare within one configuration.** Keyed on duration plus
   level set, so a 30s run never outranks a 300s one.

6. **No network at runtime.** No CDN links, no telemetry, no fetch.

## Adding a skin

A skin is **one CSS file and one line of registration**. It never adds or
removes DOM.

1. `mkdir src/skins/myskin`
2. `src/skins/myskin/skin.js`:

   ```js
   PCP.skin({ id: 'myskin', name: 'my skin', css: 'skins/myskin/skin.css' });
   ```

   Optional: `scorePad: 4` renders the score as `0012`.

3. `src/skins/myskin/skin.css` — start by copying `skins/minimal/skin.css`.
4. Add one `<script src="skins/myskin/skin.js"></script>` to `index.html`,
   next to the others.
5. Add the same file to the copy list in `scripts/build-app.sh` if you place
   it outside `src/skins/` (the whole directory is copied, so normally you
   need not).

It then appears in the menu's `skin` row automatically, and the choice
persists.

### The slot contract

The engine writes into `[data-pcp="…"]` elements. Style them, hide them,
reposition them — but do not rename or remove them.

| slot | what the engine puts there |
|---|---|
| `overlay` | nothing; a free layer for scanlines, vignettes, grain |
| `brand`, `brand-small` | nothing — supply the wordmark via CSS `content` |
| `levels` | the level rows (`.row` > `.n`, `.name`, `.state`) |
| `durations`, `submits`, `skins` | option rows of `.choice` |
| `label-*` | nothing — supply the caption via CSS `content` |
| `menu-hint`, `results-hint`, `history-hint` | hint text |
| `timebar` | 40 `<i>` cells; lit ones carry `data-on` |
| `clock` | `m:ss` remaining |
| `stage` | gains class `fresh` on each new problem |
| `givens` | `.given` > `.sym` + `.val` |
| `solve-label` | the unknown's symbol |
| `answer` | the real `<input>` |
| `typed` | a mirror of what has been typed |
| `caret` | nothing; hidden by default, for a custom caret |
| `trades` | J/K rows; `data-empty="true"` when the level has none |
| `score` | the score; gains class `hit` on each solve |
| `streak` | 8 `<i>` pips; `data-broke` for ~340ms on a miss |
| `best` | best streak this run |
| `banner`, `hist-banner` | nothing — supply via CSS `content` |
| `total`, `rate`, `pb` | score, rate, and `new best` / `best N` |
| `finals` | `.final` stat blocks (score, rate, streak, accuracy, best) |
| `breakdown` | per-level `.bd` rows |
| `misses` | `.miss` rows with the correct answer |
| `runs`, `lifetime` | history rows |
| `runs-cap`, `lifetime-cap` | nothing; `data-show` is `true`/`false` |

Both `headline`/`total` and `finals` are always rendered. `minimal` hides
`finals`; `arcade` hides `headline`. Pick one and hide the other.

If you need behaviour CSS cannot express, prefer adding a small optional flag
to `PCP.skin()` over branching in the engine.

## Adding a level

In `src/levels.js`, write a generator returning the shared shape and append it
to `LEVELS`. Build every value in cents. Use `hide(slots, allowed)` to pick
which value becomes the unknown — whatever you hide is the answer, so the
identity holds by construction and never has to be re-derived.

Then extend `tests/levels.test.js` with the identity for your level. The suite
checks every level against its own parity relation across 20,000 generated
problems each, plus the worked examples, and also asserts answers are positive
and land on the 0.05 grid.

## Build and test

```bash
node tests/levels.test.js     # must pass before any commit
./scripts/build-app.sh        # build + install to /Applications
./scripts/make-dmg.sh         # drag-to-install image in dist/
```

`build-app.sh` reads `APP_NAME`, `BUNDLE_ID` and `SIGN_ID` from the
environment. Leave `BUNDLE_ID` alone unless you mean to orphan existing
settings and run history — it is the key they are stored under.

### Releasing

`make-dmg.sh` produces the image attached to GitHub releases. Unsigned, it
trips Gatekeeper on a downloader's machine: `spctl -a` returns `rejected` and
the user has to right-click → Open once. The only fix is notarisation, which
needs an Apple Developer Program membership. With one, no script changes are
required:

```bash
xcrun notarytool store-credentials paritymac \
  --apple-id you@example.com --team-id TEAMID --password <app-specific-password>

SIGN_ID="Developer ID Application: Your Name (TEAMID)" \
NOTARY_PROFILE=paritymac ./scripts/make-dmg.sh
```

That signs with the hardened runtime, submits the image to Apple for malware
scanning and staples the ticket so it verifies offline. Update the README's
first-launch sentence once that ships.

There is no linter and no package.json. Plain `<script>` tags, not ES modules —
that keeps the custom-scheme loading simple.

Iterating on CSS is fastest over a local server:

```bash
cd src && python3 -m http.server 8731
```

Note that browsers cache `engine.js` aggressively; hard-reload after edits.

## Conventions

- Keep files under 500 lines.
- `var` and `function`, not `const`/arrow — the existing code is ES5-flavoured
  for consistency, not because anything requires it.
- Comments explain *why*, especially where a subtlety was hard-won. Do not
  narrate what the next line obviously does.
- Wrap every `localStorage` access in try/catch. It throws in private windows
  and returns null when storage is cleared.

# Paritymac

A put–call parity speed drill for macOS, in the spirit of [Zetamac](https://arithmetic.zetamac.com).

Seven levels, from clean-integer warm-ups to arb direction and box spreads.
Two skins. No network, no dependencies, no build step.

| `minimal` | `arcade` |
|---|---|
| ![minimal skin](docs/skin-minimal.png) | ![arcade skin](docs/skin-arcade.png) |

## Install

Requires macOS 12 or later and the Xcode command line tools
(`xcode-select --install`).

```bash
git clone https://github.com/TLXyloph/paritymac
cd paritymac
./scripts/build-app.sh
```

That compiles the Swift shell, bundles the drill and the fonts, renders the
icon, ad-hoc signs the bundle and installs `Paritymac.app` to `/Applications`.
Pass a path to install elsewhere:

```bash
./scripts/build-app.sh ~/Desktop
```

## The drill

Parity is `C + K·DF = P + S`. Each problem quotes all but one leg and asks for
the missing one, rotating which leg is hidden so position never predicts the
answer.

| # | level | relation |
|---|---|---|
| 1 | missing leg, clean integers | `C − P = S − K`, whole dollars |
| 2 | missing leg, ugly numbers | the same, carrying cents |
| 3 | forward, not spot | `C − P = F − K`, with `F` quoted or given as spot plus carry |
| 4 | rates, simple interest | `C − P = S − K + K·r·T` |
| 5 | dividends | `C − P = S − PV(div) − K` |
| 6 | arb direction | all four legs quoted off parity — name the edge and the trade |
| 7 | boxes | a `K1/K2` box is worth `K2 − K1` at zero rates — buy it or sell it |

Levels toggle independently; problems are drawn from whatever is enabled.
Level 1 is off by default, being a warm-up rather than a level.

Every value is generated in integer cents, so answers always land on a clean
0.05 increment and no problem depends on a rounding convention.

### Levels 6 and 7

These ask for two things: a magnitude and a direction. Type the edge, then
press the key naming the trade. The direction is genuinely binary — once you
know the sign of `(C−P) − (S−K·DF)` the trade is fully determined — so the
whole answer is a number and one keystroke.

A wrong key holds the problem rather than moving on. Across the whole drill,
advancing means exactly one thing: you were right.

## Keys

| key | |
|---|---|
| `1`–`7` | toggle levels |
| `⏎` | start, or run again |
| `esc` | back |
| `h` | history |
| `j` / `k` | name the trade, on levels 6 and 7 |

`submit` chooses between advancing the moment your typed answer matches, and
requiring `⏎`. Auto is faster and is what Zetamac does; `enter` costs a
keystroke per problem but removes any chance of a partially typed number
matching early.

## History

Every finished run is recorded: score, rate, duration, level set, best streak,
and per-level solved / missed / elapsed. The history screen shows recent runs
and your lifetime average time per level, which is the part that tells you
whether a level is actually getting faster.

Personal bests are scoped to the configuration — duration plus level set — so a
short round never outranks a long one.

Everything is stored locally in the app's own WebKit store. Nothing leaves the
machine.

## Skins

A skin is **one CSS file and one line of registration**. It styles a fixed DOM
rather than supplying its own, so a new skin cannot break the drill.

```js
// src/skins/myskin/skin.js
PCP.skin({ id: 'myskin', name: 'my skin', css: 'skins/myskin/skin.css' });
```

Copy `src/skins/minimal/skin.css` as a starting point, add one `<script>` line
to `src/index.html`, and it appears in the menu. The full slot contract — every
element the engine writes into, and what it puts there — is documented in
[AGENTS.md](AGENTS.md).

The two bundled skins are deliberate opposites. `minimal` is two text colours
and no motion at all, built to be read rather than looked at. `arcade` is a CRT
cabinet: scanlines, a draining block timer, a streak meter that shatters when
you break it, every animation stepped so it never betrays the pixel grid.

## Development

```bash
node tests/levels.test.js
```

The suite checks each level against its own parity relation across 20,000
generated problems, plus the seven worked examples, and asserts that answers
are positive, land on the 0.05 grid, and never quote an option below intrinsic
value. It needs nothing but `node`.

For fast CSS iteration, serve `src/` and open it in a browser:

```bash
cd src && python3 -m http.server 8731
```

The app itself is a `WKWebView` serving the bundle over a custom `pcp://`
scheme. That is deliberate: `file://` origins are opaque in WKWebView and will
not persist `localStorage`, which would silently discard settings and history
on every launch.

[AGENTS.md](AGENTS.md) is the guide for coding agents, and the fastest way for
a human to understand the architecture too.

## Fonts

The bundled faces are [Geist](https://vercel.com/font) — Sans, Mono and Pixel —
by Vercel, licensed under the SIL Open Font License 1.1. The OFL permits
redistribution but **requires the licence text to accompany the font files**.
If you fork and redistribute this repo, keep `OFL.txt` alongside
`src/fonts/`.

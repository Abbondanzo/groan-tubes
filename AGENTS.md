# AGENTS.md

Guidance for anyone (human or AI agent) changing this repo.

## What this is

Groan Tubes is a PWA that turns a phone into a groan tube: tilting it slides a virtual
weight along the phone's long axis, and a physical model synthesizes the groan in real
time. It's Vite + TypeScript with no framework, deployed to GitHub Pages.

| Path | What's there |
| --- | --- |
| `src/main.ts` | UI, motion permission and sensor handling, main loop, audio lifecycle |
| `src/physics.ts` | The sliding weight (stiction, terminal speed, end-cap impacts) |
| `src/audio.ts` | Presets and the voice that drives the model from the weight |
| `src/groan-processor.js` | AudioWorklet: reed wavetable into a waveguide tube |
| `src/style.css` | Layout and the per-sound tube skins (`body[data-skin=…]`) |
| `public/` | Manifest, service worker, icons, `.nojekyll` |
| `.github/workflows/` | Production deploy, PR previews, commit checks |

## Commands

```sh
pnpm install
pnpm dev     # http://localhost:5173
pnpm build   # typecheck (tsc --noEmit) + build to dist/; run before every push
```

Motion sensors need HTTPS or `localhost`. Use a PR preview to test on a phone.

## Workflow: branches, PRs and previews

1. **Never push to `main`.** Branch from it as `<type>/<short-kebab-description>`, using
   a Conventional Commit type, e.g. `feat/cow-skin` or `fix/ios-motion-prompt`.
2. Commit with Conventional Commits (below).
3. Open a PR into `main` with a Conventional Commit title.
4. **Preview:** `preview.yml` builds the branch and publishes it to
   `https://abbondanzo.github.io/groan-tubes/pr-preview/pr-<number>/`, then posts the
   link as a PR comment. It updates on every push and is deleted when the PR closes.
   Fork PRs get no preview.
5. **Merge with "Squash and merge".** The PR title becomes the commit on `main`.
6. **Production:** `deploy.yml` builds `main` and publishes it to the root of the
   `gh-pages` branch, which GitHub Pages serves from
   `https://abbondanzo.github.io/groan-tubes/`.

The `gh-pages` branch is generated. Don't edit it by hand. Production deploys must keep
`clean-exclude: pr-preview` and `force: false`, or they will wipe live previews.

## Conventional Commits

Format: `<type>(<optional scope>): <summary>`, plus an optional body and trailers.

- **Types:** `feat`, `fix`, `perf`, `refactor`, `style`, `docs`, `test`, `build`, `ci`,
  `chore`, `revert`.
- **Scopes (optional):** `audio`, `physics`, `ui`, `pwa`, `ci`, `deps`, `docs`.
- **Summary:** imperative mood, lower case, no trailing period, about 72 characters max.
- **Body:** explain *why*, wrapped at 100 characters max.
- **Breaking changes:** `feat!: …` or a `BREAKING CHANGE:` trailer.

Examples:

```
feat(audio): add a moo preset
fix(pwa): stop audio when the page is hidden
ci: deploy PR previews to gh-pages
docs: document the release workflow
```

`conventional-commits.yml` checks every PR title and every commit on the branch, using
`commitlint.config.mjs`. Keep the scope list in that file and the PR-title check in step
with each other.

## Things that are easy to break

- **iOS motion permission.** `DeviceOrientationEvent.requestPermission()` must be called
  synchronously in the tap handler, before any `await`, or iOS rejects it without showing
  the prompt.
- **iOS audio unlock.** Create the `AudioContext` and call `resume()` inside that same
  tap.
- **Audio when hidden.** On `visibilitychange` (hidden), `pagehide` and `freeze`, the
  app fully tears audio down: gain to 0, disconnect, close the context. Suspending only
  froze the voice at full volume. Coming back requires a tap.
- **Off-rate audio clocks.** Some iPhones play a context slower than its `sampleRate`
  says, which drops the pitch. `measureClock()` compares the audio clock with the wall
  clock and corrects it through the worklet's `rate` param. Keep that in place.
- **Worklet URL.** The worklet is imported with `?url`, so its filename is hashed. Don't
  move it to `public/`: a stale cached worklet would pair with newer main-thread code.
- **Service worker.** Production and previews share an origin. Each worker uses a cache
  named after its own scope, and the production worker ignores `pr-preview/`. Bump
  `VERSION` in `public/sw.js` when the caching logic changes.
- **Relative base.** `base: "./"` in `vite.config.ts` lets the same build work at the
  root and in any preview subfolder. Keep asset and manifest paths relative.
- **The sound is tuned to real recordings.** The reed holds a nearly steady pitch, and
  the groan is the tube's resonances sliding as the air column changes length. The first
  flip shrinks the column and the return flip grows it. To change the sound, render it
  offline (`OfflineAudioContext` + `GroanVoice.create`) and compare spectrograms with a
  real recording rather than tuning by ear.

## Before opening a PR

- `pnpm build` passes.
- On the preview, on an actual phone if the change touches sensors, audio or the PWA:
  tap to start, flip both ways for each sound, background the app mid-groan (it must go
  silent) and come back.

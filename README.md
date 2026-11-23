# Groan Tubes

Your phone is the groan tube. Turn it over, and a virtual weight slides down the
"tube" and pushes air through a reed: *grooooaaan*.

**Live:** https://abbondanzo.github.io/groan-tubes/ — open it on your phone, then
use **Add to Home Screen** to install it.

## How it works

- **Tilt.** `deviceorientation` gives the phone's front-to-back rotation (beta).
  `sin(beta)` is the part of gravity along the phone's long axis: +1 upright, −1
  upside down, 0 lying flat. Side-to-side roll doesn't matter.
- **Physics** (`src/physics.ts`). A weight with a little static friction that eases
  toward a terminal speed (air drag in the tube), stopping with a thunk at each end
  cap.
- **Sound** (`src/audio.ts`). Synthesized live with Web Audio, no samples: a buzzy
  reed waveform through two vowel formant filters that close from "aah" to "ooh"
  while the pitch drops over the fall. Volume follows how fast the weight is
  moving, and a fast growl flutter gives it the rattly reed sound.
- **Sounds.** *Groan* (both directions), *Moo* (one way only, like a moo can) and
  *Ghost*.
- **PWA.** Manifest, offline service worker, portrait lock, screen wake lock while
  open.

No motion sensor (desktop)? Drag to tilt the tube, or press **Flip** / Space / ← →.

### iPhone notes

- iOS asks for motion access when you tap **Tap to start**. If you tapped Don't
  Allow, close Safari's tab, or delete and re-add the home-screen app, to get the
  prompt again.
- The app tries to play even with the ringer switch on silent (`navigator.audioSession`).
  On older iOS versions, flip the switch off silent.
- Turn on rotation lock in a Safari tab so the page doesn't spin while you flip.

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:5173 (use --host URL + HTTPS for sensors on a phone)
pnpm build      # outputs dist/
```

Motion sensors only work over HTTPS (or `localhost`).

## Deploy

Every push to `main` builds and deploys to GitHub Pages through
`.github/workflows/deploy.yml`. The build uses a relative base path, so `dist/`
also works as-is on Cloudflare Pages or any other static host.

## License

MIT

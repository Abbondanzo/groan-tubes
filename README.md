# Groan Tubes

Your phone is the groan tube. Turn it over, and a virtual weight slides down the
"tube" and pushes air through a reed: *grooooaaan*.

**Live:** https://abbondanzo.github.io/groan-tubes/ — open it on your phone, then
use **Add to Home Screen** to install it.

## How it works

- **Tilt.** `deviceorientation` gives the phone's front-to-back rotation (beta).
  `sin(beta)` is the part of gravity along the phone's long axis: +1 upright, −1
  upside down, 0 lying flat. Side-to-side roll doesn't matter.
- **Physics** (`src/physics.ts`). A weight with a little static friction that quickly
  reaches a terminal speed (air drag in the tube). A full fall takes about 0.9 s, like a
  real 40 cm tube, and ends with a knock against the end cap.
- **Sound** (`src/groan-processor.js`, `src/audio.ts`). A small physical model,
  tuned against recordings of real groan tubes. The reed holds a nearly steady, bright
  pitch (~320 Hz). The groan comes from the tube: a waveguide whose resonances slide
  across the reed's harmonics as the weight moves and the air column changes length.
- **Direction matters.** On the first flip from upright the column ahead of the
  weight shrinks, so the resonances climb and the pitch drifts up. Flipping back,
  the column grows, so the resonances fall, the pitch sags and the sound is a little
  quieter: the same asymmetry a real tube has.
- **Sounds.** *Groan* (a standard 40 cm tube), *Big tube* (longer and lower) and
  *Moo* (sounds on the first flip only, like a moo can).
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

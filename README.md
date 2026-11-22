# portfolio-lab

Showcase sites, one per folder under `sites/`. Each is a standalone Vite + TypeScript project (npm workspaces).

| Site | Concept | Status |
| --- | --- | --- |
| `sites/rakhsh` | RAKHSH, a fictional electric motorcycle | Code complete; waiting for generated media |

## Commands

```bash
npm install                                  # once, at the repo root
npm run dev -w rakhsh                        # dev server on :5173 (empty media slots are labelled)
npm run build -w rakhsh                      # type-check + production build into sites/rakhsh/dist
npm run preview -w rakhsh                    # serve the build on :4173
node tools/process-rakhsh.mjs                # convert assets-inbox/rakhsh → sites/rakhsh/public/media + manifest.json
node tools/shoot.mjs http://localhost:4173/ tools/out/<run> [--browser=msedge] [--only=desktop|mobile] [--sections=…]
```

`shoot.mjs` drives real Chromium (or Edge with `--browser=msedge`, needed to play H.264 video), screenshots every
section on desktop (1440×900) and mobile (390×844), and reports console errors, failed requests, video playback state
and horizontal overflow in `report.json`.

## Media workflow (RAKHSH)

1. Put the generated files in `assets-inbox/rakhsh/` (git-ignored). Names are matched by prefix, any extension:
   `a-hero` (image), `b-orbit` (video), `c-reveal` (video), `e-ride` (video), `f-ember` / `f-ash` / `f-bone` / `f-olive` (images),
   `d-1` … `d-4` (images), `g-legend` (image and/or video).
2. Run `node tools/process-rakhsh.mjs`. It writes WebP stills, H.264 MP4s (desktop and mobile sizes), 96 orbit frames
   for the scroll-scrubbed machine section, seamless (cross-faded) loops for the ride and legend films, an OG image,
   and `public/media/manifest.json`. `a-hero` doubles as the Graphite finish.
3. Rebuild. Every section reads the manifest at runtime and falls back to a designed state for anything missing, so
   the site works with any subset of assets.

## RAKHSH architecture

- `src/main.ts` boots modules in page order (pinned sections must measure in order), then runs the entry gate.
- `src/lib/sound.ts` synthesises all audio with Web Audio (no audio files): UI ticks, lightning crack, printer,
  ambient room tone, and an electric-motor whine that tracks speed. Audio starts only after "Enter with sound".
- `src/lib/finish.ts` is the shared finish selection; it retints the site (`--accent`) and syncs the configurator
  with the reservation form.
- `src/modules/*` — one module per section: gate, hero, legend, machine (frame scrubbing on canvas), ignite
  (hold-to-accelerate gauge with procedural lightning; 0→100 km/h is tuned to 2.9 s), details, specs, ride
  (scroll velocity drives the HUD), config (lightning-edge wipe), reserve (printable build ticket, PNG download).
- Smooth scrolling is Lenis on GSAP's ticker; scroll-linked motion uses ScrollTrigger.

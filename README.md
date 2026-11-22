# portfolio-lab

Showcase sites, one per folder under `sites/`. Each is a standalone Vite + TypeScript project (npm workspaces).
Plumbing they share lives in `packages/kit`.

| Site | Concept | Status |
| --- | --- | --- |
| `sites/rakhsh` | RAKHSH, a fictional electric motorcycle (cinematic, generated media) | Live at rakhsh.zerodycoder.com |
| `sites/nibbo` | NIBBO, a fictional coding robot for kids (live 3D, everything drawn by code) | Code complete |

## Commands

```bash
npm install                                  # once, at the repo root
npm run dev -w nibbo                         # dev server (rakhsh :5173, nibbo :5175)
npm run build -w nibbo                       # type-check + production build into sites/nibbo/dist
npm run preview -w nibbo                     # serve the build (rakhsh :4173, nibbo :4175)
node tools/process-rakhsh.mjs                # convert assets-inbox/rakhsh → sites/rakhsh/public/media + manifest.json
node tools/og-nibbo.mjs                      # render NIBBO's 1200×630 social image from the live page (preview running)
node tools/shoot.mjs <url> tools/out/<run> --site=nibbo [--browser=msedge] [--sound] [--only=desktop|mobile] [--sections=…]
```

`shoot.mjs` drives a real browser (Edge with `--browser=msedge`, needed to play H.264 video), screenshots every
section on desktop (1440×900) and mobile (390×844), and writes `report.json`: console errors, failed requests, video
playback, the audio engine state (`--sound` enters with sound), horizontal overflow, and whatever the site's probe
returns. Each site has a scenario in `tools/scenarios/<site>.mjs` with its default sections, its actions and its
probe. A section is written `id[@fraction][:action][~seconds]`: the fraction is through a pinned section's scroll (or
through the section's height), the action is defined by the scenario (NIBBO's include `toss`, which drags the robot
with real touch events on mobile, `dizzy`, `xray`, `solve` and `loop`), and `~6` waits six extra seconds.

## packages/kit

Shared by every site, imported as `@portfolio-lab/kit/<module>` (TypeScript source, compiled by each site's Vite).

- `audio.ts`: the Web Audio core. Master gain into a gentle compressor, a fade-in when sound starts (phones are often
  at full volume), the iOS fix that moves the page onto the media channel so the ring/silent switch doesn't mute it,
  wake-on-return, and the synthesis primitives (`tone`, `noiseHit`, `envelope`). Sites extend `AudioEngine`.
- `gate.ts`: the entry gate's logic: real preload progress from a list of tasks (never faster than `minMs`, never
  stuck past `maxMs`), then the sound choice. The site draws the progress and plays its own exit.
- `smooth.ts`: Lenis on GSAP's ticker, anchor links, and the `window.__lenis` / `window.__st` hooks `shoot.mjs` uses.
- `stack.ts`: the "Built with" badges. Simple Icons logos in brand colour (marks that would vanish on the page's
  background switch to its ink), Playwright's official SVG, a waveform for Web Audio, a colour dot for Lenis.
- `dom.ts`: small DOM helpers.

## NIBBO architecture

No model files, no images, no audio files: the robot, its face, the game board, the shipping box and every sound are
generated in code.

- **One canvas, one robot.** `src/three/stage.ts` is a single fixed, transparent WebGL canvas between two content
  layers (`.behind` under the robot, `.front` over it), so phones hold one WebGL context. Pinned and fixed elements
  form their own stacking context, so the pinned section sets its own `z-index` above the canvas.
- **The director** (`src/three/director.ts`) walks the robot through the page. Every section has an empty HTML
  "slot" box; the robot stands on the box's bottom edge at the box's height. A slot owns the robot while the
  viewport centre is inside its section (minus a margin); between sections the robot flies from one slot to the next
  on an arc, leaning into the motion. Slots can compute their own pose: the game board and the adoption box do.
- **The robot** (`src/three/robot.ts`) is built from rounded boxes, tori, capsules and spheres, with four transform
  layers (placement, physics, emotes, parts). It has an exploded view (each part flies out in its own time window),
  an X-ray wireframe mode, accessories and live recolouring.
- **The face** (`src/three/face.ts`) is a 40 × 20 LED matrix. Expressions are parametric eye shapes (lids, cheeks,
  hearts, spirals, stars) drawn into a supersampled mask; every LED takes its cell's brightness, so blinks and gaze
  animate smoothly but always read as dots. It also scrolls text (the name being typed). The same engine draws the
  gate's visor and the mood buttons' mini faces.
- **Behaviour** (`src/three/brain.ts`): gaze follows the mouse or the phone's tilt (eyes lead, the head follows);
  it blinks, gets sleepy after 26 s idle and dozes off at 34 s; fast mouse circles or phone shakes make it dizzy; pokes
  get a different reaction each time (and five in a row make it grumpy); it can be picked up, dangles, and is tossed
  with a small hand-written physics loop; the antenna rides a spring driven by the head's acceleration.
- **The game** (`src/game/engine.ts`, `levels.ts`, `src/modules/play.ts`, `src/three/board.ts`): an interpreter
  runs the visitor's block program (with Repeat) to completion and returns events (move, turn, jump, bonk, edge,
  spark, locked, home, out), which are then played back on a 3D board built per level. Stars are by block count
  against par; progress is kept in `localStorage`.
- **Adoption** (`src/modules/adopt.ts`, `src/three/box.ts`): typing a name scrolls it across the face and Nibbo says
  it in robot; adopting packs the robot into a box with hinged flaps, tape and a printed label. `src/lib/bot.ts`
  round-trips the configured robot through `?bot=shell.led.accessory.name`, so the share link opens the site with
  that robot (gate, hero and price included).
- **Sound** (`src/lib/sound.ts`): a babbling voice (gliding oscillators through vowel formants) that can "say" any
  typed word, plus servos, wheels, bumps, sparks, a jingle, cardboard and tape. All soft.

## RAKHSH

### Media workflow

1. Put the generated files in `assets-inbox/rakhsh/` (git-ignored). Names are matched by prefix, any extension:
   `a-hero` (image), `b-orbit` (video), `c-reveal` (video), `e-ride` (video), `f-ember` / `f-ash` / `f-bone` / `f-olive` (images),
   `d-1` … `d-4` (images), `g-legend` (image and/or video).
2. Run `node tools/process-rakhsh.mjs`. It writes WebP stills, H.264 MP4s (desktop and mobile sizes), 96 orbit frames
   for the scroll-scrubbed machine section, seamless (cross-faded) loops for the ride and legend films, an OG image,
   and `public/media/manifest.json`. `a-hero` doubles as the Graphite finish.
3. Rebuild. Every section reads the manifest at runtime and falls back to a designed state for anything missing, so
   the site works with any subset of assets.

### Architecture

- `src/main.ts` boots modules in page order (pinned sections must measure in order), then runs the entry gate.
- The entry gate (kit `gate.ts`) ends in an "ignition": the light bar flares and the screen flashes.
- `src/lib/sound.ts` extends the kit's audio engine: UI ticks, lightning crack, printer, ambient room tone, and an
  electric-motor whine that tracks speed, with a soft power-up (peaks around -17 dBFS) on entry.
- Hero: the whole bike stands on the horizon beam between the copy and the wordmark on every screen (on phones
  the frame may overhang the edges slightly, and a larger three-line tagline fills the space above).
  Mouse parallax on desktop, device-tilt parallax on phones (iOS permission is requested on the entry tap).
- `src/lib/finish.ts` is the shared finish selection; it retints the site (`--accent`) and syncs the configurator
  with the reservation form.
- `src/modules/*` — one module per section: gate, hero, legend, machine (frame scrubbing on canvas), ignite
  (hold-to-accelerate gauge with procedural lightning; 0→100 km/h is tuned to 2.9 s), details (scroll-driven
  horizontal carousel on every screen size), specs, ride
  (scroll velocity drives the HUD), config (lightning-edge wipe), reserve (printable build ticket, PNG download).
- Smooth scrolling is Lenis on GSAP's ticker; scroll-linked motion uses ScrollTrigger.

# portfolio-lab

Showcase sites designed and built with Claude Code, one per folder under `sites/`. Each is a standalone Vite +
TypeScript project (npm workspaces). Plumbing they share lives in `packages/kit`.

| Site | Concept | Status |
| --- | --- | --- |
| `sites/rakhsh` | RAKHSH, a fictional electric motorcycle (cinematic, generated media) | Live at [rakhsh.zerodycoder.com](https://rakhsh.zerodycoder.com) |
| `sites/nibbo` | NIBBO, a fictional coding robot for kids (live 3D, everything drawn by code) | Live at [nibbo.zerodycoder.com](https://nibbo.zerodycoder.com) |

## Commands

```bash
npm install                                  # once, at the repo root
npm run dev -w nibbo                         # dev server (rakhsh :5173, nibbo :5175)
npm run build -w nibbo                       # type-check + production build into sites/nibbo/dist
npm run preview -w nibbo                     # serve the build (rakhsh :4173, nibbo :4175)
node tools/process-rakhsh.mjs                # convert assets-inbox/rakhsh → sites/rakhsh/public/media + manifest.json
node tools/og-nibbo.mjs                      # render NIBBO's 1200×630 social image from the live page (preview running)
node tools/shoot.mjs <url> tools/out/<run> --site=nibbo [--browser=msedge] [--sound] [--only=desktop|mobile] [--sections=…] [--resolve=host:ip]
```

`shoot.mjs` drives a real browser (Edge with `--browser=msedge`, needed to play H.264 video), screenshots every
section on desktop (1440×900) and mobile (390×844), and writes `report.json`: console errors, failed requests, video
playback, the audio engine state (`--sound` enters with sound), horizontal overflow, and whatever the site's probe
returns. Each site has a scenario in `tools/scenarios/<site>.mjs` with its default sections, its actions and its
probe. A section is written `id[@fraction][^edge][:action][~seconds]`:

- `@0.4` is a point through a pinned section's scroll (or through the section's height);
- `^0.5` parks the section's top half a screen down, the hand-over between two sections (where layouts collide);
- `:action` runs one of the scenario's actions. NIBBO's drive the real thing: `toss` and `longpress` pick the robot
  up (with real touch events on mobile, and check the page didn't scroll), `dizzy`, `poke`, `tricks`, `xray`,
  `mood`, `solve` and `loop` (build and run programs), `custom`, `name` and `pack`;
- `~6` waits six extra seconds before the screenshot.

`--resolve=host:ip` pins a hostname for the browser, to test a new subdomain before local DNS caches catch up.

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

No model files, no textures, no audio files: the robot, its face, the game board, the shipping box and every sound
are generated in code. The only image is the social preview, and that is a screenshot of the page itself
(`tools/og-nibbo.mjs`).

- **Sections:** entry gate, hero, chat, inside (anatomy tour), feelings, play (the game), make yours
  (configurator), specs, adopt, and a night-time footer.
- **Entry gate** (`src/modules/gate.ts`): Nibbo sleeps on a charging battery while fonts load and every shader
  compiles (real progress, with a little boot log); on "Wake Nibbo up" its LED visor flies out of the gate and lands
  exactly on the 3D robot's face, where the wake-up animation takes over.

- **One canvas, one robot.** `src/three/stage.ts` is a single fixed, transparent WebGL canvas between two content
  layers (`.behind` under the robot, `.front` over it), so phones hold one WebGL context. Pinned and fixed elements
  form their own stacking context, so the pinned section sets its own `z-index` above the canvas.
- **The director** (`src/three/director.ts`) walks the robot through the page. Every section has an empty HTML
  "slot" box; the robot stands on the box's bottom edge at the box's height. A slot owns the robot while the
  viewport centre is inside its section (minus a margin); between sections the robot flies from one slot to the next
  on an arc, leaning into the motion. On phones, where everything is one column, it instead slips out to the right
  edge (small, peeking in) and hops into the next slot, so it never crosses the text. Slots can compute their own
  pose: the game board and the adoption box do.
- **The robot** (`src/three/robot.ts`) is built from rounded boxes, tori, capsules, spheres and extruded gears, with
  four transform layers (placement, physics, emotes, parts). Inside the shell are real-looking internals that only
  show when it comes apart: servos, gear motors, a printed circuit board with status LEDs, the motion sensor, a
  copper touch pad, a battery with a charge gauge and a speaker with a grille. Parts can be focused (they swell and
  glow) and run little demos. Also: an X-ray wireframe mode, accessories and live recolouring.
- **Inside** (`src/modules/inside.ts`) is a pinned guided tour of ten parts. Scrolling takes Nibbo apart, then turns
  each part to the viewer, demonstrates it (the speaker talks, the arm waves, the wheels spin and the cliff sensors
  blink) and explains it on a card with spec chips; labels ride on the projected 3D anchors. X-ray turns the section
  into a blueprint (fixed behind the canvas) with live dimension lines, in millimetres, around the current part.
- **Discovering things** (`src/modules/tricks.ts`, `coach.ts`, `speech.ts`): a "Tricks" counter in the nav opens a
  checklist of the 13 things Nibbo can do, worded for mouse or touch; each one is ticked off (and saved) when the
  visitor does it. A speech bubble rides next to Nibbo's head, projected from 3D; after a few quiet seconds in a
  section Nibbo suggests a trick that hasn't been found yet (one hint per visit), and it answers when one is found.
- **Touch parity** (`src/modules/controls.ts`): on phones the eyes follow the finger, glance at whatever was tapped
  and look the way the page scrolls; a touch on the robot in the hero picks it up, anywhere else a still long press
  does (a swipe across it still scrolls); a hard shake makes it dizzy.
- **The face** (`src/three/face.ts`) is a 40 × 20 LED matrix. Expressions are parametric eye shapes (lids, cheeks,
  hearts, spirals, stars) drawn into a supersampled mask; every LED takes its cell's brightness, so blinks and gaze
  animate smoothly but always read as dots. It also scrolls text (the name being typed). The same engine draws the
  gate's visor, the mood buttons' mini faces and the chat avatars.
- **Behaviour** (`src/three/brain.ts`): gaze follows the mouse or the phone's tilt (eyes lead, the head follows);
  it blinks, gets sleepy after 26 s idle and dozes off at 34 s; fast mouse circles or phone shakes make it dizzy; pokes
  get a different reaction each time (and five in a row make it grumpy); it can be picked up, dangles, and is tossed
  with a small hand-written physics loop; the antenna rides a spring driven by the head's acceleration.
- **The game** (`src/game/engine.ts`, `levels.ts`, `src/modules/play.ts`, `src/three/board.ts`): five levels that
  each add one idea (forward, turns, sparks, loops, jumps). An interpreter runs the visitor's block program (with
  Repeat) to completion and returns events (move, turn, jump, bonk, edge,
  spark, locked, home, out), which are then played back on a 3D board built per level. Stars are by block count
  against par; progress is kept in `localStorage`.
- **Adoption** (`src/modules/adopt.ts`, `src/three/box.ts`): typing a name scrolls it across the face and Nibbo says
  it in robot; adopting packs the robot into a box with hinged flaps, tape and a printed label. `src/lib/bot.ts`
  round-trips the configured robot through `?bot=shell.led.accessory.name`, so the share link opens the site with
  that robot (gate, hero and price included).
- **Sound** (`src/lib/sound.ts`): a babbling voice (gliding oscillators through vowel formants) that can "say" any
  typed word, plus servos, bumps, sparks, a jingle, cardboard, tape and wooden blocks. A move on the game board is a
  soft whirr under a sung note that climbs a pentatonic scale, so a program plays as a little tune. All soft.
- **Fuller pages**: floating wooden letter blocks in the hero (parallax against the pointer or tilt, and they jump
  when clicked), a spinning "made entirely of code" stamp, a turntable and "Surprise me" in the configurator, a
  "what happens next" timeline in adoption, and a footer where the lights go out and stars come up.

## Deploying

Each site is its own Vercel project with its root directory set to `sites/<name>`; Vercel installs the workspace
from the repo root, so `packages/kit` is linked in. Every push to `main` deploys both sites. Each site has a subdomain
of zerodycoder.com, pointed at Vercel with a CNAME record.

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

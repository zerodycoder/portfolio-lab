# portfolio-lab

Showcase sites designed and built with Claude Code, one per folder under `sites/`. Each is a standalone Vite +
TypeScript project (npm workspaces). Plumbing they share lives in `packages/kit`.

| Site | Concept | Status |
| --- | --- | --- |
| `sites/rakhsh` | RAKHSH, a fictional electric motorcycle (cinematic, generated media) | Live at [rakhsh.zerodycoder.com](https://rakhsh.zerodycoder.com) |
| `sites/nibbo` | NIBBO, a fictional coding robot for kids (live 3D, everything drawn by code) | Live at [nibbo.zerodycoder.com](https://nibbo.zerodycoder.com) |
| `sites/sayeh` | SAYEH, a fictional shade-grown coffee roaster and café (multi-page, fluid simulation over photos) | Live at [sayeh.zerodycoder.com](https://sayeh.zerodycoder.com) |
| `sites/novanta` | NOVANTA, a fictional Neapolitan pizzeria you walk into and bake in (a 3D place, not a page) | Live at [novanta.zerodycoder.com](https://novanta.zerodycoder.com) |

## Commands

```bash
npm install                                  # once, at the repo root
npm run dev -w nibbo                         # dev server (rakhsh :5173, nibbo :5175, sayeh :5176, novanta :5177)
npm run build -w nibbo                       # type-check + production build into sites/nibbo/dist
npm run preview -w nibbo                     # serve the build (rakhsh :4173, nibbo :4175, sayeh :4176, novanta :4177)
node tools/process-rakhsh.mjs                # convert assets-inbox/rakhsh → sites/rakhsh/public/media + manifest.json
node tools/process-sayeh.mjs                 # same for assets-inbox/sayeh → sites/sayeh/public/media (measures the cup photo)
node tools/process-novanta.mjs               # assets-inbox/novanta → cut-out toppings, photos and textures for NOVANTA
node tools/fetch-novanta-pbr.mjs             # download NOVANTA's scanned materials and HDRI (Poly Haven, CC0) as WebP
node tools/og-nibbo.mjs                      # render NIBBO's 1200×630 social image from the live page (preview running)
node tools/og-sayeh.mjs                      # render SAYEH's social image: a rosetta poured on the live page
node tools/og-novanta.mjs                    # render NOVANTA's social image: the street at night, shutter down
node tools/look-novanta.mjs <out> <place> [--mobile] [--script=f.js]   # screenshot one NOVANTA place (dev server running)
node tools/shoot.mjs <url> tools/out/<run> --site=nibbo [--browser=msedge] [--sound] [--only=desktop|mobile] [--sections=…] [--resolve=host:ip]
```

`shoot.mjs` drives a real browser (Edge with `--browser=msedge`, needed to play H.264 video), screenshots every
section on desktop (1440×900) and mobile (390×844), and writes `report.json`: console errors, failed requests, video
playback, the audio engine state (`--sound` enters with sound), horizontal overflow, and whatever the site's probe
returns. RAKHSH, NIBBO and SAYEH each have a scenario in `tools/scenarios/<site>.mjs` with their default sections,
actions and probe. NOVANTA is a 3D place rather than a page of sections, so it has `tools/look-novanta.mjs`
instead: it opens one place (`strada`, `sala`, `banco`, `forno`, …), can run a script against the
`window.__novanta` hooks first, and takes the screenshot. A section is written `id[@fraction][^edge][:action][~seconds]`, and a spec that starts with `/` navigates a
multi-page site to that path (through its router, `window.__go`) before the sections that follow:

- `@0.4` is a point through a pinned section's scroll (or through the section's height);
- `^0.5` parks the section's top half a screen down, the hand-over between two sections (where layouts collide);
- `:action` runs one of the scenario's actions. NIBBO's drive the real thing: `toss` and `longpress` pick the robot
  up (with real touch events on mobile, and check the page didn't scroll), `dizzy`, `poke`, `tricks`, `xray`,
  `mood`, `solve` and `loop` (build and run programs), `custom`, `name` and `pack`. SAYEH's pour and etch on the
  cup, `swirl` it (two-finger twist with real touch events on phones, circles on the saucer with a mouse), check
  that a `swipe` beside the cup still scrolls, set the hour (`day`, `golden`, `night`), `add` to the bag, place an
  `order` (empty first, so the errors show), `dial` the Brew Lab, start the `timer`, fly to a `farm` and pick a `note`;
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

## SAYEH architecture

A fictional roaster and café in Lisbon ("sayeh" is Persian for shade: every coffee is shade-grown). Generated
photographs and films (the user's), with code doing everything that moves.

- **Pages, not sections.** The first multi-page showcase: a small History-API router (`src/lib/router.ts`) with
  code-split pages (`src/pages/*`, prefetched on hover), real URLs (`/shop/hambela-shade`, `/origins?farm=kenya`),
  scroll restored on Back, and every navigation run through the View Transitions API: pages cross-fade and a coffee
  bag morphs from the shop grid into its product page (shared `view-transition-name`). `vercel.json` rewrites deep
  links to the app. Sound, cart, stamps and the latte all survive navigation.
- **The cup** (`src/fluid`, `src/ui/cup.ts`): a WebGL2 stable-fluids solver on half-float textures (advection,
  pressure projection, circular walls). Pouring is a mass source in the divergence, so milk really spreads; a moving
  stream carries momentum, the pull-through drags a cleft and a point, an etching pen draws crema lines, and every new
  layer (each pour, and each swing of a wiggle, by hand too) is tagged so a hairline of crema shows where layers meet:
  a rosetta's leaves, a tulip's stack. Milk that dives under turns the crema caramel as the cup fills, a darker ring
  stays by the rim, and crema pushed against the foam outlines every shape. The canvas sits exactly on the photo's
  liquid (`tools/process-sayeh.mjs` finds the crema circle by colour and fits it), and the photo's own crema is the
  simulation's surface: its texture coordinates are advected with the flow. Swirl by circling the saucer (mouse), a
  two-finger twist or tilting the phone. Finished pours are read back from the GPU (64²) and judged for symmetry
  (best mirror axis, drawn on the cup), contrast and coverage.
- **The home page tells the story with the footage**: the shade (hands and cherries), the four farms (photo tiles),
  the roast (the film behind a scroll-driven roast curve), the shot (the espresso film with a live shot clock, scale
  and ratio laid over it, `src/ui/shot.ts`), the coffees, and the café, whose evening photo fades in with the light.
- **Brew Lab** (`src/lab/model.ts`, `src/pages/lab.ts`): first-order extraction kinetics where grind and temperature
  set the rate and, for pour-over and espresso, the grind also sets the contact time. Outputs extraction yield and
  TDS on the barista's brewing control chart, a taste radar, advice, and a brew-along timer with chimes. Water
  temperature drives Fraunces' weight and SOFT axes.
- **Labels drawn from data** (`src/art/label.ts`): each bag is rendered on canvas; its art is the farm's terrain as
  marching-squares contour lines (more for higher farms), coloured through the tasting notes, with harvest months
  and roast level.
- **Origins** (`src/map`): a dot-matrix world (Equal Earth, D3-geo, Natural Earth 110m land) with the coffee belt, the
  farms and great-circle routes to Lisbon; picking a farm glides the projection there. A flavour wheel (families and
  notes) lists the coffees that carry a note.
- **Commerce** (`src/lib/cart.ts`): sizes, grinds, subscriptions (−12%), free-shipping meter, roast and delivery
  dates from the roast days, and a checkout with validation but no payment fields (it is a demo).
- **Light from the visitor's clock** (`src/lib/daylight.ts`): a simple solar model turns the local hour and date into
  sun height and direction; that sets the palette (light, golden, night), the leaf shadows' angle and length, the
  light on the cup and the café photo (the night photo fades in). The sun dial previews any hour.
- **Discovering things** (`src/lib/stamps.ts`, `src/ui/coach.ts`): a loyalty card with ten stamps; a full card takes
  15% off the bag. Hints suggest the next thing after a quiet moment.
- **Sound** (`src/lib/sound.ts`): milk pouring with bubbles, an etching whisper, a slosh, porcelain clinks, a rubber
  stamp, paper, a bag of beans, first-crack pops, a timer bell. Measured peaks sit between −22 and −37 dBFS.

### Media workflow

Put the files in `assets-inbox/sayeh/` (git-ignored; matched by prefix, any extension): `a-cup` (top-down cup,
plain crema), `b-roast` (video), `c-ethiopia`, `c-colombia`, `c-kenya`, `c-guatemala`, `d-hands`, `e-espresso`
(video; the delivered file's first 10 s duplicate the roast clip, so only 10–20 s is used), `f-cafe-day` and
`f-cafe-night` (aligned). Run `node tools/process-sayeh.mjs`: WebP stills, H.264 (desktop and mobile), a seamless
roast loop, the cup's crema crop for the simulation and `manifest.json` with the measured liquid circle. Anything
missing falls back to a drawn version (the table and cup, the bean drum, cherries).

## NOVANTA architecture

A fictional Neapolitan pizzeria, dal 1958. Not a scrolling page: a three.js place the visitor walks through, from
the street into the dining room and the kitchen, and out on a delivery.

- **The street** (`src/world/facade.ts`, `buildings.ts`, `street.ts`): the shopfront at night behind a roller
  shutter the visitor drags up. Dressed windows on two floors (stone surrounds, sills, persiane, a room behind each:
  lace, lamplight, a television, light through closed slats) merged into a few draw calls; weathered plaster
  (damp, streaks, fallen patches showing the tuff) drawn on a canvas skin; neighbouring houses carrying the street
  on both ways; a vintage scooter, geraniums and ivy as instanced leaves, a lemon tree, a shrine with flickering
  candles, posters, the shop's number 90 on a majolica tile.
- **The room** (`src/world/room.ts`, `props.ts`, `details.ts`, `oven.ts`): photo-scanned PBR materials (`pbr.ts`)
  and an HDR environment, glazed tiles with relief and a clear coat, a wood-fired oven with a mosaic dome. Corners
  are hotspots (the menu, the family's photos, the dough, the oven, the radio); drag to look around, and phones get
  a dock of corners.
- **The kitchen** (`src/app/kitchen.ts`, `src/pizza`): press and stretch a soft-body dough ball, paint the sauce,
  drop toppings that fall and settle with Rapier physics, slide the pizza in with the peel, turn it and fan the fire
  while a bake shader browns it (the fire is on one side, so an unturned pizza burns there), then cut it and add the
  finishing touches.
- **Delivery** (`src/app/delivery.ts`): name the box, send it, and follow a 16-second ride across a drawn map of
  Naples; the tab's title and favicon count down, the ride survives a reload, and the same pizza arrives at the door.
- **The menu** (`src/pizza/catalog.ts`): the classics, each with its story; "Bake it" makes one by itself (dough,
  sauce, toppings) and hands over at the oven.
- **Discovering things** (`src/app/stamps.ts`): a pizzaiolo's diploma on the wall with ten wax seals.
- **Sound** (`src/lib/sound.ts`): everything synthesised and soft: the fire's crackle, the sizzle in the oven,
  toppings landing on notes of a scale (a handful plays a phrase), the peel's scrape, cardboard, a doorbell. The
  radio in the corner plays an original Neapolitan-style waltz on a mandolin and a guitar made by physical modelling
  (Karplus-Strong plucked strings), through a small-radio filter.
- **Hooks for testing**: `window.__novanta` exposes the stage, the camera rig, the kitchen, the oven, the delivery
  and `go(place)`, which `tools/look-novanta.mjs` uses.
- **Media**: the user's generated photos (toppings cut out of plain backgrounds, family photos) through
  `tools/process-novanta.mjs`; scanned materials and the HDRI from [Poly Haven](https://polyhaven.com) (CC0) through
  `tools/fetch-novanta-pbr.mjs`.

## Deploying

Each site is its own Vercel project with its root directory set to `sites/<name>`; Vercel installs the workspace
from the repo root, so `packages/kit` is linked in. Every push to `main` deploys the sites that have a project
(RAKHSH, NIBBO, SAYEH and NOVANTA). Each site has a subdomain of zerodycoder.com, pointed at Vercel with a CNAME
record.

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

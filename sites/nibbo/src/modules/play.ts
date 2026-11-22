import { gsap } from 'gsap';
import { countBlocks, parseLevel, simulate, starsFor, type Action, type Block, type BlockKind, type GameEvent, type Level } from '../game/engine';
import { LEVELS } from '../game/levels';
import type Lenis from 'lenis';
import { $, isNarrow, vibrate } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Board } from '../three/board';
import type { Brain } from '../three/brain';
import type { Director, Slot } from '../three/director';
import type { Robot } from '../three/robot';
import type { Tricks } from './tricks';

type Repeat = Extract<Block, { kind: 'repeat' }>;

const ICONS: Record<BlockKind, string> = {
  forward: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 6 6v5"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a6 6 0 0 0-6 6v5"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M4 18c2-9 14-9 16 0"/><path d="m16 14 4 4 1-5"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
};
const LABELS: Record<BlockKind, string> = { forward: 'Forward', left: 'Turn left', right: 'Turn right', jump: 'Jump', repeat: 'Repeat' };
const SHORT: Record<Action, string> = { forward: 'Fwd', left: 'Left', right: 'Right', jump: 'Jump' };

const STORE = 'nibbo.progress.v1';
function loadStars(): number[] {
  try {
    const raw = localStorage.getItem(STORE);
    const v = raw ? (JSON.parse(raw) as { stars?: number[] }).stars : null;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveStars(stars: number[]): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ stars }));
  } catch {
    /* private mode: progress just isn't kept */
  }
}

/**
 * "Get Nibbo home". The visitor builds a program from blocks (taps add at the end, or inside the open Repeat;
 * tapping a placed block removes it), presses Go, and the interpreter's events are played back on the 3D board
 * with the real robot: rolling, turning, hopping, bumping into letter blocks, collecting sparks, charging.
 */
export function initPlay(o: { director: Director; board: Board; brain: Brain; robot: Robot; sound: Sound; lenis: Lenis; tricks: Tricks }): { update(): void } {
  const { director, board, brain, robot, sound, lenis, tricks } = o;
  const slotEl = $('[data-slot="play"]');
  const slot: Slot = {
    id: 'play',
    el: slotEl,
    mood: 'curious',
    draggable: false,
    pose: (out, rect) => {
      board.layout(rect);
      board.robotPose(out);
      return true;
    },
  };
  director.add(slot);

  const levels: Level[] = LEVELS.map(parseLevel);
  const stars = loadStars();
  let index = Math.max(0, Math.min(levels.length - 1, stars.findIndex((s) => !s)));
  if (stars.filter(Boolean).length === levels.length) index = 0;

  const el = {
    num: $('[data-level-num]'),
    total: $('[data-level-total]'),
    name: $('[data-level-name]'),
    dots: $('[data-level-dots]'),
    goal: $('[data-goal]'),
    palette: $('[data-palette]'),
    program: $('[data-program]'),
    count: $('[data-count]'),
    run: $<HTMLButtonElement>('[data-run]'),
    runLabel: $('[data-run-label]'),
    clear: $<HTMLButtonElement>('[data-clear]'),
    status: $('[data-status]'),
  };
  el.total.textContent = String(levels.length);

  let program: Block[] = [];
  let open: Repeat | null = null;
  let nextId = 1;
  let running = false;
  let result: 'won' | 'failed' | null = null;
  let timeline: gsap.core.Timeline | null = null;

  const level = (): Level => levels[index];

  // On phones the board and the block panel don't both fit under the fold at every scroll position: when the
  // visitor starts building or runs the program, bring the board up under the nav so they can watch.
  const boardEl = $('.play__board');
  function revealBoard(): void {
    if (!isNarrow()) return;
    const r = boardEl.getBoundingClientRect();
    const nav = 70;
    if (r.top >= nav - 4 && r.bottom <= window.innerHeight * 0.62) return;
    // Measure from the real scroll position: a native (touch) scroll may not have reached Lenis yet, and
    // Lenis would then animate from a stale position. Sync it first, then glide.
    const y = window.scrollY;
    lenis.scrollTo(y, { immediate: true, force: true });
    lenis.scrollTo(y + r.top - nav, { duration: 0.9, force: true });
  }

  function setStatus(html: string): void {
    el.status.innerHTML = html;
  }

  function renderDots(): void {
    el.dots.innerHTML = '';
    levels.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-dot';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === index));
      b.setAttribute('aria-label', `Level ${i + 1}${stars[i] ? `, solved with ${stars[i]} stars` : ''}`);
      b.textContent = String(i + 1);
      if (stars[i]) b.classList.add('is-done');
      b.addEventListener('click', () => {
        if (running || i === index) return;
        loadLevel(i);
      });
      el.dots.appendChild(b);
    });
  }

  function renderPalette(): void {
    el.palette.innerHTML = '';
    level().blocks.forEach((kind) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `block block--${kind}`;
      b.innerHTML = `${ICONS[kind]}<span>${LABELS[kind]}</span>`;
      b.setAttribute('aria-label', `Add ${LABELS[kind]}`);
      b.addEventListener('click', () => add(kind));
      el.palette.appendChild(b);
    });
  }

  function chip(block: Block & { kind: Action }): HTMLLIElement {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip chip--${block.kind}`;
    b.dataset.id = String(block.id);
    b.innerHTML = `${ICONS[block.kind]}<span>${SHORT[block.kind]}</span>`;
    b.setAttribute('aria-label', `${LABELS[block.kind]}. Tap to remove.`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      remove(block.id);
    });
    li.appendChild(b);
    return li;
  }

  function renderProgram(): void {
    el.program.innerHTML = '';
    for (const block of program) {
      if (block.kind !== 'repeat') {
        el.program.appendChild(chip(block));
        continue;
      }
      const li = document.createElement('li');
      li.className = `loop${open === block ? ' is-open' : ''}`;
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'chip loop__head';
      head.dataset.id = String(block.id);
      head.innerHTML = `${ICONS.repeat}<span>${block.times}×</span>`;
      head.setAttribute('aria-label', `Repeat ${block.times} times. Tap to change the count.`);
      head.addEventListener('click', (e) => {
        e.stopPropagation();
        if (running) return;
        if (result) resetRun();
        block.times = block.times >= 5 ? 2 : block.times + 1;
        open = block;
        sound.press();
        renderProgram();
      });
      const body = document.createElement('ol');
      body.className = 'loop__body';
      block.body.forEach((inner) => body.appendChild(chip(inner as Block & { kind: Action })));
      if (open === block) body.appendChild(caret());
      body.addEventListener('click', (e) => {
        e.stopPropagation();
        open = block;
        renderProgram();
      });
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip loop__x';
      x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      x.setAttribute('aria-label', 'Remove this repeat block');
      x.style.setProperty('--c', 'var(--card)');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        remove(block.id);
      });
      li.append(head, body, x);
      el.program.appendChild(li);
    }
    if (!open) el.program.appendChild(caret());
    const n = countBlocks(program);
    const L = level();
    el.count.innerHTML = `<span>${n}${L.limit ? ` / ${L.limit}` : ''} block${n === 1 ? '' : 's'}${L.limit ? '' : ` · par ${L.par}`}</span><span>${n ? 'Tap a block to remove it' : ''}</span>`;
  }

  function caret(): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'caret';
    li.setAttribute('aria-hidden', 'true');
    return li;
  }

  function add(kind: BlockKind): void {
    if (running) return;
    if (result) resetRun();
    const L = level();
    if (L.limit && countBlocks(program) >= L.limit) {
      setStatus(`That’s all ${L.limit} blocks. A Repeat block can do the same work with fewer.`);
      brain.react('grumpy', 1.2, false);
      sound.hmph();
      vibrate(30);
      return;
    }
    if (kind === 'repeat') {
      const r: Repeat = { id: nextId++, kind: 'repeat', times: 2, body: [] };
      program.push(r);
      open = r;
    } else {
      (open ? open.body : program).push({ id: nextId++, kind });
    }
    sound.pop(true);
    brain.input();
    if (countBlocks(program) === 1) revealBoard();
    // Nibbo glances at its new instruction.
    if (kind === 'left' || kind === 'right') {
      gsap.to(brain.pose, { headTurn: kind === 'left' ? 0.35 : -0.35, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.inOut' });
    } else brain.nod(1);
    setStatus('');
    renderProgram();
  }

  function remove(id: number): void {
    if (running) return;
    if (result) resetRun();
    const strip = (list: Block[]): Block[] =>
      list.filter((b) => b.id !== id).map((b) => (b.kind === 'repeat' ? { ...b, body: strip(b.body) } : b));
    const wasOpen = open?.id === id;
    program = strip(program);
    // Keep `open` pointing at the (copied) loop that is still there.
    open = wasOpen ? null : ((program.find((b) => b.kind === 'repeat' && b.id === open?.id) as Repeat | undefined) ?? null);
    sound.pop(false);
    renderProgram();
  }

  el.program.addEventListener('click', () => {
    if (open) {
      open = null;
      renderProgram();
    }
  });

  el.clear.addEventListener('click', () => {
    if (running) return;
    program = [];
    open = null;
    resetRun();
    renderProgram();
    sound.pop(false);
  });

  function setRunButton(): void {
    el.run.disabled = running;
    el.runLabel.textContent = running ? 'Running…' : result === 'won' ? (index < levels.length - 1 ? 'Next level' : 'Play again') : result === 'failed' ? 'Try again' : 'Go!';
  }

  function resetRun(): void {
    timeline?.kill();
    timeline = null;
    result = null;
    running = false;
    brain.busy = false;
    board.resetBot();
    robot.wheelSpeed = 0;
    el.program.querySelectorAll('.is-running, .is-error').forEach((n) => n.classList.remove('is-running', 'is-error'));
    setStatus('');
    setRunButton();
  }

  function loadLevel(i: number, animate = true): void {
    index = i;
    program = [];
    open = null;
    resetRun();
    const L = level();
    board.build(L, animate);
    el.num.textContent = String(i + 1);
    el.name.textContent = L.name;
    el.goal.textContent = L.goal;
    renderDots();
    renderPalette();
    renderProgram();
  }

  function highlight(id: number | null, error = false): void {
    el.program.querySelectorAll('.is-running').forEach((n) => n.classList.remove('is-running'));
    if (id === null) return;
    const node = el.program.querySelector(`[data-id="${id}"]`);
    node?.classList.add(error ? 'is-error' : 'is-running');
  }

  function play(events: GameEvent[]): void {
    const L = level();
    const b = board.bot;
    const tl = gsap.timeline({
      onComplete: () => {
        running = false;
        brain.busy = false;
        robot.wheelSpeed = 0;
        highlight(null);
        setRunButton();
      },
    });
    timeline = tl;
    let collected = 0;
    let steps = 0;

    for (const e of events) {
      switch (e.kind) {
        case 'move':
          {
            const step = steps++;
            tl.add(() => {
              highlight(e.block);
              sound.roll(0.42, step);
              robot.wheelSpeed = 12;
            });
          }
          tl.to(b, { c: e.to.c, r: e.to.r, duration: 0.42, ease: 'power1.inOut' });
          tl.add(() => void (robot.wheelSpeed = 0));
          break;
        case 'turn':
          tl.add(() => {
            highlight(e.block);
            sound.servo(e.by > 0);
          });
          tl.to(b, { yaw: `+=${(-e.by * Math.PI) / 2}`, duration: 0.32, ease: 'back.out(1.6)' });
          break;
        case 'jump':
          tl.add(() => {
            highlight(e.block);
            sound.whee();
            brain.react('starry', 0.7, false);
          });
          tl.to(b, { c: e.to.c, r: e.to.r, duration: 0.6, ease: 'power1.inOut' });
          tl.to(b, { hop: 1.1, duration: 0.3, ease: 'power2.out' }, '<');
          tl.to(b, { hop: 0, duration: 0.3, ease: 'power2.in' }, '>');
          tl.add(() => sound.land(0.7));
          break;
        case 'bonk':
          // Nudge towards the block, bump, bounce back.
          tl.add(() => {
            highlight(e.block, true);
            const from = { c: b.c, r: b.r };
            const dc = e.at.c - from.c;
            const dr = e.at.r - from.r;
            const len = Math.hypot(dc, dr) || 1;
            gsap.timeline()
              .to(b, { c: from.c + (dc / len) * 0.28, r: from.r + (dr / len) * 0.28, duration: 0.14, ease: 'power2.in' })
              .add(() => {
                sound.bump();
                board.wobble(e.at);
                brain.react('oops', 1.8, false);
                vibrate([30, 30, 30]);
              })
              .to(b, { c: from.c, r: from.r, duration: 0.4, ease: 'back.out(2)' });
          });
          tl.to({}, { duration: 0.8 });
          tl.add(() => setStatus('Bonk! Nibbo drove into a toy block. Change the plan and try again.'));
          result = 'failed';
          break;
        case 'edge':
          tl.add(() => {
            highlight(e.block, true);
            brain.react('surprised', 1.6, false);
            sound.chirp('surprised');
            const tilt = robot.emote.rotation;
            gsap.timeline().to(tilt, { x: 0.35, duration: 0.18, ease: 'power2.out' }).to(tilt, { x: -0.15, duration: 0.2 }).to(tilt, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' });
            vibrate(40);
          });
          tl.to({}, { duration: 0.9 });
          tl.add(() => setStatus('Whoa, that’s the edge! Nibbo’s cliff sensors stopped it just in time.'));
          result = 'failed';
          break;
        case 'spark':
          collected++;
          tl.add(() => {
            board.collect(e.index);
            sound.spark();
          }, '-=0.12');
          if (collected === L.sparks.length) {
            tl.add(() => {
              board.setHomeActive(true);
              brain.react('happy', 1, false);
            });
          }
          break;
        case 'locked':
          tl.add(() => {
            setStatus('The charger is still locked. Every spark first!');
            brain.react('sad', 1.2, false);
            sound.chirp('sad');
          });
          tl.to({}, { duration: 0.5 });
          break;
        case 'home': {
          const s = starsFor(L, e.blocks);
          tl.add(() => {
            highlight(null);
            stars[index] = Math.max(stars[index] ?? 0, s);
            saveStars(stars);
            renderDots();
            board.celebrate();
            sound.jingle();
            tricks.find('solve');
            brain.react('starry', 2.4, false);
            brain.dance();
            vibrate([15, 40, 15, 40, 60]);
            const msg =
              s === 3
                ? `Home! Solved in ${e.blocks} blocks. Nobody could do it with fewer.`
                : `Home! ${e.blocks} blocks. It can be done in ${L.par}${L.blocks.includes('repeat') ? ': look for a pattern' : ''}.`;
            setStatus(`<span class="stars" aria-label="${s} of 3 stars">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</span> ${msg}`);
          });
          tl.to({}, { duration: 1 });
          result = 'won';
          break;
        }
        case 'out':
          tl.add(() => {
            setStatus('Nibbo ran out of instructions before it got home. Add a few more blocks.');
            brain.react('curious', 1.6, false);
            sound.chirp('question');
          });
          result = 'failed';
          break;
        case 'runaway':
          tl.add(() => setStatus('That’s a very long trip. Nibbo stopped to rest.'));
          result = 'failed';
          break;
      }
    }
  }

  el.run.addEventListener('click', () => {
    if (running) return;
    if (result === 'won') {
      loadLevel(index < levels.length - 1 ? index + 1 : 0);
      return;
    }
    if (result === 'failed') {
      resetRun();
      return;
    }
    if (!program.length) {
      setStatus('Add some blocks first. Nibbo is waiting for a plan.');
      brain.react('curious', 1.2);
      brain.tiltHead();
      return;
    }
    open = null;
    renderProgram();
    revealBoard();
    running = true;
    result = null;
    brain.busy = true;
    brain.input();
    board.resetBot();
    setStatus('');
    const events = simulate(level(), program);
    play(events);
    setRunButton();
  });

  loadLevel(index, false);

  let wasShown = false;
  return {
    update() {
      const r = slotEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const shown = r.bottom > vh * 0.12 && r.top < vh * 0.88;
      if (shown) board.layout(r);
      if (shown !== wasShown) {
        wasShown = shown;
        board.setShown(shown);
      }
    },
  };
}

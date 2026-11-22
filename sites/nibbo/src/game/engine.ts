/**
 * "Get Nibbo home": the rules, independent of any rendering. A level is a small grid; a program is a list of
 * blocks (repeat blocks hold a body). `simulate` runs the program to completion and returns the events in
 * order, which the 3D board then plays back. Running the whole thing up front means the result is known before
 * the robot moves, and the rules can be tested without a browser.
 */

export type Dir = 0 | 1 | 2 | 3; // north (away from the viewer), east, south, west
export const STEP: Record<Dir, [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };

export type Tile = 'floor' | 'void' | 'wall';
export type Pos = { c: number; r: number };

export type Action = 'forward' | 'left' | 'right' | 'jump';
export type BlockKind = Action | 'repeat';

export type Block = { id: number; kind: Action } | { id: number; kind: 'repeat'; times: number; body: Block[] };

export type LevelDef = {
  name: string;
  goal: string;
  /** Rows from the far edge to the near edge. S start, H home (charger), * spark, # toy block, . floor, space nothing. */
  map: string[];
  facing: Dir;
  blocks: BlockKind[];
  par: number;
  /** Most blocks the program may hold. */
  limit?: number;
};

export type Level = LevelDef & {
  w: number;
  h: number;
  tiles: Tile[][];
  start: Pos;
  home: Pos;
  sparks: Pos[];
};

export type GameEvent =
  | { kind: 'move'; block: number; to: Pos }
  | { kind: 'turn'; block: number; dir: Dir; by: -1 | 1 }
  | { kind: 'jump'; block: number; to: Pos }
  | { kind: 'bonk'; block: number; at: Pos }
  | { kind: 'edge'; block: number }
  | { kind: 'spark'; index: number }
  | { kind: 'locked' }
  | { kind: 'home'; blocks: number }
  | { kind: 'out' }
  | { kind: 'runaway' };

export function parseLevel(def: LevelDef): Level {
  const h = def.map.length;
  const w = Math.max(...def.map.map((row) => row.length));
  const tiles: Tile[][] = [];
  let start: Pos = { c: 0, r: 0 };
  let home: Pos = { c: 0, r: 0 };
  const sparks: Pos[] = [];
  for (let r = 0; r < h; r++) {
    tiles.push([]);
    for (let c = 0; c < w; c++) {
      const ch = def.map[r][c] ?? ' ';
      tiles[r].push(ch === ' ' ? 'void' : ch === '#' ? 'wall' : 'floor');
      if (ch === 'S') start = { c, r };
      if (ch === 'H') home = { c, r };
      if (ch === '*') sparks.push({ c, r });
    }
  }
  return { ...def, w, h, tiles, start, home, sparks };
}

export const tileAt = (level: Level, p: Pos): Tile =>
  p.r < 0 || p.r >= level.h || p.c < 0 || p.c >= level.w ? 'void' : level.tiles[p.r][p.c];

/** Number of blocks a program uses (a repeat counts as one, plus its body). */
export function countBlocks(program: Block[]): number {
  return program.reduce((n, b) => n + 1 + (b.kind === 'repeat' ? countBlocks(b.body) : 0), 0);
}

const MAX_STEPS = 240;

export function simulate(level: Level, program: Block[]): GameEvent[] {
  const events: GameEvent[] = [];
  let pos: Pos = { ...level.start };
  let dir: Dir = level.facing;
  const collected = new Set<number>();
  let steps = 0;
  let done = false;

  const arrive = (): void => {
    level.sparks.forEach((s, i) => {
      if (!collected.has(i) && s.c === pos.c && s.r === pos.r) {
        collected.add(i);
        events.push({ kind: 'spark', index: i });
      }
    });
    if (pos.c === level.home.c && pos.r === level.home.r) {
      if (collected.size === level.sparks.length) {
        events.push({ kind: 'home', blocks: countBlocks(program) });
        done = true;
      } else {
        events.push({ kind: 'locked' });
      }
    }
  };

  const exec = (list: Block[]): void => {
    for (const block of list) {
      if (done) return;
      if (block.kind === 'repeat') {
        for (let i = 0; i < block.times && !done; i++) exec(block.body);
        continue;
      }
      if (++steps > MAX_STEPS) {
        events.push({ kind: 'runaway' });
        done = true;
        return;
      }
      const [dc, dr] = STEP[dir];
      if (block.kind === 'left' || block.kind === 'right') {
        const by = block.kind === 'left' ? -1 : 1;
        dir = (((dir + by) % 4) + 4) % 4 as Dir;
        events.push({ kind: 'turn', block: block.id, dir, by });
      } else if (block.kind === 'forward') {
        const next = { c: pos.c + dc, r: pos.r + dr };
        const t = tileAt(level, next);
        if (t === 'wall') {
          events.push({ kind: 'bonk', block: block.id, at: next });
          done = true;
        } else if (t === 'void') {
          events.push({ kind: 'edge', block: block.id });
          done = true;
        } else {
          pos = next;
          events.push({ kind: 'move', block: block.id, to: pos });
          arrive();
        }
      } else {
        // Jump: two tiles forward, over a gap. Toy blocks are too tall to clear.
        const mid = { c: pos.c + dc, r: pos.r + dr };
        const land = { c: pos.c + dc * 2, r: pos.r + dr * 2 };
        if (tileAt(level, mid) === 'wall') {
          events.push({ kind: 'bonk', block: block.id, at: mid });
          done = true;
        } else if (tileAt(level, land) === 'wall') {
          events.push({ kind: 'bonk', block: block.id, at: land });
          done = true;
        } else if (tileAt(level, land) === 'void') {
          events.push({ kind: 'edge', block: block.id });
          done = true;
        } else {
          pos = land;
          events.push({ kind: 'jump', block: block.id, to: pos });
          arrive();
        }
      }
    }
  };

  exec(program);
  if (!done) events.push({ kind: 'out' });
  return events;
}

/** 3 stars at or under par, 2 within two blocks of it, otherwise 1. */
export const starsFor = (level: Level, blocks: number): number => (blocks <= level.par ? 3 : blocks <= level.par + 2 ? 2 : 1);

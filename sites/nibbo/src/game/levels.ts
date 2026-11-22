import type { LevelDef } from './engine';

/**
 * Five levels, each introducing one idea: moving, turning, collecting, repeating, jumping.
 * Maps read from the far edge of the board to the near edge.
 */
export const LEVELS: LevelDef[] = [
  {
    name: 'First steps',
    goal: 'Nibbo’s charger is straight ahead. Add Forward blocks until it gets there.',
    map: [
      '#   #', //
      '     ',
      'S...H',
      '     ',
      '#   #',
    ],
    facing: 1,
    blocks: ['forward'],
    par: 4,
  },
  {
    name: 'Round the corner',
    goal: 'Turns spin Nibbo on the spot. Forward goes the way it’s facing.',
    map: [
      '     ', //
      '  ..H',
      '# .  ',
      'S..  ',
      '    #',
    ],
    facing: 1,
    blocks: ['forward', 'left', 'right'],
    par: 8,
  },
  {
    name: 'Spark detour',
    goal: 'The charger only works once every spark is collected. Grab it, then head home.',
    map: [
      '  *  ', //
      '  .  ',
      'S...H',
      '# . #',
      '     ',
    ],
    facing: 1,
    blocks: ['forward', 'left', 'right'],
    par: 12,
  },
  {
    name: 'Stairs',
    goal: 'Spot the pattern. Put it inside a Repeat block: you only have 8 blocks.',
    map: [
      '    H', //
      '   ..',
      '  .. ',
      ' ..  ',
      'S.  #',
    ],
    facing: 1,
    blocks: ['forward', 'left', 'right', 'repeat'],
    par: 5,
    limit: 8,
  },
  {
    name: 'Mind the gaps',
    goal: 'Jump clears one gap. Can’t clear toy blocks, though. Collect the spark on the way.',
    map: [
      '  .*H', //
      '     ',
      '  .# ',
      '     ',
      'S..  ',
    ],
    facing: 1,
    blocks: ['forward', 'left', 'right', 'jump', 'repeat'],
    par: 8,
  },
];

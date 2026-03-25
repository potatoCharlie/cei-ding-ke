import { describe, expect, it } from 'vitest';
import { simulateBattle } from './battle-simulator.js';
import { parseScriptFile } from './script-parser.js';

describe('script parser position assertions', () => {
  it('parses posStart and posEnd expectations', () => {
    const [script] = parseScriptFile(`
=== movement positions
heroes: shan vs nan
pos: 1 3

turn 1: p1 wins
  p1 move_forward
  > p1: posStart=1 posEnd=2
`);

    expect(script.turns[0].expect?.p1).toMatchObject({
      positionStart: 1,
      positionEnd: 2,
    });
  });

  it('asserts turn start and turn end positions during simulation', () => {
    const [script] = parseScriptFile(`
=== movement positions
heroes: shan vs nan
pos: 1 3

turn 1: p1 wins
  p1 move_forward
  > p1: posStart=1 posEnd=2

turn 2: p2 wins
  p2 move_forward
  > p1: posStart=2 posEnd=2
  > p2: posStart=3 posEnd=2
`);

    const log = simulateBattle(script);

    expect(log[0].turnStartPositions).toMatchObject({ p1: 1, p2: 3 });
    expect(log[1].turnStartPositions).toMatchObject({ p1: 2, p2: 3 });
  });
});

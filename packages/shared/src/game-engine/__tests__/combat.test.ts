import { describe, it, expect } from 'vitest';
import { executePunch, executeWindWalkPunch, executeSkill } from '../combat.js';
import { makeGame, setPositions, getHero } from '../../__tests__/helpers.js';

describe('executePunch', () => {
  it('deals PUNCH_DAMAGE at distance 0', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    const effects = executePunch(state, 'p1', 'p2');
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('damage');
    expect(effects[0].value).toBe(10);
    expect(effects[0].damageType).toBe('physical');
  });

  it('returns empty at distance > 0', () => {
    const state = makeGame();
    setPositions(state, 0, 1);
    const effects = executePunch(state, 'p1', 'p2');
    expect(effects).toHaveLength(0);
  });

  it('cannot punch invisible target', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    getHero(state, 'p2').invisibleRounds = 3;
    const effects = executePunch(state, 'p1', 'p2');
    expect(effects).toHaveLength(0);
  });

  it('auto-targets opponent when no targetId given', () => {
    const state = makeGame();
    setPositions(state, 5, 5);
    const effects = executePunch(state, 'p1');
    expect(effects).toHaveLength(1);
    expect(effects[0].targetId).toBe('p2');
  });
});

describe('executeWindWalkPunch', () => {
  it('deals 15 damage at distance 0', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 5, 5);
    const effects = executeWindWalkPunch(state, 'p1', 'p2');
    expect(effects).toHaveLength(1);
    expect(effects[0].value).toBe(15);
    expect(effects[0].damageType).toBe('physical');
  });

  it('returns empty at distance > 0', () => {
    const state = makeGame('jin', 'nan');
    setPositions(state, 0, 1);
    const effects = executeWindWalkPunch(state, 'p1', 'p2');
    expect(effects).toHaveLength(0);
  });
});

describe('executeSkill', () => {
  describe('Nan - Magic Burn', () => {
    it('deals 15 magic damage + stun at distance 0', () => {
      const state = makeGame('nan', 'shan');
      setPositions(state, 5, 5);
      const effects = executeSkill(state, 'p1', 'magic_burn', 'p2');
      const dmg = effects.find(e => e.type === 'damage');
      const stun = effects.find(e => e.type === 'status_apply' && e.statusEffect === 'stunned');
      expect(dmg?.value).toBe(15);
      expect(dmg?.damageType).toBe('magic');
      expect(stun).toBeDefined();
    });

    it('fails at distance > 0', () => {
      const state = makeGame('nan', 'shan');
      setPositions(state, 0, 1);
      const effects = executeSkill(state, 'p1', 'magic_burn', 'p2');
      expect(effects).toHaveLength(0);
    });
  });

  describe('Nan - Call Fly', () => {
    it('deals 5 damage and heals 5 at long range', () => {
      const state = makeGame('nan', 'shan');
      setPositions(state, 0, 3);
      const effects = executeSkill(state, 'p1', 'call_fly', 'p2');
      const dmg = effects.find(e => e.type === 'damage');
      const heal = effects.find(e => e.type === 'heal');
      expect(dmg?.value).toBe(5);
      expect(heal?.value).toBe(5);
    });
  });

  describe('Shan - Big Darts', () => {
    it('deals 25 damage + self-stun at distance 0', () => {
      const state = makeGame('shan', 'nan');
      setPositions(state, 5, 5);
      const effects = executeSkill(state, 'p1', 'big_darts', 'p2');
      const dmg = effects.find(e => e.type === 'damage' && e.targetId === 'p2');
      const selfStun = effects.find(e => e.type === 'status_apply' && e.targetId === 'p1');
      expect(dmg?.value).toBe(25);
      expect(dmg?.damageType).toBe('physical');
      expect(selfStun?.statusEffect).toBe('stunned');
    });

    it('works at distance 1', () => {
      const state = makeGame('shan', 'nan');
      setPositions(state, 0, 1);
      const effects = executeSkill(state, 'p1', 'big_darts', 'p2');
      expect(effects.some(e => e.type === 'damage')).toBe(true);
    });

    it('fails at distance 2', () => {
      const state = makeGame('shan', 'nan');
      setPositions(state, 0, 2);
      const effects = executeSkill(state, 'p1', 'big_darts', 'p2');
      expect(effects).toHaveLength(0);
    });
  });

  describe('Shan - Frozen', () => {
    it('deals 10 damage + applies trapped', () => {
      const state = makeGame('shan', 'nan');
      setPositions(state, 5, 5);
      const effects = executeSkill(state, 'p1', 'frozen', 'p2');
      const dmg = effects.find(e => e.type === 'damage');
      const trap = effects.find(e => e.type === 'status_apply' && e.statusEffect === 'trapped');
      expect(dmg?.value).toBe(10);
      expect(trap).toBeDefined();
    });
  });

  describe('Jin - Small Dart', () => {
    it('deals 5 damage + stun at distance 0', () => {
      const state = makeGame('jin', 'nan');
      setPositions(state, 5, 5);
      const effects = executeSkill(state, 'p1', 'small_dart', 'p2');
      const dmg = effects.find(e => e.type === 'damage');
      const stun = effects.find(e => e.type === 'status_apply' && e.statusEffect === 'stunned');
      expect(dmg?.value).toBe(5);
      expect(stun).toBeDefined();
    });
  });

  describe('Jin - Kuang', () => {
    it('deals 50 damage + 10 self-damage on enemy', () => {
      const state = makeGame('jin', 'nan');
      setPositions(state, 5, 5);
      const effects = executeSkill(state, 'p1', 'kuang', 'p2');
      const dmg = effects.find(e => e.type === 'damage' && e.targetId === 'p2');
      const selfDmg = effects.find(e => e.type === 'damage' && e.targetId === 'p1');
      expect(dmg?.value).toBe(50);
      expect(selfDmg?.value).toBe(10);
    });

    it('heals 40 when self-cast', () => {
      const state = makeGame('jin', 'nan');
      setPositions(state, 5, 5);
      const effects = executeSkill(state, 'p1', 'kuang', 'p1');
      const heal = effects.find(e => e.type === 'heal');
      expect(heal?.value).toBe(40);
    });
  });

  describe('skill use limits', () => {
    it('returns empty when uses exhausted', () => {
      const state = makeGame('nan', 'shan');
      setPositions(state, 5, 5);
      getHero(state, 'p1').skillUsesRemaining['magic_burn'] = 0;
      const effects = executeSkill(state, 'p1', 'magic_burn', 'p2');
      expect(effects).toHaveLength(0);
    });
  });

  describe('invisible target interaction', () => {
    it('physical skill misses invisible target', () => {
      const state = makeGame('shan', 'jin');
      setPositions(state, 5, 5);
      getHero(state, 'p2').invisibleRounds = 3;
      const effects = executeSkill(state, 'p1', 'big_darts', 'p2');
      expect(effects).toHaveLength(0);
    });

    it('magic skill still hits invisible target', () => {
      const state = makeGame('nan', 'jin');
      setPositions(state, 5, 5);
      getHero(state, 'p2').invisibleRounds = 3;
      const effects = executeSkill(state, 'p1', 'magic_burn', 'p2');
      expect(effects.some(e => e.type === 'damage')).toBe(true);
    });
  });
});

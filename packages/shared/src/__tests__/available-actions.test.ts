import { describe, it, expect } from 'vitest';
import { getAvailableActions, executeAction } from '../game-engine/GameState.js';
import { makeGame, setPositions, getHero, getPlayer, winRPSForPlayer } from './helpers.js';

describe('getAvailableActions', () => {
  describe('movement actions', () => {
    it('both move directions available when not at max distance', () => {
      const state = makeGame();
      setPositions(state, 1, 2); // distance 1
      state.phase = 'action_phase';
      state.actionOrder = ['p1'];
      state.currentActionIndex = 0;

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'move_forward')).toBe(true);
      expect(actions.some(a => a.type === 'move_backward')).toBe(true);
    });

    it('backward blocked at max distance', () => {
      const state = makeGame();
      setPositions(state, 0, 3); // at MAX_DISTANCE

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'move_forward')).toBe(true);
      expect(actions.some(a => a.type === 'move_backward')).toBe(false);
    });

    it('trapped hero cannot move', () => {
      const state = makeGame();
      setPositions(state, 1, 2);
      getHero(state, 'p1').statusEffects.push({ type: 'trapped', remainingRounds: 2 });

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'move_forward')).toBe(false);
      expect(actions.some(a => a.type === 'move_backward')).toBe(false);
    });

    it('invisible hero moves at 2x speed (checks legal position for 2 steps)', () => {
      const state = makeGame('jin', 'nan');
      setPositions(state, 0, 3);
      getHero(state, 'p1').invisibleRounds = 2;

      const actions = getAvailableActions(state, 'p1');
      // Forward: 0 → 2 (toward enemy at 3), distance from enemy = 1 → legal
      expect(actions.some(a => a.type === 'move_forward')).toBe(true);
      // Backward: 0 → -2, distance from enemy = 5 → exceeds MAX_DISTANCE → blocked
      expect(actions.some(a => a.type === 'move_backward')).toBe(false);
    });

    it('slowed hero moves at 0.5 speed', () => {
      const state = makeGame();
      setPositions(state, 1, 2);
      getHero(state, 'p1').statusEffects.push({ type: 'slowed', remainingRounds: 2 });

      const actions = getAvailableActions(state, 'p1');
      // Both should be available (0.5 step from position 1 → 1.5 or 0.5)
      expect(actions.some(a => a.type === 'move_forward')).toBe(true);
      expect(actions.some(a => a.type === 'move_backward')).toBe(true);
    });
  });

  describe('punch actions', () => {
    it('punch available at distance 0', () => {
      const state = makeGame();
      setPositions(state, 5, 5);

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'punch')).toBe(true);
    });

    it('punch NOT available at distance > 0', () => {
      const state = makeGame();
      setPositions(state, 5, 6);

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'punch')).toBe(false);
    });
  });

  describe('skill actions', () => {
    it('Nan magic_burn available at distance 0 only', () => {
      const state = makeGame('nan', 'shan');
      setPositions(state, 5, 5);

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'skill' && a.skillId === 'magic_burn')).toBe(true);

      setPositions(state, 5, 6);
      const actions2 = getAvailableActions(state, 'p1');
      expect(actions2.some(a => a.type === 'skill' && a.skillId === 'magic_burn')).toBe(false);
    });

    it('Nan call_fly available at any distance', () => {
      const state = makeGame('nan', 'shan');
      setPositions(state, 0, 3);

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'skill' && a.skillId === 'call_fly')).toBe(true);
    });

    it('skill with 0 uses remaining is not available', () => {
      const state = makeGame('nan', 'shan');
      setPositions(state, 5, 5);
      getHero(state, 'p1').skillUsesRemaining['magic_burn'] = 0;

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'skill' && a.skillId === 'magic_burn')).toBe(false);
    });

    it('Shan Big Darts available at distance 0 and 1', () => {
      const state = makeGame('shan', 'nan');
      setPositions(state, 5, 5);
      const d0Actions = getAvailableActions(state, 'p1');
      expect(d0Actions.some(a => a.type === 'skill' && a.skillId === 'big_darts')).toBe(true);

      setPositions(state, 5, 6);
      const d1Actions = getAvailableActions(state, 'p1');
      expect(d1Actions.some(a => a.type === 'skill' && a.skillId === 'big_darts')).toBe(true);

      setPositions(state, 5, 7);
      const d2Actions = getAvailableActions(state, 'p1');
      expect(d2Actions.some(a => a.type === 'skill' && a.skillId === 'big_darts')).toBe(false);
    });

    it('Jin Wind Walk is always available (self-target)', () => {
      const state = makeGame('jin', 'nan');
      setPositions(state, 0, 3); // far away

      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'skill' && a.skillId === 'wind_walk')).toBe(true);
    });

    it('Jin Kuang available at distance 0-1 with self-cast option', () => {
      const state = makeGame('jin', 'nan');
      setPositions(state, 5, 5);

      const actions = getAvailableActions(state, 'p1');
      const kuangActions = actions.filter(a => a.type === 'skill' && a.skillId === 'kuang');
      // Should have both enemy target and self-cast
      expect(kuangActions.some(a => a.targetId === 'p2')).toBe(true);
      expect(kuangActions.some(a => a.targetId === 'p1')).toBe(true);
    });

    it('Jin Kuang enemy target is not available at distance > 1, but self-cast remains available', () => {
      const state = makeGame('jin', 'nan');
      setPositions(state, 0, 3);

      const actions = getAvailableActions(state, 'p1');
      const kuangActions = actions.filter(a => a.type === 'skill' && a.skillId === 'kuang');
      expect(kuangActions.some(a => a.targetId === 'p2')).toBe(false);
      expect(kuangActions.some(a => a.targetId === 'p1')).toBe(true);
    });
  });

  describe('summon actions', () => {
    it('Gao can summon when no minion exists', () => {
      const state = makeGame('gao', 'nan');
      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'summon')).toBe(true);
    });

    it('Gao cannot summon when minion already exists', () => {
      const state = makeGame('gao', 'nan');

      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'summon', playerId: 'p1' });
      const minionId = getPlayer(state, 'p1').minions[0].minionId;
      executeAction(state, { type: 'stay', playerId: 'p1', minionId });

      winRPSForPlayer(state, 'p1');
      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'summon')).toBe(false);
    });

    it('non-summoner hero has no summon action', () => {
      const state = makeGame('nan', 'shan');
      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'summon')).toBe(false);
    });
  });

  describe('stay action', () => {
    it('stay is always available for alive hero', () => {
      const state = makeGame();
      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.type === 'stay')).toBe(true);
    });
  });

  describe('minion actions', () => {
    it('minion has move, stay actions when awaiting minion action', () => {
      const state = makeGame('gao', 'nan');

      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'summon', playerId: 'p1' });

      // Now awaiting minion action
      expect(state.awaitingMinionAction).toBe(true);
      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.minionId && a.type === 'stay')).toBe(true);
    });

    it('minion can punch when at distance 0 from enemy', () => {
      const state = makeGame('gao', 'nan');
      setPositions(state, 5, 5);

      winRPSForPlayer(state, 'p1');
      executeAction(state, { type: 'summon', playerId: 'p1' });

      // Minion spawns at hero position (5), enemy also at 5
      const actions = getAvailableActions(state, 'p1');
      expect(actions.some(a => a.minionId && a.type === 'punch')).toBe(true);
    });
  });
});

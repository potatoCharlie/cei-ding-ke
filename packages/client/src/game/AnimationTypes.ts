import type { GameEffect } from '@cei-ding-ke/shared';

export type BattleAnimation =
  | { type: 'move'; targetId: string; direction: 'forward' | 'backward' }
  | { type: 'damage'; targetId: string; amount: number; damageType: 'physical' | 'magic' }
  | { type: 'heal'; targetId: string; amount: number }
  | { type: 'status_apply'; targetId: string; effect: string }
  | { type: 'status_remove'; targetId: string; effect: string }
  | { type: 'summon'; ownerId: string }
  | { type: 'death'; targetId: string }
  | { type: 'punch'; attackerId: string; targetId: string };

/** Convert server GameEffects into visual animations. */
export function effectsToAnimations(effects: GameEffect[], actionType?: string): BattleAnimation[] {
  const anims: BattleAnimation[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case 'damage':
        anims.push({
          type: 'damage',
          targetId: effect.targetId,
          amount: effect.value ?? 0,
          damageType: effect.damageType ?? 'physical',
        });
        break;
      case 'heal':
        anims.push({
          type: 'heal',
          targetId: effect.targetId,
          amount: effect.value ?? 0,
        });
        break;
      case 'status_apply':
        anims.push({
          type: 'status_apply',
          targetId: effect.targetId,
          effect: effect.statusEffect ?? 'stunned',
        });
        break;
      case 'status_remove':
        anims.push({
          type: 'status_remove',
          targetId: effect.targetId,
          effect: effect.statusEffect ?? '',
        });
        break;
      case 'summon':
        anims.push({ type: 'summon', ownerId: effect.sourceId });
        break;
      case 'death':
        anims.push({ type: 'death', targetId: effect.targetId });
        break;
    }
  }

  return anims;
}

/** Duration in ms for each animation type. */
export const ANIMATION_DURATIONS: Record<BattleAnimation['type'], number> = {
  move: 500,
  damage: 600,
  heal: 600,
  status_apply: 400,
  status_remove: 400,
  summon: 800,
  death: 1000,
  punch: 500,
};

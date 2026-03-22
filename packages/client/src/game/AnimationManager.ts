import type { GameEffect } from '@cei-ding-ke/shared';
import { type BattleAnimation, effectsToAnimations, ANIMATION_DURATIONS } from './AnimationTypes.js';
import type { FloatingNumber } from '../scenes/BattleScene.js';

type SetAnimations = (anims: BattleAnimation[]) => void;
type SetFloatingNumbers = (fn: FloatingNumber[]) => void;
type OnQueueDone = () => void;

let floatIdCounter = 0;

/**
 * Manages a queue of battle animations.
 * Converts GameEffects into BattleAnimations, plays them one-by-one,
 * and drives the CSS animation classes + floating numbers.
 */
export class AnimationManager {
  private queue: BattleAnimation[] = [];
  private playing = false;
  private setActiveAnimations: SetAnimations;
  private setFloatingNumbers: SetFloatingNumbers;
  private onQueueDone: OnQueueDone;

  constructor(
    setActiveAnimations: SetAnimations,
    setFloatingNumbers: SetFloatingNumbers,
    onQueueDone: OnQueueDone,
  ) {
    this.setActiveAnimations = setActiveAnimations;
    this.setFloatingNumbers = setFloatingNumbers;
    this.onQueueDone = onQueueDone;
  }

  /** Enqueue effects from an action result and start playing. */
  enqueueEffects(effects: GameEffect[], actionType?: string): void {
    const anims = effectsToAnimations(effects, actionType);
    // If the action was a punch, prepend the punch lunge animation
    if (actionType === 'punch' && effects.length > 0) {
      const firstDamage = effects.find(e => e.type === 'damage');
      if (firstDamage) {
        this.queue.unshift({
          type: 'punch',
          attackerId: firstDamage.sourceId,
          targetId: firstDamage.targetId,
        });
      }
    }
    this.queue.push(...anims);
    if (!this.playing) {
      this.playNext();
    }
  }

  /** Enqueue a single animation. */
  enqueue(anim: BattleAnimation): void {
    this.queue.push(anim);
    if (!this.playing) {
      this.playNext();
    }
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.playing = false;
      this.setActiveAnimations([]);
      this.onQueueDone();
      return;
    }

    this.playing = true;
    const anim = this.queue.shift()!;
    const duration = ANIMATION_DURATIONS[anim.type];

    // Set the active animation so BattleScene applies CSS classes
    this.setActiveAnimations([anim]);

    // Show floating numbers for damage/heal
    if (anim.type === 'damage') {
      const fn: FloatingNumber = {
        id: ++floatIdCounter,
        targetId: anim.targetId,
        text: `-${anim.amount}`,
        type: anim.damageType === 'magic' ? 'magic-damage' : 'damage',
      };
      this.setFloatingNumbers([fn]);
      setTimeout(() => this.setFloatingNumbers([]), duration);
    } else if (anim.type === 'heal') {
      const fn: FloatingNumber = {
        id: ++floatIdCounter,
        targetId: anim.targetId,
        text: `+${anim.amount}`,
        type: 'heal',
      };
      this.setFloatingNumbers([fn]);
      setTimeout(() => this.setFloatingNumbers([]), duration);
    }

    // Wait for animation to finish, then play next
    setTimeout(() => this.playNext(), duration);
  }

  /** Clear all pending animations. */
  clear(): void {
    this.queue = [];
    this.playing = false;
    this.setActiveAnimations([]);
    this.setFloatingNumbers([]);
  }

  get isPlaying(): boolean {
    return this.playing;
  }
}

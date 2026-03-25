import type { HeroDefinition } from '../types/hero.js';

export const fan: HeroDefinition = {
  id: 'fan',
  name: 'Fan',
  description: 'A magician who permanently enhances allied heroes with Heart Fire.',
  hp: 100,
  physicalSkills: [],
  magicSkills: [
    {
      id: 'heart_fire',
      name: 'Heart Fire',
      description: 'Cast on self or ally at distance 0-1. Permanently grants +5 damage to that hero’s punch and skill damage. Does not stack.',
      minDistance: 0,
      maxDistance: 1,
      damage: 0,
      damageType: 'magic',
      selfDamage: 0,
      selfHeal: 0,
      selfStun: false,
      maxUses: -1,
      category: 'magic',
      special: ['heart_fire_buff'],
    },
  ],
};

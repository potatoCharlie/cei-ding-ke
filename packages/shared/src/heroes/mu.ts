import type { HeroDefinition } from '../types/hero.js';

export const mu: HeroDefinition = {
  id: 'mu',
  name: 'Mu',
  description: 'A ranged hero who relies on consistent dart damage and Kuang burst.',
  hp: 100,
  physicalSkills: [
    {
      id: 'medium_dart',
      name: 'Medium Dart',
      description: 'Cast distance 0-1, deal 10 physical damage.',
      minDistance: 0,
      maxDistance: 1,
      damage: 10,
      damageType: 'physical',
      selfDamage: 0,
      selfHeal: 0,
      selfStun: false,
      maxUses: -1,
      category: 'physical',
    },
  ],
  magicSkills: [
    {
      id: 'kuang',
      name: 'Kuang',
      description: 'Deal 50 magic damage to an enemy at distance 0-1. Self-cast or teammate-cast heals 40. One use only.',
      minDistance: 0,
      maxDistance: 1,
      damage: 50,
      damageType: 'magic',
      selfDamage: 10,
      selfHeal: 0,
      selfStun: false,
      maxUses: 1,
      category: 'magic',
      special: ['kuang_self_heal'],
    },
  ],
};

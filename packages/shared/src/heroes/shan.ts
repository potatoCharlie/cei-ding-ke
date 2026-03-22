import type { HeroDefinition } from '../types/hero.js';

export const shan: HeroDefinition = {
  id: 'shan',
  name: 'Shan',
  description: 'A brave hero with both strong physical and magical skills.',
  hp: 100,
  physicalSkills: [
    {
      id: 'big_darts',
      name: 'Big Darts',
      description: 'Cast distance 0-1, 25 physical damage. Shan gets stunned for 1 round after using.',
      minDistance: 0,
      maxDistance: 1,
      damage: 25,
      damageType: 'physical',
      selfDamage: 0,
      selfHeal: 0,
      selfStun: true,
      maxUses: -1,
      category: 'physical',
    },
  ],
  magicSkills: [
    {
      id: 'frozen',
      name: 'Frozen',
      description: 'Cast distance 0-1, trap opponent for 2 rounds. 10 magic damage initially, then 10 per trapped round (30 total).',
      minDistance: 0,
      maxDistance: 1,
      damage: 10,
      damageType: 'magic',
      selfDamage: 0,
      selfHeal: 0,
      appliesStatus: 'trapped',
      statusDuration: 2,
      selfStun: false,
      maxUses: 2,
      category: 'magic',
      special: ['frozen_dot'],
    },
  ],
};

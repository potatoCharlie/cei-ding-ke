import type { HeroDefinition } from '../types/hero.js';

export const hans: HeroDefinition = {
  id: 'hans',
  name: 'Hans',
  description: 'A heavy bruiser who controls nearby enemies with repeated stuns.',
  hp: 100,
  physicalSkills: [
    {
      id: 'stomp',
      name: 'Stomp',
      description: 'Cast distance 0, stun all enemies in the same block for 1 round.',
      minDistance: 0,
      maxDistance: 0,
      damage: 0,
      damageType: 'physical',
      selfDamage: 0,
      selfHeal: 0,
      selfStun: false,
      maxUses: -1,
      category: 'physical',
      special: ['stomp_aoe'],
    },
  ],
  magicSkills: [
    {
      id: 'storm_hammer',
      name: 'Storm Hammer',
      description: 'Cast distance 0-1, deal 20 magic damage and stun for 2 rounds.',
      minDistance: 0,
      maxDistance: 1,
      damage: 20,
      damageType: 'magic',
      selfDamage: 0,
      selfHeal: 0,
      appliesStatus: 'stunned',
      statusDuration: 2,
      selfStun: false,
      maxUses: 2,
      category: 'magic',
    },
  ],
};

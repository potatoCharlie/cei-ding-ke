import type { HeroDefinition } from '../types/hero.js';

export const gao: HeroDefinition = {
  id: 'gao',
  name: 'Gao',
  description: 'A normal person with a powerful minion.',
  hp: 100,
  physicalSkills: [],
  magicSkills: [],
  minion: {
    id: 'hellfire',
    name: 'Hellfire',
    description: 'A powerful minion with 100HP, immune to magic. Punches deal 20 physical damage.',
    hp: 100,
    punchDamage: 20,
    punchCountsForStun: false,
    immuneTo: ['magic'],
    moveSpeed: 1,
  },
};

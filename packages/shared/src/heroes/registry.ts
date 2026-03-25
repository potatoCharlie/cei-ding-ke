import type { HeroDefinition } from '../types/hero.js';
import { nan } from './nan.js';
import { shan } from './shan.js';
import { gao } from './gao.js';
import { jin } from './jin.js';
import { mu } from './mu.js';
import { hans } from './hans.js';
import { octopus } from './octopus.js';
import { fan } from './fan.js';

const heroRegistry: Map<string, HeroDefinition> = new Map([
  ['nan', nan],
  ['shan', shan],
  ['gao', gao],
  ['jin', jin],
  ['mu', mu],
  ['hans', hans],
  ['octopus', octopus],
  ['fan', fan],
]);

export function getHero(id: string): HeroDefinition | undefined {
  return heroRegistry.get(id);
}

export function getAllHeroes(): HeroDefinition[] {
  return Array.from(heroRegistry.values());
}

export function getHeroIds(): string[] {
  return Array.from(heroRegistry.keys());
}

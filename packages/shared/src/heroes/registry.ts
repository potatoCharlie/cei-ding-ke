import type { HeroDefinition } from '../types/hero.js';
import { nan } from './nan.js';
import { shan } from './shan.js';
import { gao } from './gao.js';
import { jin } from './jin.js';

const heroRegistry: Map<string, HeroDefinition> = new Map([
  ['nan', nan],
  ['shan', shan],
  ['gao', gao],
  ['jin', jin],
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

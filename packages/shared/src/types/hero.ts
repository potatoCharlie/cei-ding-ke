import type { DamageType, StatusEffectType } from './game.js';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  /** Min cast distance (0 = same block) */
  minDistance: number;
  /** Max cast distance */
  maxDistance: number;
  /** Damage dealt to target */
  damage: number;
  damageType: DamageType;
  /** Self-damage when casting (e.g., Jin's Kuang) */
  selfDamage: number;
  /** Self-heal when casting (e.g., Nan's Call Fly) */
  selfHeal: number;
  /** Status effect applied to target */
  appliesStatus?: StatusEffectType;
  /** Duration of applied status in rounds */
  statusDuration?: number;
  /** Whether casting this skill stuns the caster */
  selfStun: boolean;
  /** Max number of uses (-1 = unlimited) */
  maxUses: number;
  /** Whether this is a physical or magic skill category */
  category: 'physical' | 'magic';
  /** Special flags for unique mechanics */
  special?: string[];
}

export interface MinionDefinition {
  id: string;
  name: string;
  description: string;
  hp: number;
  /** Punch damage for this minion */
  punchDamage: number;
  /** Whether punches count toward 3-punch stun */
  punchCountsForStun: boolean;
  /** Immunities */
  immuneTo: DamageType[];
  /** Movement per round */
  moveSpeed: number;
  /** Whether the summon can move at all */
  canMove?: boolean;
  /** Minimum attack distance */
  attackMinDistance?: number;
  /** Maximum attack distance */
  attackMaxDistance?: number;
}

export interface HeroDefinition {
  id: string;
  name: string;
  description: string;
  hp: number;
  /** Passive ability description (e.g., Nan's stink) */
  passive?: PassiveAbility;
  /** Physical skills */
  physicalSkills: SkillDefinition[];
  /** Magic skills */
  magicSkills: SkillDefinition[];
  /** Minion this hero can summon */
  minion?: MinionDefinition;
}

export interface PassiveAbility {
  id: string;
  name: string;
  description: string;
  /** Trigger condition */
  trigger: 'distance_0' | 'start_of_turn' | 'end_of_turn';
  damage: number;
  damageType: DamageType;
}

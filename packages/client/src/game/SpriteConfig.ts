/** Visual configuration for each hero (placeholder art until AI sprites arrive). */

export interface HeroVisualConfig {
  color: string;
  bgGradient: string;
  emoji: string;
  glowColor: string;
  label: string;
}

export const HERO_VISUALS: Record<string, HeroVisualConfig> = {
  nan: {
    color: '#a855f7',
    bgGradient: 'linear-gradient(135deg, #6b21a8, #a855f7)',
    emoji: '🦨',
    glowColor: '#c084fc',
    label: 'Nan',
  },
  shan: {
    color: '#ef4444',
    bgGradient: 'linear-gradient(135deg, #991b1b, #ef4444)',
    emoji: '⚔️',
    glowColor: '#fca5a5',
    label: 'Shan',
  },
  gao: {
    color: '#f59e0b',
    bgGradient: 'linear-gradient(135deg, #92400e, #f59e0b)',
    emoji: '🔥',
    glowColor: '#fcd34d',
    label: 'Gao',
  },
  jin: {
    color: '#3b82f6',
    bgGradient: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
    emoji: '🗡️',
    glowColor: '#93c5fd',
    label: 'Jin',
  },
};

export function getHeroVisual(heroId: string): HeroVisualConfig {
  return HERO_VISUALS[heroId] ?? {
    color: '#6b7280',
    bgGradient: 'linear-gradient(135deg, #374151, #6b7280)',
    emoji: '🦸',
    glowColor: '#9ca3af',
    label: heroId,
  };
}

/** Status effect icon config */
export const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  stunned: { icon: '💫', color: '#f97316' },
  trapped: { icon: '🧊', color: '#3b82f6' },
  slowed: { icon: '🐌', color: '#8b5cf6' },
  invisible: { icon: '👻', color: '#6366f1' },
};

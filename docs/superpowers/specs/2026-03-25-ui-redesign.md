# UI Redesign Spec
**Date:** 2026-03-25
**Scope:** Battle scene, Hero Select, Quick Match home section, status effect display

---

## Goals

Make the game feel like a game. Four concrete changes:
1. Battle scene: stone arena aesthetic, position-column grid, team rows
2. Hero Select: 2-column card grid with avatar + skill list
3. Quick Match: same card format inline on home page
4. Status effects: prominently displayed under hero avatar in battle

---

## 1. Battle Scene

### Layout Structure

```
┌─────────────────────────────────────────┐
│  🔥                                  🔥  │  ← torch strip (decorative, full width)
│  TURN N  ·  Phase label  ·  Timer       │  ← turn bar
├──────┬──────┬──────┬──────┬──────┬──────┤
│      │      │ [B]  │ [D]  │      │      │  ← enemy row (top)
│      │      │ 🗡️   │ ⚔️   │      │      │
├──────┴──────┴──────┴──────┴──────┴──────┤
│          ═══ GROUND DIVIDER ═══          │  ← amber bar
├──────┬──────┬──────┬──────┬──────┬──────┤
│      │ [A]  │      │      │ [C]  │      │  ← my team row (bottom)
│      │ 🦨   │      │      │ 🔥   │      │
├──────┴──────┴──────┴──────┴──────┴──────┤
│  [🦨 A · 80hp]  [🔥 C · 55hp] ‖ [⚔️ B] │  ← portrait bar (replaces ActionOrderBar)
└─────────────────────────────────────────┘
```

### Column Grid

- Columns are computed dynamically from `displayPositions` (existing logic in `BattleScene.tsx`): `paddedMin - 1` to `paddedMax + 1`
- Minimum 5 columns regardless of entity count — prevents jarring collapse when heroes are adjacent
- Each column = one game position on the 1D line
- Column dividers: `border-right: 1px solid #ffffff08` on each cell
- No position numbers shown — visual spacing conveys position
- Grid: `display: grid; grid-template-columns: repeat(N, 1fr)`

### Three grid sections (three CSS grid row groups):

**1. Enemy row** — each cell `min-height: 64px`, align to bottom (`justify-content: flex-end; padding-bottom: 6px`). Enemy heroes face left (`transform: scaleX(-1)`), red glow. Content order (top → bottom inside cell):

```
  [HP bar, colored by %]     ← floats above hero
  [status icons: 💫2 🧊1]   ← only if present
  [EMOJI 24px, red glow]     ← closest to ground divider
  [name, 7px, fca5a5]
```

**2. Ground divider** — `grid-column: 1 / -1`, height 8px, `background: linear-gradient(90deg, #3a1f0a, #6b3a1a, #3a1f0a)`, `box-shadow: 0 0 12px #f59e0b40`. This is a visual separator only, not a functional row.

**3. My team row** — each cell `min-height: 64px`, align to top (`justify-content: flex-start; padding-top: 6px`). Allies face right, blue glow. Content order (top → bottom inside cell):

```
  [EMOJI 24px, blue glow]    ← closest to ground divider
  [status icons: 💫2 🧊1]   ← only if present
  [HP bar, colored by %]
  [name, 7px, 93c5fd]
  [ACT badge]                ← only for active turn hero
```

Active cell background: `box-shadow: inset 0 0 12px #22c55e20`

### Minions

Minions belong to a player (owner). Display minions in the same row as their owner (friendly minion → my team row, enemy minion → enemy row). Same cell as their current position. Minions use a smaller card style (existing `MinionCard` component, visually shrunk to fit the cell alongside heroes if co-located).

### Background (BattleScene.css)

```css
.battle-arena {
  background:
    repeating-linear-gradient(90deg, #00000018 0px, transparent 1px, transparent 60px, #00000018 61px),
    linear-gradient(180deg, #2a1a0a 0%, #3d2510 30%, #1a0f06 60%, #0d0802 100%);
}
```

**Torch strip** — thin div above the turn bar, full width, `background: linear-gradient(180deg, #1a0c04, transparent)`. Contains two torch emojis pinned to left and right edges with `justify-content: space-between` and a decorative `·` separator line between them (CSS `flex: 1; border-bottom: 1px solid #3a1a0a; margin: 0 8px; align-self: center`). This scales with any width.

### Portrait Bar (replaces ActionOrderBar)

The existing `ActionOrderBar` component is **removed**. Its function — showing whose turn it is and action sequence — is absorbed into the portrait bar.

Portrait bar: fixed at the bottom of `.battle-arena` as a normal flex child (not `position: fixed`), `background: #0a0602`, `border-top: 2px solid #6b3a1a`, `padding: 6px 10px`. Does not overlap `ActionPanel` since it's in normal document flow.

Layout: your team's portraits on the left, enemy portraits on the right, separated by a `|` divider.

Each portrait card shows:
- Hero emoji (14px)
- `name · Nhp` (7px)
- Status icons row (all statuses, no cap — more room here than in cell)
- Order badge: `1st`, `2nd`, `3rd`, `4th` pill (amber, shown only during `action_phase` from `gameState.actionOrder`)

Portrait card states — "currently acting" and "already acted" styles apply **only when `gameState.phase === 'action_phase'`**. Outside that phase, all portrait cards render in default state regardless of `actionOrder` or `currentActionIndex` values (which may be stale):
- **Default**: `border: 1px solid teamColor`
- **Currently acting** (`phase === 'action_phase'` AND `actionOrder[currentActionIndex] === playerId`): `border: 2px solid #22c55e`, `box-shadow: 0 0 8px #22c55e30`
- **Already acted** (`phase === 'action_phase'` AND player's index in `actionOrder` `< currentActionIndex`): `opacity: 0.5`
- **Not in action order this round** (player not in `actionOrder`, or phase is not `action_phase`): no order badge, normal border

---

## 2. Hero Select

### Layout

2-column grid replacing the current single-column list.

```
SELECT YOUR HERO
┌────────────────┬────────────────┐
│ [avatar] info  │ [avatar] info  │
├────────────────┼────────────────┤
│ [avatar] info  │ [avatar] info  │
└────────────────┴────────────────┘
```

Scrollable if heroes overflow viewport.

### Card Structure

Each card is a flex row (`display: flex`):

**Left — Avatar strip** (width: 52px, `flex-shrink: 0`):
- `background: visual.bgGradient` (from `getHeroVisual()`)
- Full card height
- Hero emoji centered, 28–32px, `filter: drop-shadow(0 2px 4px #00000080)`

**Right — Info panel** (`flex: 1`, `padding: 5px 6px`, `overflow: hidden`):
- Hero name: bold, `color: visual.color`, 10px, `letter-spacing: 1px`
- Archetype subtitle: `color: #94a3b8`, 7px — sourced from new `archetype` field in `HeroVisualConfig` (see SpriteConfig changes below)
- Skills list: vertical, 7px, one skill per line, `overflow: hidden`. Heroes with many skills (up to 5) must fit inside the card without expanding its height — use `font-size: 7px` and `line-height: 1.2`. If skills overflow the card height (e.g. a hero has 5 skills), clip with `overflow: hidden` (no scroll). All skill names are short enough that clipping should not occur in practice, but the card height must not grow to accommodate overflow:
  - Passive: `🟣 skill.name`
  - Physical skills: `🔴 skill.name`
  - Magic skills: `🔵 skill.name`
  - Minion: `🟢 minion.name`

**Bottom accent bar**: 2px, `visual.color` when selected, `#374151` otherwise.

**Selected state**: `border: 2px solid visual.color`, `box-shadow: 0 0 12px ${visual.color}30`

### Component prop change

Add `selectedHeroId?: string` prop to `HeroSelect`:

```ts
interface Props {
  onSelect: (heroId: string) => void;
  selectedHeroId?: string;  // NEW — highlights selected card without navigating
}
```

When `selectedHeroId` is set, the matching card shows selected styles but clicking still calls `onSelect`. This allows the component to be used in both contexts:
- **Hero Select screen**: `selectedHeroId` not passed; clicking navigates immediately (existing behaviour)
- **Quick Match section**: `selectedHeroId={selectedHero}` passed; clicking updates selection state in `App.tsx`

---

## 3. Quick Match (Home Page)

Replace the current `hero-mini-grid` section with the same `HeroSelect` card grid:

```tsx
<HeroSelect
  onSelect={(heroId) => setSelectedHero(heroId)}
  selectedHeroId={selectedHero}
/>
```

"Find Match" button below the grid, disabled until `selectedHero` is set. Same `handleQuickMatch` handler as today.

---

## 4. Status Effects in Battle

### Cell display

Status icons render below the hero emoji (enemy row) or below the HP bar (my team row) inside each grid cell.

**Format**: `icon + rounds` inline, e.g. `💫2`. Cap at 3 badges shown in cell; if more, show `+N` for the extra count (N = number of additional effect types beyond the first 3).

**Data sources**:
- `hero.statusEffects[]` → each entry: `{ type, remainingRounds }` → render `STATUS_ICONS[e.type].icon + e.remainingRounds`
- `hero.invisibleRounds > 0` → render `STATUS_ICONS.invisible.icon + hero.invisibleRounds`
- `hero.damageBonus > 0` → render `STATUS_ICONS.heart_fire_buff.icon` (no round count — this buff is permanent, no expiry)

The position of status icons in screen space is always **between the emoji and the ground divider**: above the emoji for enemies (rendered in DOM order before the emoji, cell aligns to bottom), below the emoji for allies (rendered in DOM order after the emoji, cell aligns to top). Section 1's content-order tables are authoritative. Ignore any "below the hero emoji" shorthand that contradicts those tables.

### Portrait bar display

Same logic, no cap on count (show all statuses).

### SpriteConfig.ts changes

1. Add `archetype` field to `HeroVisualConfig`:
   ```ts
   archetype: string; // e.g. "Mage · DoT", "Fighter · Burst"
   ```
   All 8 entries in `HERO_VISUALS` already exist (nan, shan, gao, jin, mu, hans, octopus, fan) — add `archetype` in-place to each of the 8 existing objects.

2. Add `heart_fire_buff` to `STATUS_ICONS`:
   ```ts
   heart_fire_buff: { icon: '🔥', color: '#f472b6' },
   ```

---

## Files to Change

| File | Change |
|------|--------|
| `scenes/BattleScene.tsx` | Full rewrite of layout: 2-row column grid, ground divider, portrait bar (absorbs ActionOrderBar), remove `ActionOrderBar` component |
| `scenes/BattleScene.css` | Arena background, column grid styles, portrait bar styles, torch strip |
| `components/HeroSelect.tsx` | Add `selectedHeroId?` prop; change to 2-column grid; avatar-left card layout |
| `App.tsx` | Quick Match: replace `hero-mini-grid` with `<HeroSelect selectedHeroId={selectedHero} onSelect={...} />` |
| `game/SpriteConfig.ts` | Add `archetype` field to `HeroVisualConfig` + all 8 hero entries; add `heart_fire_buff` to `STATUS_ICONS` |

`ActionPanel.tsx`, `RPSPicker.tsx`, `GameLog.tsx`, `TimerRope.tsx` — **no changes needed**.

---

## Out of Scope

- Actual sprite images (still using emoji as placeholder)
- Sound effects
- Animation changes (AnimationManager stays as-is)
- Server or shared game logic changes

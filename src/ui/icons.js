// Pixel icons (from the code-drawn catalog) as data URLs for the DOM UI.
import { buildCatalog } from '../art/catalog.js';
import { iconPix } from '../art/iconset.js';

let icons = null;
export function icon(key, scale = 3) {
  if (!icons) icons = buildCatalog();
  const cache = (icon.cache = icon.cache || {});
  const k = key + scale;
  if (!cache[k]) cache[k] = icons[key].scaled(scale).toDataURL();
  return cache[k];
}
export const WEAPON_ICON = {
  training_sword: 'w_sword', training_claymore: 'w_claymore', training_spear: 'w_spear', training_bow: 'w_bow',
  basic_crossbow: 'w_crossbow', one_time_pistol: 'w_pistol', training_mage_book: 'w_book', training_staff: 'w_staff',
};

// ---------------------------------------------------------------- button glyphs (12x12 pixel art, shown at 3-5x)
import { Pix } from '../art/pixel.js';
const glyphCache = {};
export function glyph(name) {
  if (glyphCache[name]) return glyphCache[name];
  const p = new Pix(12, 12);
  const OUT = '#14101f';
  if (name === 'attack') {
    for (const [dx, c] of [[0, '#aab4c8'], [1, '#e8eefc']]) p.line(10 + dx - 1, 0 + dx, 4 + dx - 1, 6 + dx, c); // blade
    p.line(2, 4, 7, 9, '#b98a3e'); p.line(3, 4, 7, 8, '#e6c06a'); // guard
    p.line(4, 8, 1, 11, '#6b4a30'); p.line(5, 8, 2, 11, '#8a6240'); // grip
  } else if (name === 'dodge') {
    for (const dx of [0, 1]) for (const ox of [0, 5]) { p.line(1 + dx + ox, 2, 5 + dx + ox, 6, '#7fe0d0'); p.line(5 + dx + ox, 6, 1 + dx + ox, 10, '#7fe0d0'); }
  } else if (name === 'use') {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const d = Math.hypot(x - 5.5, y - 5.5);
      if (d > 3.4 && d < 4.8) p.set(x, y, '#ffe27a');
      else if (d < 1.6) p.set(x, y, '#fff2b0');
    }
    for (const [x, y] of [[5, 0], [6, 0], [5, 11], [6, 11], [0, 5], [0, 6], [11, 5], [11, 6]]) p.set(x, y, '#d1a85a');
  } else if (name === 'aura') {
    const rows = ['.....#.....', '....##.....', '....###..#.', '...####.##.', '..#####.##.', '..###y###..', '.###yyy###.', '.##yyyyy##.', '.##yyyyy##.', '..##yyy##..', '...#####...'];
    return (glyphCache[name] = Pix.fromRows(rows, { '#': '#ff7a3a', y: '#ffd27a' }).outline(OUT).toDataURL());
  } else if (name === 'menu') {
    for (const y of [2, 5, 8]) p.fillRect(1, y, 10, 2, '#f3ead8');
  } else if (name === 'swap') {
    for (const dx of [0, 1]) { p.line(1, 3 + dx, 9, 3 + dx, '#d1a85a'); p.line(10, 8 + dx, 2, 8 + dx, '#d1a85a'); }
    p.line(7, 1, 10, 3, '#d1a85a'); p.line(7, 6, 10, 4, '#d1a85a'); p.line(4, 6, 1, 8, '#d1a85a'); p.line(4, 11, 1, 9, '#d1a85a');
  }
  p.outline(OUT);
  return (glyphCache[name] = p.toDataURL());
}

// ---------------------------------------------------------------- skill glyphs (the picture says what the skill does)
// colour code: gold = power up, green = recover, blue = mana, red = offence, silver = protection
const R = (rows, pal) => Pix.fromRows(rows, pal).outline('#14101f');
const SKILL_ART = {
  buff: () => R(['............', '.....yy.....', '....yyyy....', '...yyyyyy...', '..yyyyyyyy..', '....yyyy....', '....yyyy....', '....yyyy....', '....yyyy....', '............', '............', '............'], { y: '#ffd24a' }),
  heal: () => R(['............', '....gggg....', '....gggg....', '....gggg....', '.gggggggggg.', '.gggggggggg.', '.gggggggggg.', '.gggggggggg.', '....gggg....', '....gggg....', '....gggg....', '............'], { g: '#6af08a' }),
  mana: () => R(['............', '.....bb.....', '....bbbb....', '....bbbb....', '...bbbbbb...', '..bbbbbbbb..', '..bbcbbbbb..', '..bbcbbbbb..', '..bbbbbbbb..', '...bbbbbb...', '....bbbb....', '............'], { b: '#4f8dff', c: '#bfe0ff' }),
  blood: () => R(['............', '.....rr.....', '....rrrr....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '..rrprrrrr..', '..rrprrrrr..', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '............'], { r: '#d4414f', p: '#ff9a9a' }),
  heart: () => R(['............', '..rrr..rrr..', '.rrrrrrrrrr.', '.rrprrrrrrr.', '.rrrrrrrrrr.', '.rrrrrrrrrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....rr.....', '............', '............'], { r: '#e0566a', p: '#ffb0b8' }),
  eye: () => R(['............', '............', '...wwwwww...', '..wwwwwwww..', '.wweeeeeeww.', 'wwweeekkeeww', 'wwweeekkeeww', '.wweeeeeeww.', '..wwwwwwww..', '...wwwwww...', '............', '............'], { w: '#f3ead8', e: '#9fd84a', k: '#14101f' }),
  hourglass: () => R(['............', '.ffffffffff.', '..fhhhhhhf..', '...fhhhhf...', '....fhhf....', '.....ff.....', '.....ff.....', '....fhhf....', '...fhhhhf...', '..fhhhhhhf..', '.ffffffffff.', '............'], { f: '#c9bfa8', h: '#ffd24a' }),
  mark: () => { const p = new Pix(12, 12); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - 5.5, y - 5.5); if ((d > 3.2 && d < 4.7) || d < 1.3) p.set(x, y, '#ff6a5a'); } for (const [x, y] of [[5, 0], [6, 0], [5, 11], [6, 11], [0, 5], [0, 6], [11, 5], [11, 6], [5, 1], [6, 1], [5, 10], [6, 10], [1, 5], [1, 6], [10, 5], [10, 6]]) p.set(x, y, '#ff6a5a'); return p.outline('#14101f'); },
  shield: () => { const p = new Pix(12, 12); const inside = (x, y) => y >= 1 && y <= 10 && Math.abs(x - 5.5) <= (y <= 6 ? 4.6 : 4.6 - (y - 6) * 1.05); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (inside(x, y)) p.set(x, y, inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1) ? '#7f98b8' : '#bcd0e8'); return p.outline('#14101f'); },
};
const SKILL_KIND = { buff: 'buff', heal: 'heal', mana: 'mana', mark: 'mark', predator: 'eye', cdcut: 'hourglass', secondwind: 'heart', bloodlust: 'blood', lifesteal: 'heart', shield: 'shield', berserk: null };
export function skillGlyph(kind) {
  const key = SKILL_KIND[kind] === undefined ? 'buff' : SKILL_KIND[kind];
  if (key === null) return glyph('aura');
  const ck = 'sk_' + key;
  if (!glyphCache[ck]) glyphCache[ck] = SKILL_ART[key]().toDataURL();
  return glyphCache[ck];
}

// ---------------------------------------------------------------- the 16x16 icon set (traits, stats, categories)
const setCache = {};
export function setIcon(key, scale = 2) {
  const k = key + '@' + scale;
  if (!setCache[k]) { const p = iconPix(key); setCache[k] = p ? p.scaled(scale).toDataURL() : ''; }
  return setCache[k];
}
export const traitIcon = (id, scale = 2) => setIcon(id, scale);
export const statIcon = (k, scale = 2) => setIcon('s_' + k, scale);
export const typeIcon = (type, scale = 2) => setIcon('t_' + type.toLowerCase(), scale);
// short skill names for the small HUD slots (7 letters or fewer)
export const SHORT = {
  iron_body: 'IRON', swift_wind: 'WIND', battle_instinct: 'BATTLE', marker: 'MARK', lightweight: 'LIGHT', fast_recovery: 'RECOVER',
  quick_learner: 'LEARN', mana_reserve: 'MANA', regression: 'REGRESS', glutton: 'GLUTTON', strong_endurance: 'ENDURE',
  focused_mind: 'FOCUS', iron_will: 'WILL', focus_shot: 'SHOT', mana_surge: 'SURGE', second_wind: 'BREATH', bloodlust: 'BLOOD',
  keen_senses: 'SENSES', false_predation: 'PREDATE', eagle_eye: 'EAGLE', arcane_affinity: 'ARCANE', lucky_constellation: 'LUCKY',
  blood_fangs: 'FANGS', fake_mana_heart: 'M.HEART', adaptive_growth: 'ADAPT', precision_aim: 'AIM', weapon_prodigy: 'PRODIGY',
};

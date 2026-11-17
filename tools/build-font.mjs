// Regenerates src/ui/pixel-ui.ttf from the glyphs in src/art/font.js (needs python3 + fonttools):
//   pip install fonttools && node tools/build-font.mjs
import { GLYPHS, LOWER } from '../src/art/font.js';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const all = {};
for (const [ch, rows] of Object.entries(GLYPHS)) all[ch] = [...rows, '.....', '.....'];
for (const [ch, rows] of Object.entries(LOWER)) all[ch] = rows;
all['{'] = ['..##.', '.#...', '.#...', '#....', '.#...', '.#...', '..##.', '.....', '.....'];
all['}'] = ['.##..', '...#.', '...#.', '....#', '...#.', '...#.', '.##..', '.....', '.....'];
writeFileSync('tools/glyphs.json', JSON.stringify(all));
execSync('python3 tools/build-font.py tools/glyphs.json src/ui/pixel-ui.ttf', { stdio: 'inherit' });

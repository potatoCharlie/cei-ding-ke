import { describe, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { simulateBattle } from './battle-simulator.js';
import { parseScriptFile } from './script-parser.js';

const scenarioDir = new URL('./scenarios', import.meta.url).pathname;
const files = readdirSync(scenarioDir).filter(f => f.endsWith('.txt')).sort();

for (const file of files) {
  describe(file.replace('.txt', ''), () => {
    const content = readFileSync(join(scenarioDir, file), 'utf-8');
    const scripts = parseScriptFile(content);

    for (const script of scripts) {
      it(script.name ?? 'unnamed scenario', () => {
        simulateBattle(script);
      });
    }
  });
}

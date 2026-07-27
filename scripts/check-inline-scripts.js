'use strict';

const { readFileSync } = require('node:fs');
const { Script } = require('node:vm');

const htmlFiles = [
  'index.html',
  'backyard_olympics_team_bracket_v2.html',
  'backyard_olympics_full-1.html'
];

for (const file of ['app-core.js', 'app-ui.js']) {
  new Script(readFileSync(file, 'utf8'), { filename: file });
  console.log(`Syntax OK: ${file}`);
}

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  scripts.forEach((match, index) => new Script(match[1], { filename: `${file}#inline-${index + 1}` }));
  console.log(`Syntax OK: ${file} (${scripts.length} inline scripts)`);
}

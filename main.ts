// Neon Harbor: Solmaris Heat — make.fun gta6-01 entry program (Node 22, stdlib only).
//
// The game itself is the static site in game/ (open game/index.html in a browser and
// play; no build step, no network). This program is the hand-in: it copies game/ and
// screenshots/ into the output directory and writes dossier.json there with the
// vendored make.fun library, so the dossier is exactly the one the grader rebuilds.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's published caps for this bounty, handed to the dossier builder so the
// entry refuses itself rather than handing in something the scorer would refuse.
const DOSSIER_CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1_000,
};

mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });

const shotsFrom = join(root, 'screenshots');
if (existsSync(shotsFrom)) {
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  cpSync(shotsFrom, join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, DOSSIER_CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Solmaris Heat handed in: ${dossier.length} bytes of dossier at ${outDir}`);

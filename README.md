# gta6 — Neon Harbor: Solmaris Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/keen-comet-10/gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/keen-comet-10/gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor: Solmaris Heat** is an original top-down open-world crime game that runs entirely in the browser — pure vanilla JavaScript and Canvas, no dependencies, no build step. Cruise a neon-drenched port city of twelve avenues and twelve streets: steal any car, run four story jobs for Marlo Venn of the Velvet Anchor (a pier pickup, a wrecking spree, a hot escape, a three-drop finale), work taxi fares between jobs, and manage a five-star wanted level as Solmaris PD gives chase, pins you, and impounds your ride. Traffic, pedestrians, police AI, a harbour with piers and boats, a full HUD with a live minimap, busted/wasted flows, progress saving, and a WebAudio synth for engines, sirens and paydays — all in `game/`, drawn fresh from its own code.

**Controls:** WASD / arrows to move and drive · E to enter or leave a car · SPACE to swing (or handbrake) · F to take the job at the Anchor · SHIFT to run · P to pause · M to mute.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # hand-in: copies game/ + screenshots/ to out/ and writes out/dossier.json
python3 -m http.server -d game 8080                   # play: serve game/ statically, then open http://localhost:8080
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=rmz1atyq&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

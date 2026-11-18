// missions.js — the story of Solmaris Heat, told in four jobs for the Velvet
// Anchor's fixer, plus an endless taxi-fare side hustle. A MissionDirector owns
// the offer/active/complete flow; the game feeds it positions and events and
// renders whatever target it names.

export const GIVER = 'Marlo Venn, fixer of the Velvet Anchor';

const STORY = [
  {
    id: 'first-run',
    title: 'First Run',
    brief: 'A crate is waiting at Pier Nine. Pick it up and bring it back to the Velvet Anchor.',
    reward: 400,
    steps: [
      { kind: 'pickup', at: 'dockPoint', label: 'Pick up the crate at Pier Nine', dwell: 1.6 },
      { kind: 'goto', at: 'club', label: 'Deliver to the Velvet Anchor', radius: 70 },
    ],
  },
  {
    id: 'neon-rampage',
    title: 'Neon Rampage',
    brief: 'A rival crew needs a message. Wreck 6 of their cars anywhere in Solmaris.',
    reward: 700,
    steps: [
      { kind: 'wrecks', count: 6, label: 'Wreck rival cars', time: 220 },
    ],
  },
  {
    id: 'hot-tail',
    title: 'Hot Tail',
    brief: 'The drop went bad and the PD has your face. Lose yourself at the Bahia Flats lockup — arrive hot, arrive alive.',
    reward: 900,
    startHeat: 310,
    steps: [
      { kind: 'goto', at: 'safehouse', label: 'Reach the Bahia Flats lockup', radius: 76, heatFloor: 230 },
    ],
  },
  {
    id: 'solmaris-finale',
    title: 'Solmaris Finale',
    brief: 'Three drops, one night, no questions: Mercado, the Old Cannery, then home to the Anchor before the clock dies.',
    reward: 1500,
    steps: [
      { kind: 'goto', at: 'market', label: 'Drop one: Mercado Nuevo', radius: 70, legTime: 120 },
      { kind: 'goto', at: 'cannery', label: 'Drop two: the Old Cannery', radius: 70, legTime: 120 },
      { kind: 'goto', at: 'club', label: 'Final drop: the Velvet Anchor', radius: 70, legTime: 110 },
    ],
  },
];

// Extra fixed points missions reference by name.
const EXTRA_POINTS = {
  cannery: { x: 1650, y: 2760 },
};

export class MissionDirector {
  constructor(world) {
    this.world = world;
    this.index = 0;            // next story mission
    this.active = null;        // {def, stepIdx, stepTime, wrecks, dwell}
    this.storyDone = false;
    this.fare = null;          // {phase:'pickup'|'drop', x, y, pay}
    this.offerCd = 0;
  }

  point(name) {
    if (name === 'cannery') return EXTRA_POINTS.cannery;
    return this.world[name];
  }

  currentOffer() {
    if (this.active || this.storyDone || this.index >= STORY.length) return null;
    return STORY[this.index];
  }

  accept(g) {
    const def = this.currentOffer();
    if (!def) return;
    this.active = { def, stepIdx: 0, stepTime: 0, wrecks: 0, dwell: 0 };
    if (def.startHeat) g.setHeat(def.startHeat);
    g.banner(def.title, def.brief);
    g.sfxMission();
  }

  fail(g, why) {
    if (!this.active) return;
    g.banner('Job failed', why);
    g.sfxFail();
    this.active = null;
    this.offerCd = 6;
  }

  complete(g) {
    const def = this.active.def;
    g.addCash(def.reward);
    g.banner(`${def.title} — complete`, `+$${def.reward} from ${GIVER.split(',')[0]}`);
    g.sfxMission();
    this.active = null;
    this.index++;
    this.offerCd = 8;
    if (this.index >= STORY.length) {
      this.storyDone = true;
      g.onStoryComplete();
    }
    g.save();
  }

  currentTarget() {
    if (this.active) {
      const step = this.active.def.steps[this.active.stepIdx];
      if (step.kind === 'wrecks') return null;
      const p = this.point(step.at);
      return { x: p.x, y: p.y, label: step.label };
    }
    if (this.fare) return { x: this.fare.x, y: this.fare.y, label: this.fare.phase === 'pickup' ? 'Pick up the fare' : 'Drop off the fare' };
    const offer = this.currentOffer();
    if (offer && this.offerCd <= 0) return { x: this.world.club.x, y: this.world.club.y, label: `${offer.title} — see Marlo at the Anchor` };
    return null;
  }

  // The game reports a traffic car the player just wrecked.
  onPlayerWreck() {
    if (this.active && this.active.def.steps[this.active.stepIdx].kind === 'wrecks') {
      this.active.wrecks++;
    }
  }

  update(dt, g) {
    if (this.offerCd > 0) this.offerCd -= dt;
    const a = this.active;
    if (!a) { this.updateFare(dt, g); return; }
    const step = a.def.steps[a.stepIdx];
    a.stepTime += dt;

    if (step.heatFloor) g.setHeat(Math.max(g.heat, step.heatFloor));
    if (step.time && a.stepTime > step.time) return this.fail(g, 'Out of time. Marlo shrugs: "Traffic was murder."');
    if (step.legTime && a.stepTime > step.legTime) return this.fail(g, 'Too slow — the buyer walked.');

    if (step.kind === 'wrecks') {
      if (a.wrecks >= step.count) return this.advance(g);
      return;
    }
    const p = this.point(step.at);
    const pos = g.playerPos();
    const d = Math.hypot(pos.x - p.x, pos.y - p.y);
    const radius = step.radius || 64;
    if (step.kind === 'pickup') {
      if (d < radius && g.playerSpeed() < 14) {
        a.dwell += dt;
        g.setProgress(a.dwell / step.dwell, 'Loading the crate…');
        if (a.dwell >= step.dwell) { g.sfxPickup(); return this.advance(g); }
      } else a.dwell = Math.max(0, a.dwell - dt * 2);
      return;
    }
    if (d < radius) return this.advance(g);
  }

  advance(g) {
    const a = this.active;
    a.stepIdx++;
    a.stepTime = 0; a.dwell = 0; a.wrecks = 0;
    if (a.stepIdx >= a.def.steps.length) return this.complete(g);
    const step = a.def.steps[a.stepIdx];
    g.banner(a.def.title, step.label);
    g.sfxPickup();
  }

  // Fares: a repeatable pickup/drop loop that pays by distance, only offered
  // while no story job is active.
  updateFare(dt, g) {
    if (!this.fare) {
      // Nobody flags down a driver the PD is actively hunting.
      if (g.heat < 200 && g.rng.chance(dt * 0.05) && g.playerInCar()) {
        const spots = g.roadsidePoints();
        if (spots.length) {
          const s = g.rng.pick(spots);
          this.fare = { phase: 'pickup', x: s.x, y: s.y, pay: 0 };
        }
      }
      return;
    }
    const pos = g.playerPos();
    const d = Math.hypot(pos.x - this.fare.x, pos.y - this.fare.y);
    if (d > 900) { this.fare = null; return; } // wandered off: fare gives up
    if (d < 56 && g.playerSpeed() < 14) {
      if (this.fare.phase === 'pickup') {
        const drops = g.roadsidePoints().filter((p) => Math.hypot(p.x - pos.x, p.y - pos.y) > 700);
        if (!drops.length) { this.fare = null; return; }
        const drop = g.rng.pick(drops);
        this.fare = { phase: 'drop', x: drop.x, y: drop.y, pay: Math.round(Math.hypot(drop.x - pos.x, drop.y - pos.y) / 9) };
        g.banner('Fare aboard', `Take them across town — $${this.fare.pay} on the meter.`);
        g.sfxPickup();
      } else {
        g.addCash(this.fare.pay);
        g.banner('Fare paid', `+$${this.fare.pay}. The city keeps moving.`);
        g.sfxCash();
        this.fare = null;
      }
    }
  }
}

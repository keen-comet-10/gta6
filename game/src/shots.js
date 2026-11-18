// shots.js — stages deterministic scenes for the entry screenshots, selected
// with ?shot=<name>&seed=<n>. The game itself is untouched by this: staging
// only arranges the opening state (a chase, a pickup at the pier, a stroll
// through Velvet Row) and lets the normal loop run, so every capture is a real
// render of live gameplay.

import { CITY } from './config.js';
import { makeCar } from './vehicles.js';

function givePlayerCar(g, x, y, angle, color) {
  const car = makeCar(x, y, angle, color);
  car.driver = 'player';
  car.speed = 0;
  g.cars.push(car);
  g.player.car = car;
  g.player.x = x; g.player.y = y; g.player.angle = angle;
  return car;
}

function snapCamera(g) {
  g.camera.x = g.player.x;
  g.camera.y = g.player.y;
}

export function stageShot(g, name) {
  if (name === 'start' || !name) return; // title screen, as the game opens
  g.state = 'play';

  if (name === 'chase') {
    // Mid-pursuit in Centro: three stars, PD on the tail, a delivery to finish.
    const car = givePlayerCar(g, 1650, 1650, 0, '#d94f30');
    car.speed = 215;
    g.director.accept(g.hooks);
    if (g.director.active) g.director.active.stepIdx = 1; // on the delivery leg
    g.setHeat(265);
    g.cash = 850;
    snapCamera(g);
  } else if (name === 'foot') {
    // On foot in Velvet Row at dusk, a job waiting at the Anchor.
    g.player.x = 470; g.player.y = 560; g.player.angle = -0.6;
    g.director.offerCd = 0;
    g.cash = 240;
    snapCamera(g);
  } else if (name === 'docks') {
    // At Pier Nine with the crate run accepted, harbour behind, city ahead.
    const car = givePlayerCar(g, CITY.waterX + 60, 1650, Math.PI, '#3f7fbf');
    car.speed = 40;
    g.director.accept(g.hooks);
    g.cash = 410;
    snapCamera(g);
  }
}

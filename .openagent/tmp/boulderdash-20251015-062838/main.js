import { GameEngine } from './game/engine.js';
import { createRenderer } from './game/renderer.js';
import { createAssets } from './game/assets.js';
import { createWorld, TILE } from './game/world.js';
import { LEVELS } from './game/levels.js';
import { createAudio } from './game/audio.js';
import './game/crt.js';

const canvas = document.getElementById('game');
const hudGems = document.getElementById('hud-gems');
const hudTime = document.getElementById('hud-time');
const hudScore = document.getElementById('hud-score');
const hudLevel = document.getElementById('hud-level');
const hudMsg = document.getElementById('hud-msg');

const assets = createAssets();
const audio = createAudio();
const renderer = createRenderer(canvas, assets);

let levelIndex = 0;
let world = createWorld(LEVELS[levelIndex]);

function updateHUD() {
  hudGems.textContent = `Gems: ${world.collected}/${world.gemsRequired}`;
  hudTime.textContent = `Time: ${String(Math.max(0, Math.floor(world.timeLeft))).padStart(3,'0')}`;
  hudScore.textContent = `Score: ${String(world.score).padStart(6,'0')}`;
  hudLevel.textContent = `L${levelIndex + 1}`;
}

function onEvent(evt, payload) {
  if (evt === 'collect') audio.collect();
  if (evt === 'push') audio.push();
  if (evt === 'exit-open') audio.exitOpen();
  if (evt === 'win') audio.win();
  if (evt === 'die') audio.die();
}

const engine = new GameEngine(world, renderer, onEvent);
engine.onRestart = () => {
  world = createWorld(LEVELS[levelIndex]);
  engine.setWorld(world);
};
engine.onNextLevel = () => {
  levelIndex = (levelIndex + 1) % LEVELS.length;
  world = createWorld(LEVELS[levelIndex]);
  engine.setWorld(world);
};

function loopFrame(t) {
  engine.frame(t);
  updateHUD();
  requestAnimationFrame(loopFrame);
}

updateHUD();
requestAnimationFrame(loopFrame);

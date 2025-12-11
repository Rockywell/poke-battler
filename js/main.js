import { randomInt } from "./utlils.mjs";
import Pokemon from "./Pokemon.mjs";
import PokemonTrainer from "./PokemonTrainer.mjs";
import BattleUI from "./BattleUI.mjs";
import BattleController from "./BattleController.mjs";
import PokeApi from "./PokeApi.mjs";

// The ID range of Pokemon Black and White 2.
const BWIdRange = {
    min: 1,
    max: 649,
    get random() { return randomInt(this.min, this.max) }
}

let player = new PokemonTrainer(
    "Red",
    [
        new Pokemon(BWIdRange.random),
        new Pokemon(BWIdRange.random),
        new Pokemon(BWIdRange.random),
        new Pokemon("Wailord", { level: 65 })
    ]
);
let opponent = new PokemonTrainer(
    "Gary",
    [
        new Pokemon(BWIdRange.random, { level: 65 }),
        new Pokemon("Arceus", { level: 65 }),
    ]
);

let trainers = Promise.all([player.init(), opponent.init()]);

const ui = new BattleUI(
    document.querySelector(".main-card"),
    player,
    opponent
);

const controller = new BattleController(
    player,
    opponent,
    ui
);

await trainers;
controller.init();

PokeApi.saveCaches();
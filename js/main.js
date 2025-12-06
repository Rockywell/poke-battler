import Pokemon from "./Pokemon.mjs";
import PokemonTrainer from "./PokemonTrainer.mjs";
import BattleUI from "./BattleUI.mjs";
import BattleController from "./BattleController.mjs";

let player = new PokemonTrainer(
    "Red",
    [
        new Pokemon("Wailord"),
        new Pokemon("Charizard"),
        new Pokemon("Lucario")
    ]
);
let opponent = new PokemonTrainer(
    "Gary",
    [
        new Pokemon("Arceus", { level: 70, shiny: true }),
        new Pokemon("Onix", { level: 80, shiny: true })
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

console.log(ui);

console.table(player.activePokemon.moves);
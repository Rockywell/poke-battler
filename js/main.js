import Pokemon from "./pokemon.mjs";
import PokemonTrainer from "./pokemonTrainer.mjs";
import BattleUI from "./battle-ui.mjs";
import BattleController from "./battle-controller.mjs";

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
        new Pokemon("Arceus", { level: 80, shiny: true })
    ]
);

let trainers = Promise.all([player.init(), opponent.init()]);

// console.table(player.activePokemon.getMoveSummary());
// console.table(opponent.activePokemon.getMoveSummary());

const ui = new BattleUI(
    document.querySelector(".main-card"),
    player,
    opponent
);

console.log(ui);

const controller = new BattleController(
    player,
    opponent,
    ui
);

await trainers;
controller.init();
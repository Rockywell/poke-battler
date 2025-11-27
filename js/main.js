import { fitScale, capFirst } from "./utlils.mjs";
import Pokemon from "./pokemon.mjs";

const maxViewDimensions = 200;
const language = document.documentElement.lang ?? "en";

let playerPokemon = new Pokemon("Wailord");
let computerPokemon = new Pokemon("Onix");

await Promise.all([playerPokemon.init(), computerPokemon.init()]);

const pokemon = [playerPokemon, computerPokemon];

let zoom = fitScale(maxViewDimensions, playerPokemon.getSpriteDimensions(), computerPokemon.getSpriteDimensions());

console.log("Zoom:", zoom);

let animations = {
    player: playerPokemon.getAnimations(),
    computer: computerPokemon.getAnimations()
};

// console.log(animations);

const playerSprite = document.querySelector(".player-pokemon .sprite-placeholder");
const computerSprite = document.querySelector(".computer-pokemon .sprite-placeholder");

let spritesPlaceHolders = document.querySelectorAll(".sprite-placeholder");
let pokemonTitles = document.querySelectorAll(".pokemon-title");
let levelLabels = document.querySelectorAll(".level-label");
let hpLabels = document.querySelectorAll(".hp-label");


pokemon.forEach((p, index) => {
    let animations = p.getAnimations();

    spritesPlaceHolders[index].innerHTML = `<img src="${animations["front_default"]}" height="${p.getSpriteDimensions() * zoom}px">`;

    pokemonTitles[index].textContent = capFirst(p.pokemon.name);
    levelLabels[index].textContent = `Lv: ${p.level}`;
    hpLabels[index].textContent = `${p.stats.hp}/${p.defaultStats.hp}`;

    console.log(p);
});


// Extreemely messy but functional don't worry about it.
let moveTiles = document.querySelectorAll(".move-tile");

playerPokemon.moves.forEach((move, index) => {
    let descriptions = move.flavor_text_entries.filter(entry => entry.language.name == language);
    moveTiles[index].innerHTML = `<span>${capFirst(move.name)}</span><p>${descriptions[descriptions.length - 1].flavor_text}</p>`;



    moveTiles[index].addEventListener("click", (e) => {
        let imgs = [spritesPlaceHolders[0].querySelector("img"), spritesPlaceHolders[1].querySelector("img")];

        imgs[0].classList.add("attack");
        imgs[1].classList.add("hit");

        imgs.forEach(img => {
            img.addEventListener("animationend", () => {
                img.classList.remove("attack", "hit");
            })
        });

    })
});

//remove the mirror for the player
// playerSprite.innerHTML = `< img src = "${animations.player["back_default"]}" height = "${playerPokemon.getSpriteDimensions() * zoom}px" > `;
// computerSprite.innerHTML = `< img src = "${animations.computer["front_default"]}" height = "${computerPokemon.getSpriteDimensions() * zoom}px" > `;
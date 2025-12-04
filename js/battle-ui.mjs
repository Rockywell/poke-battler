import { fitScale, capFirst, delay } from "./utlils.mjs";

function playAnimationOnce(element, animationClass) {
    return new Promise(resolve => {
        element.classList.add(animationClass);
        element.addEventListener(
            "animationend",
            () => {
                element.classList.remove(animationClass);
                resolve();
            },
            { once: true }
        );
    });
}

export default class BattleUI {
    maxViewDimensions = 200;
    language = document.documentElement.lang ?? "en";

    constructor(rootElement, player, opponent) {
        this.root = rootElement;

        this.cards = this.root.querySelectorAll(".pokemon-card");
        this.playerCard = this.root.querySelector(".pokemon-card.player-pokemon");
        this.opponentCard = this.root.querySelector(".pokemon-card.computer-pokemon");
        this.sprites = this.root.querySelectorAll(".sprite-placeholder");
        this.moves = this.root.querySelectorAll(".move-tile");

        this.player = player;
        this.opponent = opponent;
    }

    getCardElements(card) {
        return {
            get title() { return card.querySelector(".pokemon-title") },
            get sprite() { return card.querySelector(".sprite-placeholder") },
            get level() { return card.querySelector(".level-label") },
            get hpBar() { return card.querySelector(".hp-bar") }
        }
    }

    get zoom() {
        // console.log("Zoom");
        return fitScale(
            this.maxViewDimensions,
            this.player.activePokemon.getSpriteDimensions(),
            this.opponent.activePokemon.getSpriteDimensions()
        );
    }

    renderAll(pokemonList) {
        pokemonList.forEach((pokemon, index) => {
            const card = this.cards[index];
            this.spawnPokemon(pokemon, card);
        });
    }

    updateTitle(pokemon, titleElement) {
        titleElement.textContent = capFirst(pokemon.name);
    }

    updateSprite(pokemon, spriteElement, animation) {

        if (!animation) {
            const animations = pokemon.getAnimations();
            animation = animations.front_default ?? animations.back_default ?? null;
        }

        if (!animation) return;

        spriteElement.alt = pokemon.name;
        spriteElement.src = animation;
        spriteElement.height = pokemon.getSpriteDimensions() * this.zoom;
    }

    updateLevel(pokemon, levelElement) {
        levelElement.textContent = `Lv: ${pokemon.level}`;
    }

    updateHp(pokemon, hpBarElement) {
        const hpLabelElement = hpBarElement.querySelector(".hp-label");

        const hpRatio = Math.max(0, pokemon.stats.hp / pokemon.defaultStats.hp);
        hpBarElement.style.setProperty("--hp-ratio", hpRatio);

        if (hpLabelElement) {
            hpLabelElement.textContent = `${pokemon.stats.hp}/${pokemon.defaultStats.hp}`;
        }
    }

    updatePokemonCard(pokemon, card) {
        const elements = this.getCardElements(card);

        this.updateTitle(pokemon, elements.title);
        this.updateSprite(pokemon, elements.sprite);
        this.updateLevel(pokemon, elements.level);
        this.updateHp(pokemon, elements.hpBar);
    }

    async spawnPokemon(pokemon, card) {


        let sprite = this.getCardElements(card).sprite;


        this.disableMoves();


        // Resets the source so animations can play fresh;
        sprite.src = "";
        this.updatePokemonCard(pokemon, card);


        const isPlayer = card === this.playerCard;
        const otherTrainer = isPlayer ? this.opponent : this.player;
        const otherSprite = isPlayer ? this.opponentCard.querySelector(".sprite-placeholder") : this.playerCard.querySelector(".sprite-placeholder");
        // Updates zoom values on sprite;
        this.updateSprite(otherTrainer.activePokemon, otherSprite);


        await playAnimationOnce(sprite, "spawn");

        this.enableMoves();
    }

    setPlayerMoves(moves, onClick) {
        moves.forEach((move, index) => {
            const moveTile = this.moves[index];
            if (!moveTile) return;

            const descriptions = move.flavor_text_entries.filter(
                entry => entry.language.name === this.language
            );
            const lastDesc = descriptions[descriptions.length - 1];

            const type = move.type?.name ?? "unknown";
            const damageClass = move.damage_class?.name ?? "status";
            const power = move.power ?? "—";
            const accuracy = move.accuracy ?? "—";
            const ppMax = move.pp ?? "—";
            const ppCurrent = move.currentPP ?? ppMax; // if you later track PP, attach it here

            // Optional: nicer labels
            const dmgClassLabel = {
                physical: "Physical",
                special: "Special",
                status: "Status",
            }[damageClass] ?? capFirst(damageClass);

            moveTile.classList.add("move-card"); // styling hook

            moveTile.innerHTML = `
            <div class="move-header">
                <span class="move-name">${capFirst(move.name)}</span>
                <span class="move-type move-type--${type}">
                    ${type.toUpperCase()}
                </span>
            </div>

            <div class="move-meta">
                <span class="move-stat">
                    <span class="label">Pow</span>
                    <span class="value">${power}</span>
                </span>
                <span class="move-stat">
                    <span class="label">Acc</span>
                    <span class="value">${accuracy}</span>
                </span>
                <span class="move-stat">
                    <span class="label">PP</span>
                    <span class="value">${ppCurrent}/${ppMax}</span>
                </span>
                <span class="move-stat move-damage-class move-damage-class--${damageClass}">
                    <span class="label">Cat</span>
                    <span class="value">${dmgClassLabel}</span>
                </span>
            </div>

            <p class="move-desc">
                ${(lastDesc?.flavor_text ?? "").replace(/\f/g, " ")}
            </p>
        `;

            moveTile.onclick = (e) => onClick(move, moveTile);
        });
    }


    disableMoves() {
        this.moves.forEach(btn => btn.disabled = true);
    }

    enableMoves() {
        this.moves.forEach(btn => btn.disabled = false);
    }

    async playUseMoveAnimation(target, userCard, targetCard, moveResults) {
        // moveName, user, target, userCard, targetCard
        this.disableMoves();

        const userSprite = userCard.querySelector(".sprite-placeholder");
        const targetSprite = targetCard.querySelector(".sprite-placeholder");
        const targetHpBar = targetCard.querySelector(".hp-bar");

        const sprites = [userSprite, targetSprite];


        let attackAnimation = playAnimationOnce(userSprite, "attack");
        // let hitAnimation;
        // let faintAnimation;

        await delay(690);

        if (moveResults.hit && moveResults.damage > 0) {

            this.updateHp(target, targetHpBar);
            await playAnimationOnce(targetSprite, "hit");

            if (target.isFainted) await playAnimationOnce(targetSprite, "faint")
        }

        await attackAnimation;
        // await hitAnimation;
        // await faintAnimation;


        this.enableMoves();
    }
}
import { fitScale, capFirst, delay, getLocalStorage } from "./utlils.mjs";
import { WEATHER_TYPE } from "./Weather.mjs";

async function playAnimationOnce(element, animationClass) {
    return new Promise(resolve => {
        // Remove it first to allow retriggering the animation
        element.classList.remove(animationClass);

        // Force reflow so the browser registers the removal
        void element.offsetWidth;

        const handleEnd = (event) => {
            // Ignore animations from child elements
            if (event.target !== element) return;

            element.classList.remove(animationClass);
            element.removeEventListener("animationend", handleEnd);
            element.removeEventListener("webkitAnimationEnd", handleEnd);
            resolve();
        };

        // Adds an event for each animation used
        element.addEventListener("animationend", handleEnd, { once: false });
        element.addEventListener("webkitAnimationEnd", handleEnd, { once: false });

        element.classList.add(animationClass);
    });
}

export default class BattleUI {
    maxViewDimensions = 175;
    language = document.documentElement.lang ?? "en";

    constructor(rootElement, player, opponent) {
        this.root = rootElement;

        this.weather = this.root.querySelector(".weather");
        this.battleRecord = this.root.querySelector(".battle-record");
        this.battleLog = this.root.querySelector(".battle-log");
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
        return fitScale(
            this.maxViewDimensions,
            this.player.activePokemon.getSpriteDimensions(),
            this.opponent.activePokemon.getSpriteDimensions()
        );
    }

    renderAll(pokemonList) {
        this.updateWeather();
        this.updateBattleRecord();
        this.updateBattleLog(`The weather is ${WEATHER_TYPE}`);

        pokemonList.forEach((pokemon, index) => {
            const card = this.cards[index];
            this.spawnPokemon(pokemon, card);
        });
    }

    updateWeather(text = WEATHER_TYPE) {
        const label = this.weather.querySelector(".weather-label");

        if (label) label.textContent = capFirst(text);
    }

    updateTitle(pokemon, titleElement) {
        titleElement.textContent = capFirst(pokemon.name);
        titleElement.classList = `pokemon-title status--${pokemon.status}`
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

        const hpRatio = Math.max(0, pokemon.stats.hp / pokemon.defaultStats.hp) || 0;
        hpBarElement.style.setProperty("--hp-ratio", hpRatio);

        if (hpLabelElement) {
            hpLabelElement.textContent = `${pokemon.stats.hp}/${pokemon.defaultStats.hp}`;
        }
    }

    updateBattleRecord() {
        let wins = this.battleRecord.querySelector(".wins");
        let losses = this.battleRecord.querySelector(".losses");

        wins.textContent = getLocalStorage("wins") ?? 0;
        losses.textContent = getLocalStorage("losses") ?? 0;
    }

    async updateBattleLog(text, duration = 1000) {
        this.battleLog.textContent = text;

        // Option 1: simple show/hide
        this.battleLog.classList.add("battle-log-visible");
        setTimeout(() => {
            this.battleLog.classList.remove("battle-log-visible");
        }, duration);

        // Option 2: use animation class instead:
        await playAnimationOnce(this.battleLog, "battle-log-bubble")
    }

    async sendBattleLogs(messages) {
        if (messages.length >= 1) {
            let message = messages.join(" ");
            this.updateBattleLog(capFirst(message));
        }

        // messages.forEach((message) => {
        //     this.updateBattleLog(message);
        // })
    }



    updatePokemonCard(pokemon, card) {
        const elements = this.getCardElements(card);

        this.updateTitle(pokemon, elements.title);
        this.updateSprite(pokemon, elements.sprite);
        this.updateLevel(pokemon, elements.level);
        this.updateHp(pokemon, elements.hpBar);

        // const isPlayer = card === this.playerCard;
        // this.updateMove()
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

            const lastDesc = move.getDescription(this.language);


            const type = move.type ?? "unknown";
            const damageClass = move.damageClass ?? "status";
            const power = move.power ?? "—";
            const accuracy = move.accuracy ?? "—";
            const ppMax = move.raw.pp ?? "—";
            const ppCurrent = move.pp ?? ppMax;

            // Damage Labels
            const dmgClassLabel = capFirst(damageClass);

            moveTile.classList = `move-tile type--${type}`;

            moveTile.innerHTML = `
            <div class="move-header">
                <span class="move-name">${capFirst(move.name)}</span>
                <span class="move-type">
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
                ${(lastDesc ?? "").replace(/\f/g, " ")}
            </p>
        `;

            // Sets the event listeners.
            moveTile.onclick = (e) => onClick(move, moveTile);
        });
    }


    disableMoves() {
        this.moves.forEach(btn => btn.disabled = true);
    }

    enableMoves() {
        this.moves.forEach(btn => btn.disabled = false);
    }

    // Plays animation for the one inflicted with a status effect.
    async playStatusAnimation(inflicted, inflictedCard, statusResults) {
        // this.disableMoves();

        const inflictedSprite = inflictedCard.querySelector(".sprite-placeholder");
        const inflictedTitle = inflictedCard.querySelector(".pokemon-title")
        const inflictedHpBar = inflictedCard.querySelector(".hp-bar");

        let statusAnimation = playAnimationOnce(inflictedSprite, "status");

        this.updateHp(inflicted, inflictedHpBar);
        this.updateTitle(inflicted, inflictedTitle);

        await statusAnimation;

        if (inflicted.isFainted) await this.playFaintAnimation(inflicted, inflictedSprite);
        // this.enableMoves();

    }

    async playStatChangeAnimation(affectedCard, statResults) {
        // this.disableMoves();
        const inflictedSprite = affectedCard.querySelector(".sprite-placeholder");

        let animationName = statResults.amount > 0 ? "stat-up" : "stat-down";

        await playAnimationOnce(inflictedSprite, animationName);
        // this.enableMoves();

    }

    async playUseMoveAnimation(user, target, userCard, targetCard, moveResults) {
        // this.disableMoves();

        const userSprite = userCard.querySelector(".sprite-placeholder");
        const userHpBar = userCard.querySelector(".hp-bar");
        const targetSprite = targetCard.querySelector(".sprite-placeholder");
        const targetHpBar = targetCard.querySelector(".hp-bar");

        const sprites = [userSprite, targetSprite];

        let attackAnimation;
        let statChangeAnimation;

        if (!moveResults.targetsSelf) {
            attackAnimation = playAnimationOnce(userSprite, "attack");

            await delay(690);
        }
        // let hitAnimation;
        // let faintAnimation;

        this.updateHp(user, userHpBar);

        let statChanges = moveResults.secondaryEffects.find((item) => item.type === "stat-change") ?? null;

        // Plays the stat-change animation if it exists.
        if (statChanges) {
            await attackAnimation;
            let statCard = statChanges.target == target ? targetCard : userCard;
            statChangeAnimation = this.playStatChangeAnimation(statCard, statChanges);
        }

        if (moveResults.hit && moveResults.damage > 0) {

            this.updateHp(target, targetHpBar);
            await playAnimationOnce(targetSprite, "hit");

            if (target.isFainted) await this.playFaintAnimation(target, targetSprite);
        }

        await attackAnimation;
        await statChangeAnimation;

        // this.enableMoves();
    }

    async playFaintAnimation(target, targetSprite) {
        await Promise.all([target.cry(), playAnimationOnce(targetSprite, "faint")]);
    }

    // Display the final Battle Message.
    replaceCardWithResultText(targetCard, message = "YOU WON!") {
        const spriteBox = targetCard.querySelector(".sprite-box");

        // Clear out the spriteBox.
        spriteBox.innerHTML = "";
        spriteBox.className = "sprite-box";

        // Create the result text element
        const resultElement = document.createElement("div");
        resultElement.className = "battle-result-text";
        resultElement.textContent = message;

        // Insert the results
        spriteBox.appendChild(resultElement);
    }
}
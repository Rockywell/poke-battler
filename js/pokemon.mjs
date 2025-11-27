import { getData, chance, clamp } from "./utlils.mjs";
import { IVManager, EVManager, statManager } from "./statManager.mjs";

// , getLocalStorage, setLocalStorage, addLocalStorage
// https://pokeapi.co/api/v2/pokemon/squirtle
// https://pokeapi.co/api/v2/pokemon-species/squirtle

export default class Pokemon {
    static api = "https://pokeapi.co/api/v2";

    static getPokemon = (pokemonName) =>
        getData(`${this.api}/pokemon/${pokemonName}`);

    static getNature = (nameOrId) =>
        getData(`${this.api}/nature/${nameOrId}`);

    static calculateNatureMultipliers({ increased_stat, decreased_stat }) {
        const mult = {
            hp: 1.0,
            attack: 1.0,
            defense: 1.0,
            spAttack: 1.0,
            spDefense: 1.0,
            speed: 1.0
        };

        const statMap = {
            attack: "attack",
            defense: "defense",
            "special-attack": "spAttack",
            "special-defense": "spDefense",
            speed: "speed"
        };

        const apply = (stat, value) => {
            if (!stat) return;
            const key = statMap[stat.name];
            if (key) mult[key] = value;
        };

        apply(increased_stat, 1.1);
        apply(decreased_stat, 0.9);

        return mult;
    }


    constructor(pokemonName = "pickachu", options = {}) {
        this.pokemonName = pokemonName;

        // raw API data
        this.pokemon = null;

        this.level = options?.level ?? 50;

        this.natureName = options.nature ?? "hardy";

        this.nature = {
            hp: 1.0,       // HP is always 1.0 in real games too
            attack: 1.0,
            defense: 1.0,
            spAttack: 1.0,
            spDefense: 1.0,
            speed: 1.0
        };

        this.iv = IVManager.create(options.iv);

        this.ev = EVManager.create(options.ev);



        // battle stats
        this.stats = {
            level: this.level,
            hp: 0,
            attack: 0,
            spAttack: 0,
            defense: 0,
            spDefense: 0,
            speed: 0
        }

        // list of FULL move data (from move endpoint)
        this.moves = new Array(4);

        Object.defineProperty(this.moves, 'length', {
            writable: false
        });
        Object.seal(this.moves);


    }

    /** Must be called (and awaited) once before using the instance */
    async init() {
        this.pokemon = await Pokemon.getPokemon(this.pokemonName);

        const apiNature = await Pokemon.getNature(this.natureName.toLowerCase());
        this.nature = Pokemon.calculateNatureMultipliers(apiNature);

        this.baseStats = Object.fromEntries(
            this.pokemon.stats.map((s) => [s.stat.name, s.base_stat])
        );

        // Base (unchanging) stats from PokéAPI
        this.defaultStats = statManager.create({
            iv: this.iv,
            ev: this.ev,
            nature: this.nature,
            level: this.level,
            hp: this.baseStats.hp,
            attack: this.baseStats.attack,
            spAttack: this.baseStats["special-attack"],
            defense: this.baseStats.defense,
            spDefense: this.baseStats["special-defense"],
            speed: this.baseStats.speed
        });

        this.stats = { ...this.defaultStats };
        // preload a few usable moves (4 by default)
        await this.loadRandomMoves(4);
    }

    getSpriteDimensions() {
        return this.pokemon.height * 7;
        // clamp(this.pokemon.height * 7, 10, 200);
    }
    /** Gen-V animated sprites if available */
    getAnimations() {
        return this.pokemon.sprites.versions["generation-v"]["black-white"].animated ?? this.pokemon.sprites;
    }

    /** Pick N random moves that actually have power + accuracy, then load full move data */
    async loadRandomMoves(count = 4) {
        // entries look like { move: { name, url }, version_group_details: [...] }
        const all = this.pokemon.moves;

        // filter out weird moves with no power (most status moves)
        // const candidates = all.filter((entry) => !!entry.move.url);

        // simple random shuffle [...candidates].
        const shuffled = all.sort(() => Math.random() - 0.5);

        const selected = shuffled.slice(0, count);

        const moveDataPromises = selected.map((entry) =>
            getData(entry.move.url)
        );

        const moveData = await Promise.all(moveDataPromises);


        this.moves = moveData;
        // keep only those that can actually “hit” something
        // this.moves = moveData.filter(
        //     (m) => m.power !== null && m.accuracy !== null
        // );
    }

    /** Get a FULL move object (power, accuracy, type, etc.) by name */
    // getMove(name) {
    //     return this.moves.find((m) => m.name === name);
    // }

    getMove(name) {
        let moves = this.pokemon.moves;
        // console.log(moves);

        let move = (moves.find(entry => entry.move.name == name)).move;


        return getData(move.url);
    }

    /** For UI: list move names + some basic info */
    getMoveSummary() {
        return this.moves.map((m) => ({
            name: m.name,
            type: m.type.name,
            power: m.power,
            accuracy: m.accuracy,
            damageClass: m.damage_class.name,
        }));
    }

    /** True if fainted */
    isFainted() {
        return this.currentHp <= 0;
    }

    /** Simple damage calculation using PokéAPI move + this/target stats */
    calculateDamage(target, move) {
        const isPhysical = move.damage_class.name === "physical";

        const attackStat = isPhysical ? this.attack : this.spAttack;
        const defenseStat = isPhysical ? target.defense : target.spDefense;

        const power = move.power ?? 40; // fallback just in case

        // VERY simplified Pokémon damage-ish formula
        const base =
            (((2 * this.level) / 5 + 2) * power * (attackStat / Math.max(1, defenseStat))) /
            50 +
            2;

        // clamp and randomize slightly
        const variation = 0.85 + Math.random() * 0.15; // 85–100%
        const dmg = Math.max(1, Math.floor(base * variation));

        return dmg;
    }

    /**
     * Use a move against a target Pokemon.
     * Returns a summary object so your UI can show what happened.
     */
    useMove(target, moveName) {
        const move = this.getMove(moveName);
        if (!move) {
            return {
                success: false,
                reason: `Move ${moveName} not found`,
            };
        }

        // accuracy check
        const hitRoll = Math.random() * 100;
        if (hitRoll > move.accuracy) {
            return {
                success: true,
                hit: false,
                move: move.name,
                damage: 0,
                targetHp: target.currentHp,
            };
        }

        const damage = this.calculateDamage(target, move);
        target.currentHp = Math.max(0, target.currentHp - damage);

        return {
            success: true,
            hit: true,
            move: move.name,
            damage,
            targetHp: target.currentHp,
            targetFainted: target.isFainted(),
        };
    }
}

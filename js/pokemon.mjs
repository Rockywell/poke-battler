import PokeApi from "./poke-api.mjs";
import { getData, chance, clamp } from "./utlils.mjs";
import { IVManager, EVManager, statManager } from "./statManager.mjs";

// , getLocalStorage, setLocalStorage, addLocalStorage

export default class Pokemon {
    static api = "https://pokeapi.co/api/v2";

    // Move Classes
    static async getTypeEffectiveness(moveType, targetTypes) {
        const dmg = (await PokeApi.getType(moveType)).damage_relations;

        let multiplier = 1;

        for (const targetType of targetTypes) {
            if (dmg.no_damage_to.some(t => t.name === targetType)) {
                multiplier *= 0;
            } else if (dmg.double_damage_to.some(t => t.name === targetType)) {
                multiplier *= 2;
            } else if (dmg.half_damage_to.some(t => t.name === targetType)) {
                multiplier *= 0.5;
            }
        }

        return multiplier;
    }

    static getCritChance(move) {
        // base stage 0 = 1/24
        let stage = move.meta?.crit_rate ?? 0; // 0, 1, 2, ...

        switch (stage) {
            case 0: return 1 / 24;
            case 1: return 1 / 8;
            case 2: return 1 / 2;
            default: return 1; // stage 3+: always crit
        }
    }

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
    };



    // Raw API data, fully dependent properties.
    species;
    id;
    types;

    constructor(speciesName = "pikachu", { name, ability, level = 50, status = null, nature = "hardy", shiny = false, iv, ev } = {}) {
        this.speciesName = speciesName;

        // Overridable semi-dependent properties.
        this.name = name ?? speciesName;
        this.ability = ability;

        // Overridable independent properties.
        this.level = level;
        this.status = status;
        this.natureName = nature
        this.shiny = shiny;

        this.nature = {
            hp: 1.0,       // HP is always 1.0 in real games too
            attack: 1.0,
            defense: 1.0,
            spAttack: 1.0,
            spDefense: 1.0,
            speed: 1.0
        };

        this.iv = IVManager.create(iv);
        this.ev = EVManager.create(ev);



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
        this.species = await PokeApi.getPokemon(this.speciesName);

        this.id = this.species.id;
        this.types = this.species.types.map(t => t.type.name);
        this.ability ??= this.species.abilities[0].ability.name;


        const apiNature = await PokeApi.getNature(this.natureName.toLowerCase());
        this.nature = Pokemon.calculateNatureMultipliers(apiNature);



        this.speciesStats = Object.fromEntries(
            this.species.stats.map((s) => [s.stat.name, s.base_stat])
        );

        // Base (unchanging) stats from PokéAPI
        this.defaultStats = statManager.create({
            iv: this.iv,
            ev: this.ev,
            nature: this.nature,
            level: this.level,
            hp: this.speciesStats.hp,
            attack: this.speciesStats.attack,
            spAttack: this.speciesStats["special-attack"],
            defense: this.speciesStats.defense,
            spDefense: this.speciesStats["special-defense"],
            speed: this.speciesStats.speed
        });

        this.stats = { ...this.defaultStats };
        // preload a few usable moves (4 by default)
        await this.loadRandomMoves(4);
    }

    get isFainted() {
        return this.stats.hp <= 0;
    }

    getSpriteDimensions() {
        return this.species.height * 7;
        // clamp(this.pokemon.height * 7, 10, 200);
    }
    /** Gen-V animated sprites if available */
    getAnimations() {
        return this.species.sprites.versions["generation-v"]["black-white"].animated ?? this.species.sprites;
    }

    /** Pick N random moves that actually have power + accuracy, then load full move data */
    async loadRandomMoves(count = 4) {
        // entries look like { move: { name, url }, version_group_details: [...] }
        const all = this.species.moves;

        // filter out weird moves with no power (most status moves)
        const candidates = all;//.filter((entry) => !!entry.move.url);

        // simple random shuffle [...candidates].
        const shuffled = candidates.sort(() => Math.random() - 0.5);

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
    getMove(name) {
        return this.moves.find((m) => m.name === name);
    }

    // getMove(name) {
    //     let moves = this.species.moves;
    //     // console.log(moves);

    //     let move = (moves.find(entry => entry.move.name == name)).move;


    //     return getData(move.url);
    // }

    /** For UI: list move names + some basic info */
    getMoveSummary() {
        return this.moves.map((m) => ({
            name: m.name,
            type: m.type.name,
            power: m.power,
            pp: m.pp,
            accuracy: m.accuracy,
            damageClass: m.damage_class.name,
        }));
    }


    async calculateDamage(target, move, field = { weather: "sunny" }) {
        const level = this.level;
        const power = move.power;

        const isPhysical = move.damage_class === "physical";

        const attack = isPhysical
            ? this.stats.attack
            : this.stats.spAttack;

        const defense = isPhysical
            ? target.stats.defense
            : target.stats.spDefense;

        // 1. Base damage
        // console.log("Lv:", level, "Pow:", power, "Atk:", attack, "Def:", defense);
        let baseDamage = Math.floor(
            Math.floor(
                Math.floor((2 * level) / 5 + 2) * power * (attack / defense)
            ) / 50
        ) + 2;

        // === Apply Modifiers ===

        // For Future Implementation WIP
        // 2. Target modifier (double battles)
        // modifier *= move.targetsMultiple ? 0.75 : 1;


        // 3. STAB
        const stabModifier = this.types.includes(move.type.name)
            ? 1.5
            : 1


        // 4. Burn
        const isBurned = this.status == "burned";
        const burnModifier = (isBurned && isPhysical && this.ability !== "guts")
            ? 0.5
            : 1


        // 5. Weather
        const weatherModifier = 1;
        if (field.weather === "rain") {
            if (move.type.name === "water") weatherModifier = 1.5;
            if (move.type.name === "fire") weatherModifier = 0.5;
        }
        if (field.weather === "sun") {
            if (move.type.name === "fire") weatherModifier = 1.5;
            if (move.type.name === "water") weatherModifier = 0.5;
        }


        // 6. Critical hit
        // Determines if the hit was critical.
        const isCrit = chance(Pokemon.getCritChance(move));
        const critModifier = isCrit
            ? 1.5
            : 1;

        // 7. Random           0.85—1.00
        const randomModifier = (85 + Math.floor(Math.random() * 16)) / 100;


        // 8. Type effectiveness  e.g. 2, 0.5, 4, 0, etc.
        const typeEffectiveness = await Pokemon.getTypeEffectiveness(move.type.name, target.types);


        // 9. Other modifiers omitted for simplicity

        const modifier = stabModifier * burnModifier * weatherModifier * critModifier * randomModifier;

        let damage = Math.floor(clamp(Math.floor(baseDamage * modifier), 1) * typeEffectiveness);
        // console.log("DMG", damage, "Mult", modifier);
        return { damage, isCrit, typeEffectiveness }
    }


    /**
     * Use a move against a target Pokemon.
     * Returns a summary object so your UI can show what happened.
     */
    async useMove(moveName, target) {
        const move = this.getMove(moveName);
        if (!move) {
            return {
                success: false,
                reason: `Move ${moveName} not found`,
            };
        }

        // accuracy check
        let missed = !chance(move.accuracy);
        if (missed) {
            return {
                success: true,
                hit: false,
                move: move.name,
                damage: 0,
                priority: move.priority
                // targetHp: target.currentHp,
            };
        }

        const { damage, isCrit, typeEffectiveness } = await this.calculateDamage(target, move);

        target.stats.hp = clamp(target.stats.hp - damage);

        return {
            success: true,
            hit: true,
            move: move.name,
            damage,
            isCrit,
            typeEffectiveness,
            // targetHp: target.currentHp,
            targetFainted: target.isFainted,
            priority: move.priority
        };
    }
}

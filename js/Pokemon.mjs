import PokeApi from "./PokeApi.mjs";
import Move from "./Move.mjs";
import { getData } from "./utlils.mjs";
import { IVManager, EVManager, statManager } from "./statManager.mjs";

// getLocalStorage, setLocalStorage, addLocalStorage

export default class Pokemon {
    static api = "https://pokeapi.co/api/v2";

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

    statusCounters = {};

    constructor(speciesName = "pikachu", { name, ability, level = 50, status = "none", volatileStatuses = [], nature = "hardy", shiny = false, iv, ev } = {}) {
        this.speciesName = speciesName;

        // Overridable semi-dependent properties.
        this.name = name ?? speciesName;
        this.ability = ability;

        // Overridable independent properties.
        this.level = level;
        this.natureName = nature
        this.shiny = shiny;
        this.status = status;
        this.volatileStatuses = new Set(volatileStatuses);
        // this.statusCounters

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

        // Stages that temporarily modify stats.
        this.statStages = {
            attack: 0,
            defense: 0,
            spAttack: 0,
            spDefense: 0,
            speed: 0,
            evasion: 0
        };

        // list of FULL move data (from move endpoint)
        this.moves = new Array(4); //Set?

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
        // https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-viii/sword-shield/11.png
        return this.species.sprites.versions["generation-v"]["black-white"].animated ?? this.species.sprites;
    }

    /** Get a FULL move object (power, accuracy, type, etc.) by name */
    getMove(name) {
        return this.moves.find((m) => m.name === name);
    }

    /** For UI: list move names + some basic info */
    getMoveSummary() {
        return this.moves.map((m) => ({
            name: m.name,
            type: m.type,
            power: m.power,
            pp: m.pp,
            accuracy: m.accuracy,
            damageClass: m.damageClass,
        }));
    }

    /** Pick N random moves that actually have power + accuracy, then load full move data */
    async loadRandomMoves(count = 4) {
        // entries look like { move: { name, url }, version_group_details: [...] }
        const all = this.species.moves;

        // simple random shuffle [...candidates].
        const shuffled = [...all].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 10);//count


        const moveDataPromises = selected.map((entry) =>
            getData(entry.move.url)
        );

        let moveData = await Promise.all(moveDataPromises);

        // Removes moves with completely unique behaviour
        moveData = moveData.filter(
            (m) => m.meta?.category?.name !== "unique" && m.meta?.category?.name !== "force-switch"
        );
        // keep only those that can actually “hit” something
        // this.moves = moveData.filter(
        //     (m) => m.power !== null && m.accuracy !== null
        // );
        // console.table(moveData.map(raw => ({ "New AND IMPROVED": raw.meta?.category?.name, "r": raw.meta })));


        this.moves = moveData.slice(0, count).map(raw => new Move(raw));
    }

    applyStatus(ailment) {
        // console.log("AILMENT????");
        if (this.status !== "none") return false; // already has a major status
        // console.log("AILMENT", ailment);
        this.status = ailment;

        return true;
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


        let result = await move.use(this, target);
        return result;
    }
}


// getMove(name) {
//     let moves = this.species.moves;
//     // console.log(moves);

//     let move = (moves.find(entry => entry.move.name == name)).move;


//     return getData(move.url);
// }

// async calculateDamage(target, move, field = { weather: "sunny" }) {
//     const level = this.level;
//     const power = move.power;

//     const isPhysical = move.damage_class === "physical";

//     const attack = isPhysical
//         ? this.stats.attack
//         : this.stats.spAttack;

//     const defense = isPhysical
//         ? target.stats.defense
//         : target.stats.spDefense;

//     // 1. Base damage
//     // console.log("Lv:", level, "Pow:", power, "Atk:", attack, "Def:", defense);
//     let baseDamage = Math.floor(
//         Math.floor(
//             Math.floor((2 * level) / 5 + 2) * power * (attack / defense)
//         ) / 50
//     ) + 2;

//     // === Apply Modifiers ===

//     // For Future Implementation WIP
//     // 2. Target modifier (double battles)
//     // modifier *= move.targetsMultiple ? 0.75 : 1;


//     // 3. STAB
//     const stabModifier = this.types.includes(move.type.name)
//         ? 1.5
//         : 1


//     // 4. Burn
//     const isBurned = this.status == "burned";
//     const burnModifier = (isBurned && isPhysical && this.ability !== "guts")
//         ? 0.5
//         : 1


//     // 5. Weather
//     const weatherModifier = 1;
//     if (field.weather === "rain") {
//         if (move.type.name === "water") weatherModifier = 1.5;
//         if (move.type.name === "fire") weatherModifier = 0.5;
//     }
//     if (field.weather === "sun") {
//         if (move.type.name === "fire") weatherModifier = 1.5;
//         if (move.type.name === "water") weatherModifier = 0.5;
//     }


//     // 6. Critical hit
//     // Determines if the hit was critical.
//     const isCrit = chance(Move.getCritChance(move));
//     const critModifier = isCrit
//         ? 1.5
//         : 1;

//     // 7. Random           0.85—1.00
//     const randomModifier = (85 + Math.floor(Math.random() * 16)) / 100;


//     // 8. Type effectiveness  e.g. 2, 0.5, 4, 0, etc.
//     const typeEffectiveness = await PokeApi.getTypeEffectiveness(move.type.name, target.types);


//     // 9. Other modifiers omitted for simplicity

//     const modifier = stabModifier * burnModifier * weatherModifier * critModifier * randomModifier;

//     let damage = Math.floor(clamp(Math.floor(baseDamage * modifier), 1) * typeEffectiveness);
//     // console.log("DMG", damage, "Mult", modifier);
//     return { damage, isCrit, typeEffectiveness }
// }

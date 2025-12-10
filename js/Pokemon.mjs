import PokeApi from "./PokeApi.mjs";
import Move from "./Move.mjs";
import { playAudio } from "./utlils.mjs";
import { IVManager, EVManager, statManager } from "./statManager.mjs";


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

    // statusCounters = {};

    constructor(speciesNameOrId = "pikachu", { name, ability, level = 50, status = "none", volatileStatuses = [], nature = "hardy", shiny = false, iv, ev } = {}) {
        this.speciesName = speciesNameOrId;

        // Overridable semi-dependent properties.
        this.name = name;
        this.ability = ability;

        // Overridable independent properties.
        this.level = level;
        this.natureName = nature
        this.shiny = shiny;
        this.status = status;
        this.volatileStatuses = new Set(volatileStatuses);

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
            accuracy: 0,
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

        this.speciesName = this.species.name;

        //If name wasn't assigned
        if (!this.name) this.name = this.speciesName;

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

    get hasStatus() {
        return this.status !== "none";
    }

    getSpriteDimensions() {
        // 15 is to fit it on the UI.
        return this.species.height * 15;
    }

    /** Gets Gen-V animated sprites if available. */
    getAnimations() {
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

    async cry() {
        await playAudio(this.species.cries.latest);
    }

    /** Pick N random moves that actually have power + accuracy, then load full move data */
    async loadRandomMoves(count = 4) {
        // entries look like { move: { name, url }, version_group_details: [...] }
        const all = this.species.moves;

        // simple random shuffle [...candidates].
        const shuffled = [...all].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 10);


        const moveDataPromises = selected.map((entry) =>
            PokeApi.getMove(entry.move.name)
        );

        let moveData = await Promise.all(moveDataPromises);

        // Removes moves with completely unique behaviour
        moveData = moveData.filter(
            (m) => !["unique", "force-switch", "field-effect", "whole-field-effect"].includes(m.meta?.category?.name)
        );

        this.moves = moveData.slice(0, count).map(raw => new Move(raw));
    }

    applyStatus(ailment) {
        if (this.hasStatus) return false; // already has a major status

        this.status = ailment;

        return true;
    }

    // Uses a move against a target pokemon that returns a summary object so your UI can show what happened.
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
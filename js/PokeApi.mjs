import { getData, saveCache, loadCache } from "./utlils.mjs";

export default class PokeApi {
    // This should eventually be upgraded to Pokemon Showdown API for more accurate move mechanics.
    static api = "https://pokeapi.co/api/v2";
    static storageKey = "poke-api";

    static pokemonKey = "pokemon-cache";
    static moveKey = "move-cache";
    static typeKey = "type-cache";
    static abilityKey = "ability-cache";
    static natureKey = "nature-cache"


    // Help with heavy network loads and faster reloads.
    static #masterCache = new Map();

    static #pokemonCache = new Map(); // Too big to cache
    static #moveCache = new Map();    // Too big to cache
    static #typeCache = loadCache(this.typeKey);
    static #abilityCache = loadCache(this.abilityKey);
    static #natureCache = loadCache(this.natureKey);


    static async getBaseData(nameOrId, folderPath, cache = this.#masterCache) {
        if (cache.has(nameOrId)) return cache.get(nameOrId);

        const data = await getData(`${this.api}/${folderPath}/${nameOrId}`);
        cache.set(nameOrId, data);

        return data;
    }

    static async saveCaches() {
        saveCache(this.typeKey, this.#typeCache);
        saveCache(this.abilityKey, this.#abilityCache);
        saveCache(this.natureKey, this.#natureCache);
    }

    // Generic API Calls
    static getPokemon = async (nameOrId) =>
        await this.getBaseData(nameOrId, "pokemon", this.#pokemonCache);

    static getMove = async (nameOrId) =>
        await this.getBaseData(nameOrId, "move", this.#moveCache);

    static getType = async (nameOrId) =>
        await this.getBaseData(nameOrId, "type", this.#typeCache);

    static getAbility = async (nameOrId) =>
        await this.getBaseData(nameOrId, "ability", this.#abilityCache);

    static getNature = async (nameOrId) =>
        await this.getBaseData(nameOrId, "nature", this.#natureCache);


    static async getTypeIcon(typeNameOrId) {
        if (!typeNameOrId) return null;
        const typeData = await this.getType(typeNameOrId);

        return (
            typeData?.sprites?.["generation-viii"]?.["sword-shield"]?.name_icon ??
            typeData?.["sword-shield"]?.name_icon ??
            null
        );
    }

    static async getTypeEffectiveness(typeNameOrId, targetTypes) {
        const { damage_relations } = await this.getType(typeNameOrId);

        let multiplier = 1;

        for (const targetType of targetTypes) {
            if (damage_relations.no_damage_to.some(t => t.name === targetType)) {
                multiplier *= 0;
            } else if (damage_relations.double_damage_to.some(t => t.name === targetType)) {
                multiplier *= 2;
            } else if (damage_relations.half_damage_to.some(t => t.name === targetType)) {
                multiplier *= 0.5;
            }
        }

        return multiplier;
    }
}
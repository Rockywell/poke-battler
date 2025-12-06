import { getData } from "./utlils.mjs";

export default class PokeApi {
    static api = "https://pokeapi.co/api/v2";
    // This should eventually be upgraded to Pokemon Showdown API for more accurate move mechanics.

    static #masterCache = new Map();

    static #pokemonCache = new Map();
    static #moveCache = new Map();
    static #typeCache = new Map();
    static #abilityCache = new Map();
    static #natureCache = new Map();


    static async getBaseData(nameOrId, folderPath, cache = this.#masterCache) {
        if (cache.has(nameOrId)) return cache.get(nameOrId);

        const data = await getData(`${this.api}/${folderPath}/${nameOrId}`);
        cache.set(nameOrId, data);

        return data;
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
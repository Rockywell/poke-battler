// poke-api.mjs
import { getData } from "./utlils.mjs";

export default class PokeApi {
    static api = "https://pokeapi.co/api/v2";


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


    static async getTypeIcon(typeName) {
        if (!typeName) return null;
        const typeData = await this.getType(typeName);

        // adjust path if your JSON shape differs slightly
        return (
            typeData?.sprites?.["generation-viii"]?.["sword-shield"]?.name_icon ??
            typeData?.["sword-shield"]?.name_icon ??
            null
        );
    }
}

// export a singleton
// export const pokeApi = new PokeApi();
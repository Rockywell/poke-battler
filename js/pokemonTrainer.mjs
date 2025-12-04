export default class PokemonTrainer {
    static maxTeamSize = 6;

    #team = [];
    #activePokemonIndex = 0


    constructor(name = "Ash Ketchum", pokemonTeam = []) {
        this.name = name;

        this.#team = pokemonTeam.slice(0, PokemonTrainer.maxTeamSize);
    }

    async init() {
        await Promise.all(this.#team.map(pokemon => pokemon.init()));
        // this.#team.forEach(pokemon => pokemon.owner = this);
    }

    get team() {
        return [...this.#team];
    }

    get isTeamFull() {
        return this.#team.length >= PokemonTrainer.maxTeamSize;
    }

    get isTeamKnockedOut() {
        return this.#team.every(pokemon => pokemon.isFainted)
    }

    get activePokemon() {
        return this.#team[this.#activePokemonIndex] ?? null;
    }

    // get activePokemonIndex() {
    //     return this.#activePokemonIndex;
    // }

    // #set activePokemonIndex(index) {
    //     if (index < 0 || index >= this.#team.length) return;
    //     this.#activePokemonIndex = index;
    // }

    addPokemon(pokemon) {
        if (this.isTeamFull) throw new Error("Team full");
        this.#team.push(pokemon);
    }

    removePokemon(pokemon) {
        const index = this.#team.indexOf(pokemon);
        if (index === -1) return;

        this.#team.splice(index, 1);

        // Make sure the activeIndex still points to a pokemon.
        if (this.#activePokemonIndex >= this.#team.length) {
            this.#activePokemonIndex = Math.max(0, this.#team.length - 1);
        }
    }

    switchPokemon(pokemon) {
        // this.activePokemonIndex = this.#team.indexOf(pokemon);

        const index = this.#team.indexOf(pokemon);
        if (index === -1) return false;

        this.#activePokemonIndex = index;
        return true;
    }

    switchToNextAlive() {
        const index = this.#team.findIndex(p => !p.isFainted);
        if (index === -1) return false;


        this.#activePokemonIndex = index;
        return true;
    }
}
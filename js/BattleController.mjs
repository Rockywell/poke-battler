import { setLocalStorage, getLocalStorage, randomInt } from "./utlils.mjs";
import { applyStatusPhase } from "./statusEngine.mjs";

// Later completely overhaul system for UI and Controller to use an EventBus, emit and on.
export default class BattleController {

    static storageKey = "battle-state"

    static wins = getLocalStorage("wins") ?? 0
    static losses = getLocalStorage("losses") ?? 0

    battleOver = false;


    // Saves the state of the battle. WIP
    updateBattleState() {
        setLocalStorage(BattleController.storageKey, {
            player: this.player,
            playerTeam: this.player.team,
            opponent: this.opponent,
            opponentTeam: this.opponent.team,
            ui: this.ui,
        })
    }

    constructor(player, opponent, ui) {
        this.player = player; //PokemonTrainer
        this.opponent = opponent; //PokemonTrainer
        this.ui = ui; //BattleUI

        this.onMoveClick = this.onMoveClick.bind(this);
    }

    init() {
        this.ui.renderAll([this.player.activePokemon, this.opponent.activePokemon]);
        this.ui.setPlayerMoves(this.player.activePokemon.moves, this.onMoveClick);
    }

    finishBattle(trainer) {

        if (trainer == this.opponent) {
            setLocalStorage("wins", BattleController.wins + 1);
            this.ui.replaceCardWithResultText(this.ui.opponentCard, "YOU WON");
        } else {
            setLocalStorage("losses", BattleController.losses + 1);
            this.ui.replaceCardWithResultText(this.ui.playerCard, "YOU LOST");
        }


        this.ui.disableMoves();
        return this.battleOver = true;
    }

    pokemonFainted(trainer, pokemonCard) {
        if (trainer.isTeamKnockedOut) return this.finishBattle(trainer, pokemonCard);
        trainer.switchToNextAlive();

        let pokemon = trainer.activePokemon;

        // UI: draw the new active Pokémon
        this.ui.spawnPokemon(
            pokemon,
            pokemonCard
        );


        if (trainer === this.player) {
            this.ui.setPlayerMoves(
                pokemon.moves,
                this.onMoveClick
            );
        }
    }

    async onMoveClick(move) {
        const playerTurnMove = move;
        const opponentTurnMove = this.opponent.activePokemon.moves[randomInt(0, this.opponent.activePokemon.moves.length - 1)];

        //Updates the battleState
        // this.updateBattleState();

        this.ui.disableMoves();
        await this.performRound(playerTurnMove, opponentTurnMove);

        // Keeps moves disabled once the battle is over.
        if (!this.battleOver) this.ui.enableMoves();
    }

    async useMove(moveName, user, target, userCard, targetCard, userTrainer, targetTrainer) {
        // 1. Game Logic
        const moveResult = await user.useMove(moveName, target);

        // 2. Visuals
        if (!moveResult.success) return moveResult;

        // Log Messages
        this.ui.sendBattleLogs(moveResult.messages);

        await this.ui.playUseMoveAnimation(
            // moveName,
            // userPokemon,
            user,
            target,
            userCard,
            targetCard,
            moveResult
        );

        if (targetTrainer === this.player) {
            await this.ui.setPlayerMoves(
                this.player.activePokemon.moves,
                this.onMoveClick
            );
        }

        // 3. Fainted Pokemon Logic
        if (target.isFainted) {
            this.pokemonFainted(targetTrainer, targetCard)
        } else if (user.isfainted) {
            this.pokemonFainted(userTrainer, userCard)
        }

        return moveResult//, battleOver: false };
    }

    async playerUsesMove(moveName) {
        return await this.useMove(
            moveName,
            this.player.activePokemon,
            this.opponent.activePokemon,
            this.ui.playerCard,
            this.ui.opponentCard,
            this.player,
            this.opponent
        )
    }

    async opponentUsesMove(moveName) {
        // dumb AI: first move
        // const move = this.opponent.activePokemon.moves[0]
        return await this.useMove(
            moveName,
            this.opponent.activePokemon,
            this.player.activePokemon,
            this.ui.opponentCard,
            this.ui.playerCard,
            this.opponent,
            this.player
        );
    }

    async performRound(playerMove, opponentMove) {
        let playerTurn;
        let opponentTurn;

        let movesInOrder = [];


        // NOTE: I can eventually turn the whole function into a for loop for multi-teams in the future.
        movesInOrder.push({
            trainer: "player",
            exec: async () => playerTurn = await this.performPlayerTurn(playerMove.name),
            priority: playerMove.priority,
            speed: this.player.activePokemon.stats.speed,
            tieBreaker: Math.random()
        });

        movesInOrder.push({
            trainer: "opponent",
            exec: async () => opponentTurn = await this.performOpponentTurn(opponentMove.name),
            priority: opponentMove.priority,
            speed: this.opponent.activePokemon.stats.speed,
            tieBreaker: Math.random()
        });

        // Sorts highest priority moves first.
        movesInOrder.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            if (a.speed !== b.speed) return b.speed - a.speed;
            return a.tieBreaker - b.tieBreaker;
        });

        // Run moves in order.
        for (const turn of movesInOrder) {
            await turn.exec();
            if (this.battleOver) return;
        }


        // 3) End-of-turn
        playerTurn.end = applyStatusPhase(this.player.activePokemon, "end");
        opponentTurn.end = applyStatusPhase(this.opponent.activePokemon, "end");

        if (playerTurn.end.affected) {
            this.ui.sendBattleLogs(playerTurn.end.messages);

            await this.ui.playStatusAnimation(
                this.player.activePokemon,
                this.ui.playerCard,
                playerTurn.end
            );
            if (this.player.activePokemon.isFainted) this.pokemonFainted(this.player, this.ui.playerCard);
            if (this.battleOver) return;
        }


        if (opponentTurn.end.affected) {
            this.ui.sendBattleLogs(opponentTurn.end.messages);

            await this.ui.playStatusAnimation(
                this.opponent.activePokemon,
                this.ui.opponentCard,
                opponentTurn.end
            );
            if (this.opponent.activePokemon.isFainted) this.pokemonFainted(this.opponent, this.ui.opponentCard);
            if (this.battleOver) return;
        }
    }

    async performTurn(user, target, moveName, userCard, targetCard, userTrainer, targetTrainer) {
        const result = {
            start: null,
            moveResults: null,
            end: null
        };

        // 1) Start-of-turn

        // Status Effects
        result.start = applyStatusPhase(user, "start");

        this.ui.sendBattleLogs(result.start.messages);

        if (result.start.affected) {
            await this.ui.playStatusAnimation(
                user,
                userCard,
                result.start
            );
            if (user.isFainted) {
                this.pokemonFainted(userTrainer, userCard);
                return result;
            }
        }


        // 2) Use move if you can act.
        if (result.start.canAct) {
            result.moveResult = await this.useMove(moveName, user, target, userCard, targetCard, userTrainer, targetTrainer);
        }

        return result;
    }

    async performPlayerTurn(moveName) {
        return await this.performTurn(
            this.player.activePokemon,
            this.opponent.activePokemon,
            moveName,
            this.ui.playerCard,
            this.ui.opponentCard,
            this.player,
            this.opponent
        )
    }

    async performOpponentTurn(moveName) {
        return await this.performTurn(
            this.opponent.activePokemon,
            this.player.activePokemon,
            moveName,
            this.ui.opponentCard,
            this.ui.playerCard,
            this.opponent,
            this.player
        )
    }
}




// --- FUTURE THEORETICAL EVENT BUS --- // 

// class EventBus {
//     constructor() {
//         this.listeners = {};
//     }

//     on(eventName, callback) {
//         (this.listeners[eventName] ??= []).push(callback);
//     }

//     emit(eventName, payload) {
//         (this.listeners[eventName] ?? []).forEach(fn => fn(payload));
//     }
// }
// const events = new EventBus();

// events.on("attack", (data) => {
//     console.log("UI reacting:", ui.play.attackAnimation());
// });

// events.emit("attack", { move: "Tackle", damage: 12 });
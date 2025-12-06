import { applyStatusPhase } from "./statusEngine.mjs";

export default class BattleController {

    // Saves the state of the battle.
    battleState = new Map()

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

    async onMoveClick(move, moveTile) {
        const playerTurnMove = move.name;
        const opponentTurnMove = this.opponent.activePokemon.moves[0].name;

        this.ui.disableMoves();
        await this.performRound(playerTurnMove, opponentTurnMove);
    }

    async useMove(moveName, user, target, userCard, targetCard, userTrainer, targetTrainer) {
        // 1. Game Logic
        const moveResults = await user.useMove(moveName, target);

        // 2. Visuals
        if (!moveResults.success) return moveResults;

        await this.ui.playUseMoveAnimation(
            // moveName,
            // userPokemon,
            target,
            userCard,
            targetCard,
            moveResults
        );

        if (targetTrainer === this.player) {
            this.ui.setPlayerMoves(
                this.player.activePokemon.moves,
                this.onMoveClick
            );
        }

        // 3. Fainted Pokemon Logic
        console.log("useMove T", target);
        if (target.isFainted) {

            if (targetTrainer.isTeamKnockedOut) return { moveResults, battleOver: true, winner: userTrainer.name };
            targetTrainer.switchToNextAlive();


            // UI: draw the new active Pokémon
            this.ui.spawnPokemon(
                targetTrainer.activePokemon,
                targetCard
            );


            if (targetTrainer === this.player) {
                this.ui.setPlayerMoves(
                    this.player.activePokemon.moves,
                    this.onMoveClick
                );
            }
        }

        return moveResults//, battleOver: false };
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
        // Eventually add priority and speed determination to choose who goes first.
        // console.log("PR", playerMove);
        const playerTurn = await this.performPlayerTurn(playerMove);

        // console.log("PlayerTurn", playerTurn);

        if (playerTurn.battleOver) {
            console.log("Battle ended, winner:", playerTurn.winner);
            return;
        }


        if (playerTurn.moveResults.targetFainted) return; //Will need to resolve differently in the future.


        const opponentTurn = await this.performOpponentTurn(opponentMove);

        // console.log("EnemyTurn", opponentTurn);

        if (opponentTurn.battleOver) {
            console.log("Battle ended, winner:", opponentTurn.winner);
            return
        }
    }
    //  field
    async performTurn(user, target, moveName, userCard, targetCard, userTrainer, targetTrainer) {
        const result = {
            start: null,
            moveResults: null,
            end: null
        };

        // STATUS
        // 1) Start-of-turn
        const startCtx = applyStatusPhase(user, "start");

        // await this.ui.playStatusAnimation(
        //     user,
        //     userCard,
        //     startCtx
        // );

        result.start = startCtx;

        if (!startCtx.canAct) {
            // can't act; still apply end-of-turn chip on attacker
            const endCtx = applyStatusPhase(user, "end");
            result.end = endCtx;
            return result;
        }
        // STATUS

        // 2) Use move
        const moveResult = await this.useMove(moveName, user, target, userCard, targetCard, userTrainer, targetTrainer);
        // const moveResult = await move.use(attacker, defender, field);
        result.moveResults = moveResult;

        // 3) End-of-turn
        const endCtx = applyStatusPhase(user, "end");
        result.end = endCtx;

        return result;
    }

    async performPlayerTurn(moveName) {
        // remove move name and add trainer lost move command property or to pokemon last used move?
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
        // remove move name and add trainer lost move command property or to pokemon last used move?
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

    // loadNewPokemon(trainer, trainerCard, opponentSprite, opponent) {
    //     console.log(trainer);
    //     if (!trainer.isTeamKnockedOut) {
    //         trainer.activePokemonIndex++;
    //         this.updatePokemonCard(trainer.activePokemon, trainerCard);
    //         this.updateSprite(opponent, opponentSprite);
    //     }
    // }
}

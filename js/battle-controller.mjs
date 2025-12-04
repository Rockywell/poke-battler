export default class BattleController {
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
        const playerTurn = await this.playerUsesMove(move.name);
        this.ui.disableMoves();

        if (playerTurn.battleOver) {
            console.log("Battle ended, winner:", playerTurn.winner);
            return;
        }


        let enemyTurnMove = this.opponent.activePokemon.moves[0].name;
        const enemyTurn = await this.opponentUsesMove(enemyTurnMove);

        if (enemyTurn.battleOver) {
            console.log("Battle ended, winner:", enemyTurn.winner);
        }
    }

    async useMove(moveName, user, target, userCard, targetCard, userTrainer, targetTrainer) {
        // 1. Game Logic
        const moveResults = await user.useMove(moveName, target);

        // 2. Visuals
        await this.ui.playUseMoveAnimation(
            // moveName,
            // userPokemon,
            target,
            userCard,
            targetCard,
            moveResults
        );

        // 3. Fainted Pokemon Logic
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

        return { moveResults, battleOver: false };
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

    // loadNewPokemon(trainer, trainerCard, opponentSprite, opponent) {
    //     console.log(trainer);
    //     if (!trainer.isTeamKnockedOut) {
    //         trainer.activePokemonIndex++;
    //         this.updatePokemonCard(trainer.activePokemon, trainerCard);
    //         this.updateSprite(opponent, opponentSprite);
    //     }
    // }
}

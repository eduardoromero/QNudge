import { GameInstance, GameSize } from './GameModel';

export const GamesList = [
    new GameInstance('Tunic', {
        size: GameSize.SMALL,
        launchTime: 1500
    }),
    new GameInstance('Hollow Knight', {
        size: GameSize.SMALL,
        launchTime: 2000
    }),
    new GameInstance('Lost Ark', {
        size: GameSize.MEDIUM,
        launchTime: 5000
    }),
    new GameInstance('World of Warcraft', {
        size: GameSize.BIG,
        launchTime: 20000
    })
];

const gamesMap = {};
GamesList.map((game) => {
    gamesMap[game.title] = game;
});

export const GamesConfigMap = gamesMap;

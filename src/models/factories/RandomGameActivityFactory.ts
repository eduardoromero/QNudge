import { GameActivity } from '../GameModel';
import { GamesList } from '../GamesConfig';
import { GameActivityFactory } from './GameActivityFactory';

export class RandomGameActivityFactory implements GameActivityFactory {
    private static readonly games = GamesList;

    static generate(): GameActivity {
        const index = Math.floor(Math.random() * this.games.length);
        const randomTitle = this.games[index];

        return {
            game: randomTitle,
            finished: undefined,
            started: undefined,
            runner: undefined,
            created: new Date().getTime(),
            nudged: false,
            time: 0,
            time_download: 0,
            time_install: 0
        };
    }
}

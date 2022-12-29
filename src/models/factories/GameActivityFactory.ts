import { GameActivity } from '../GameModel';

export abstract class GameActivityFactory {
    // TS doesn't take static methods ="(
    static generate(): GameActivity {
        throw Error('Please use one of the classes that implement the factory method.');
    }
}

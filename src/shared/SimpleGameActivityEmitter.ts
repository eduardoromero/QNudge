import { EventEmitter } from 'node:events';
import { Logger } from 'pino';
import { GameActivityFactory } from '../models/factories/GameActivityFactory';
import { ProbabilisticGameActivityFactory } from '../models/factories/ProbabilisticGameActivityFactory';
import { GameActivity } from '../models/GameModel';
import { logger } from './utils';

const id = require('@cuvva/ksuid');

export type GameActivityEmitterProps = {
    total: number;
    interval?: number;
    captureRejections?: boolean | undefined;
};

export class SimpleGameActivityEmitter extends EventEmitter {
    public static readonly NEW_EVENT_NAME = 'new_activity';
    public static readonly DONE_EVENT_NAME = 'done_generating';
    public static readonly DONE_PROCESSING = 'done_processing;';

    public readonly total: number;
    public readonly interval: number;
    public readonly generator: GameActivityFactory;
    private readonly logger: Logger;
    private done = false;
    private ticker;
    private counter = 0;

    constructor(props: GameActivityEmitterProps) {
        super(props);

        this.logger = logger.child({ emitter: 'SimpleGameActivityEmitter' });
        this.total = props.total;
        this.interval = props.interval || 100; // defaults to every 100ms
    }

    public start(): void {
        this.ticker = setInterval(() => {
            const activity: GameActivity = ProbabilisticGameActivityFactory.generate();

            this.logger.debug({ game: activity.game.title, id: id.generate('activity').toString() }, `Generated new activity`);
            this.emit(SimpleGameActivityEmitter.NEW_EVENT_NAME, { activity });

            this.counter++;

            if (this.total <= this.counter) {
                this.logger.info(`Done generating with SimpleGameActivityEmitter.`);
                // done;
                this.done = true;
                this.stop();

                // let everyone know we're done!
                this.emit(SimpleGameActivityEmitter.DONE_EVENT_NAME);
            }
        }, this.interval);
    }

    public stop(): void {
        if (this.ticker != undefined) {
            clearInterval(this.ticker);
            this.ticker = undefined;
        }
    }

    public isDone(): boolean {
        return this.done;
    }
}

import { GameActivity } from '../models/GameModel';
import { logger } from './utils';

export interface GameActivityStore {
    readonly name: string;
    readonly short: string;
    length(): number;
    push(activity: GameActivity);
    getActivitiesResult(): GameActivity[];
    getActivity(): GameActivity;
    getNudges(): number | undefined;
}

export class SimpleNudgingStore implements GameActivityStore {
    public static short = 'nudge';
    public readonly name = 'SimpleNudgingStore';
    public readonly short = 'nudge';
    private activities: GameActivity[] = [];
    private result: GameActivity[] = [];
    private nudges = 0;

    public push(activity: GameActivity) {
        const last = this.activities[this.activities.length - 1];
        if (last && !last.nudged && activity.game.config.size < last.game.config.size) {
            this.nudges++;

            // we can only nudge once
            last.nudged = true;

            logger.info(`> Nudging ${activity.game.title} over ${last.game.title}`);

            // nudge
            this.activities[this.activities.length - 1] = activity;
            this.activities.push(last);
        } else {
            this.activities.push(activity);
        }
    }

    public length(): number {
        return this.activities.length;
    }

    public getActivitiesResult(): GameActivity[] {
        return this.result;
    }

    getNudges(): number {
        return this.nudges;
    }

    getActivity(): GameActivity {
        const activity = this.activities.shift();
        // push a reference to the results
        if (activity) {
            this.result.push(activity);
        }

        return activity;
    }
}

export class SimpleStore implements GameActivityStore {
    public readonly name = 'SimpleFIFOStore';
    public readonly short = 'fifo';
    private activities: GameActivity[] = [];
    private result: GameActivity[] = [];

    public push(activity: GameActivity) {
        this.activities.push(activity);
    }

    public length(): number {
        return this.activities.length;
    }

    getActivitiesResult(): GameActivity[] {
        return this.result;
    }

    getActivity(): GameActivity {
        const activity = this.activities.shift();
        // push a reference to the results
        if (activity) {
            this.result.push(activity);
        }

        return activity;
    }

    getNudges() {
        return undefined;
    }
}

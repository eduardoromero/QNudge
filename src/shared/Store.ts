import { GameActivity } from '../models/GameModel';
import { logger } from './utils';

export interface GameActivityStore {
    readonly name: string;
    length(): number;
    push(activity: GameActivity);
    getActivities(): GameActivity[];
    getActivity(): GameActivity;
    getNudges(): number | undefined;
}

export class SimpleNudgingStore implements GameActivityStore {
    public readonly name = 'SimpleNudgingStore';
    private activities: GameActivity[] = [];
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

    public getActivities(): GameActivity[] {
        return this.activities;
    }

    getNudges(): number {
        return this.nudges;
    }

    getActivity(): GameActivity {
        return this.activities.shift();
    }
}

export class SimpleStore implements GameActivityStore {
    public readonly name = 'SimpleFIFOStore';
    private activities: GameActivity[] = [];

    public push(activity: GameActivity) {
        this.activities.push(activity);
    }

    public length(): number {
        return this.activities.length;
    }

    getActivities(): GameActivity[] {
        return this.activities;
    }

    getActivity(): GameActivity {
        return this.activities.shift();
    }

    getNudges() {
        return undefined;
    }
}

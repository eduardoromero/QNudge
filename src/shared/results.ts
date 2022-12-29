import { GameActivity } from '../models/GameModel';
import { GameActivityStore } from './Store';
import { duration, logger } from './utils';

export type RunValue = {
    type: 'average' | 'best' | 'worst';
    value: number;
    instance?: GameActivity;
};
export type RunResults = {
    average: RunValue;
    best: RunValue;
    worst: RunValue;
};

export function getRunResults(activities: GameActivity[]): RunResults {
    let best: RunValue = { type: 'best', value: Number.MAX_VALUE },
        worst: RunValue = { type: 'worst', value: 0 };

    const total = activities.reduce((acc, activity) => {
        if (activity.time < best.value) {
            best.value = activity.time;
            best.instance = activity;
        }

        if (activity.time > worst.value) {
            worst.value = activity.time;
            worst.instance = activity;
        }

        return acc + activity.time;
    }, 0);

    return {
        average: { value: total / activities.length, type: 'average' },
        best,
        worst
    };
}

export function printResults(results: RunResults) {
    const { average, best, worst } = results;

    if (average !== undefined) {
        logger.info(`Average time in queue: ${duration(average.value)}`);
    }

    if (best !== undefined) {
        logger.info(
            `Best time ${duration(best.value)} for ${best.instance.game.title} (${best.instance.runner.id}) size: ${
                best.instance.game.config.size
            }GB -> download: ${duration(best.instance.time_download)} -> install: ${duration(best.instance.time_install)}`
        );
    }

    if (worst !== undefined) {
        logger.info(
            `Worst time: ${duration(worst.value)} for ${worst.instance.game.title} (${worst.instance.runner.id}) size: ${
                worst.instance.game.config.size
            }GB -> download: ${duration(worst.instance.time_download)} -> install: ${duration(worst.instance.time_install)}`
        );
    }
}

export function printGameDistribution(store: GameActivityStore) {
    const activities = store.getActivitiesResult();
    const result = {};

    activities.forEach((a) => {
        const title = a.game.title;
        if (result[title] === undefined) {
            result[title] = 0;
        }

        result[title] = result[title] + 1;
    });

    logger.info({ games: result }, `Games ->`);
}

import { hrtime } from 'node:process';
import { GameActivity, GameRunner } from './models/GameModel';
import { getRunResults, printGameDistribution, printResults } from './shared/results';
import { duration, logger } from './shared/utils';
import { GameActivityStore, SimpleNudgingStore, SimpleStore } from './shared/Store';
import { ProbabilisticGameActivityFactory } from './models/factories/ProbabilisticGameActivityFactory';
import * as fs from 'fs';

function* getGameRunner(activities: GameActivity[]): Generator<GameRunner> {
    for (let i = 0; i < activities.length; i++) {
        const activity = activities[i];
        logger.info(`Getting game #${i + 1} - ${activity.game.title}`);
        activity.runner = new GameRunner(activity, `${i + 1}`);
        activity.runner.wait = false;

        yield activity.runner;
    }
}

type GenerateOptions = {
    fifo?: GameActivityStore;
    nudge?: GameActivityStore;
};

function generateActivities(total: number, opts: GenerateOptions = {}) {
    const { fifo = [], nudge = [] } = opts;

    logger.info(`Generating ${total} games...`);

    for (let g = 0; g < total; g++) {
        const activity = ProbabilisticGameActivityFactory.generate();
        logger.info(`Generated game ${g + 1}: ${activity.game.title}.`);

        fifo.push({ ...activity });
        nudge.push({ ...activity });
    }
}

async function run(store: GameActivityStore) {
    logger.info(`Running ${store.length()} games.`);

    for await (const runner of getGameRunner(store.getActivitiesResult())) {
        // run the game and wait to fetch and run the next

        logger.info(`Got game runner for ${runner.game.title}, running it.`);
        await runner.run();
    }

    return getRunResults(store.getActivitiesResult());
}

async function main() {
    const total_games = 25;

    const nudge = new SimpleNudgingStore();
    const fifo = new SimpleStore();
    const start = hrtime.bigint();
    generateActivities(total_games, { fifo, nudge });

    const fifo_results = run(fifo);
    const nudge_results = run(nudge);

    const [r1, r2] = await Promise.all([fifo_results, nudge_results]);

    // remove cyclic ref to activity from within runner
    fs.writeFileSync(
        'fifo_results.json',
        JSON.stringify(
            fifo.getActivitiesResult().map((a) => {
                const { runner, ...rest } = a;

                return rest;
            })
        )
    );
    fs.writeFileSync(
        'nudge_results.json',
        JSON.stringify(
            nudge.getActivitiesResult().map((a) => {
                const { runner, ...rest } = a;

                return rest;
            })
        )
    );

    logger.info(`FIFO:`);
    printResults(r1);

    logger.info(`NUDGE:`);
    if (nudge.getNudges()) {
        logger.info(`>> Total nudges: ${nudge.getNudges()}`);
    }

    printResults(r2);

    printGameDistribution(nudge);

    const end = hrtime.bigint();
    logger.info(`Done in ${duration(end - start)}!`);
}

main();

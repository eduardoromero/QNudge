import { hrtime } from 'node:process';
import { GameRunner } from './models/GameModel';
import { getRunResults, printGameDistribution, printResults } from './shared/results';
import { SimpleGameActivityEmitter } from './shared/SimpleGameActivityEmitter';
import { GameActivityStore, SimpleNudgingStore, SimpleStore } from './shared/Store';
import { duration, logger } from './shared/utils';

async function run(store: GameActivityStore, label: string = '') {
    logger.info(`Running ${store.length()} games on ${store.name} (${label}).`);
    let activity = store.getActivity();

    while (activity) {
        // run the game and wait to fetch and run the next
        const runner = new GameRunner(activity, activity.id);
        // this blocks while consuming this activity
        runner.wait = true;
        activity.runner = runner;

        logger.info(`(${store.name} - ${activity.id}) Got game runner for ${runner.game.title}, running it.`);
        await runner.run();
        logger.info(`(${store.name} - ${activity.id}) done ${label}).`);

        // fetch next
        activity = store.getActivity();
    }
}

function summary(store: GameActivityStore) {
    const results = getRunResults(store.getActivitiesResult());

    if (store.getNudges()) {
        logger.info(`Nudged: ${store.getNudges()}`);
    }

    printResults(results);
}

async function main() {
    const total_games = 2000;
    let counter = 0;

    const nudge = new SimpleNudgingStore();
    const fifo = new SimpleStore();

    const generator = new SimpleGameActivityEmitter({
        interval: 100, // every 100ms generate one entry
        total: total_games
    });

    generator.on(SimpleGameActivityEmitter.NEW_EVENT_NAME, (data) => {
        const { activity } = data;
        if (activity) {
            counter++;
            // so that's easier to follow how far in the generation process we are
            activity.id = counter;

            nudge.push({ ...activity });
            fifo.push({ ...activity });
        }
    });

    const start = hrtime.bigint();
    // start data
    generator.start();

    // loop
    let processors_in_flight = 0;
    const interval = 633;
    const consumer_loop = setInterval(async () => {
        processors_in_flight++;
        const n = run(nudge, 'clock');
        const f = run(fifo, 'clock');

        // wait for everyone to finish on this tick
        await Promise.all([f, n]);

        processors_in_flight--;
        generator.emit(SimpleGameActivityEmitter.DONE_PROCESSING);
    }, interval);

    generator.on(SimpleGameActivityEmitter.DONE_EVENT_NAME, async () => {
        clearInterval(consumer_loop);
    });

    generator.on(SimpleGameActivityEmitter.DONE_PROCESSING, async () => {
        if (generator.isDone() && processors_in_flight === 0) {
            // extract last items, if any
            const n = run(nudge, 'last');
            const f = run(fifo, 'last');

            // wait for all results to be consumed.
            await Promise.all([n, f]);

            summary(fifo);
            summary(nudge);

            // generated game distribution
            printGameDistribution(nudge);

            const end = hrtime.bigint();
            logger.info(`Done in ${duration(end - start)}!`);
        }
    });
}

main();

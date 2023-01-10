import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { captureAsyncFunc, Segment } from 'aws-xray-sdk';
import { captureAWSv3Client, enableManualMode, getNamespace } from 'aws-xray-sdk-core';
import { hrtime } from 'node:process';
import { GameActivityDAL } from './data/GameActivityDAL';
import { GameRunSummaryDAL } from './data/GameRunSummaryDAL';
import { GameActivity, GameRunner } from './models/GameModel';
import { GameRunSummary, getRunResults, printGameDistribution, printResults, SummaryRunType } from './shared/results';
import { SimpleGameActivityEmitter } from './shared/SimpleGameActivityEmitter';
import { GameActivityStore, SimpleNudgingStore, SimpleStore } from './shared/Store';
import { duration, logger, store as save } from './shared/utils';

// manual mode, no lambda magic ="(
enableManualMode();
// TODO: setting level to DEBUG or TRACE makes the tracing loop for some reason 🤷‍
// disabling for now
// setXRayLogger(logger);

// creating a context, and what will be the base segment
const ns = getNamespace();
const segment = new Segment('NodeJS-QNudge');

const ddb = captureAWSv3Client(
    new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-west-2'
    }),
    segment
);
const id = require('@cuvva/ksuid');

const run_id = id.generate('run').toString();
const GameActivityDDB = new GameActivityDAL({ client: ddb, run_id });
const GameRunSummaryDDB = new GameRunSummaryDAL({ client: ddb });

type RunOptions = {
    store: GameActivityStore;
    label: string;
    dal?: GameActivityDAL;
};

async function run({ store, label, dal }: RunOptions) {
    const subsegment = segment.addNewSubsegment('ConsumerRun');
    subsegment.addMetadata('items', store.length());
    subsegment.addAnnotation('store', store.short);

    logger.info(`Running ${store.length()} games on ${store.name} (${label}).`);
    let activity = store.getActivity();

    while (activity) {
        // run the game and wait to fetch and run the next
        const runner = new GameRunner(activity, activity.id);
        // this blocks while consuming this activity
        runner.wait = false;
        activity.runner = runner;

        logger.info(`(${store.name} - ${activity.id}) Got game runner for ${runner.game.title}, running it.`);
        await runner.run();
        logger.info(`(${store.name} - ${activity.id}) done (${label}).`);

        // store if available
        if (dal) {
            await dal.store(activity);
        }
        // fetch next
        activity = store.getActivity();
    }

    // done!
    subsegment.close();
}

async function summary(store: GameActivityStore) {
    logger.info(`=========================${store.name}==============================`);
    const by_game: { [key: string]: GameActivity[] } = {};
    // store full run to disk
    save(`${store.short}_results`, store.getActivitiesResult());

    store.getActivitiesResult().forEach((activity) => {
        const { title } = activity.game;
        if (!by_game[title]) {
            by_game[title] = [];
        }

        by_game[title].push(activity);
    });

    if (store.getNudges()) {
        logger.info(`Nudged: ${store.getNudges()}`);
    }

    const summary: GameRunSummary = {
        id: run_id,
        type: store.short === SimpleNudgingStore.short ? SummaryRunType.NUDGE : SummaryRunType.FIFO,
        results: {},
        distribution: {}
    };

    for (const [game, activities] of Object.entries(by_game)) {
        logger.info(`======= ${game} (${activities.length}) =======`);

        // save per-game run to disk
        const title = `${game.toLowerCase().replaceAll(' ', '_')}`;
        save(`summary_${store.short}_${title}`, activities);

        const results = getRunResults(activities);
        summary.results[title] = results;
        summary.distribution[title] = results.count;

        printResults(results);
    }

    try {
        await GameRunSummaryDDB.store(summary);
        logger.info(`Game Run Summary stored: ${run_id} ${summary.type}.`);
    } catch (error) {
        logger.error(error, `There was an error attempting to store the summary on DDB.`);
    }
}

async function main() {
    const total_games = parseInt(process.env.TOTAL_RUNS) || 100;
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
            // activity.id = counter;

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
        const n = run({ store: nudge, label: 'tick', dal: GameActivityDDB });
        const f = run({ store: fifo, label: 'tick-fifo' });

        // wait for everyone to finish on this tick
        await Promise.all([f, n]);

        processors_in_flight--;
        generator.emit(SimpleGameActivityEmitter.DONE_PROCESSING);
    }, interval);

    generator.on(SimpleGameActivityEmitter.DONE_PROCESSING, async () => {
        if (processors_in_flight === 0) {
            clearInterval(consumer_loop);

            // trigger that it's done
            generator.emit(SimpleGameActivityEmitter.DONE_EVENT_NAME);
        }
    });

    generator.on(SimpleGameActivityEmitter.DONE_EVENT_NAME, async () => {
        if (generator.isDone() && processors_in_flight === 0) {
            logger.info(`Done processing.`);

            // extract last items, if any
            const n = run({ store: nudge, label: 'last-nudge', dal: GameActivityDDB });
            const f = run({ store: fifo, label: 'last-fifo', dal: GameActivityDDB });

            // wait for all results to be consumed.
            await Promise.all([n, f]);

            const fifo_summary = summary(fifo);
            const nudge_summary = summary(nudge);

            // wait for summaries to finish storing
            await Promise.allSettled([fifo_summary, nudge_summary]);

            // generated game distribution
            printGameDistribution(nudge);

            const end = hrtime.bigint();
            logger.info(`Done in ${duration(end - start)}!`);
        }
    });
}

ns.run(() => {
    // adding subsegment with the main trigger
    captureAsyncFunc(
        'Generate',
        (subsegment) => {
            return main().finally(() => subsegment?.close());
        },
        segment
    );
});

// capturing when the event loop says bye to close the segment.
process.on('exit', () => {
    logger.debug(`Done tracing. Closing base segment.`);
    segment?.close();
});

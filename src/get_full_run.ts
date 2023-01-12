import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Segment } from 'aws-xray-sdk';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { GameRunSummaryDAL } from './data/GameRunSummaryDAL';

import { logger, XRay } from './shared/utils';

// creating a context, and what will be the base segment
const segment = new Segment('NodeJS-QNudge');
const ns = XRay.getNamespace();
segment.addAnnotation('operation', 'get_full_run');

const ddb = XRay.captureAWSv3Client(
    new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-west-2'
    }),
    segment
);
const GameRunSummaryDDB = new GameRunSummaryDAL({ client: ddb });

async function* getRunPage(key: string) {
    let token = undefined;
    let data = undefined;
    let failsafe_count = 0;
    do {
        ({ data, token } = await GameRunSummaryDDB.fetch_run(key, token));
        failsafe_count++;

        logger.info(`Got page ${failsafe_count} with ${data.length} items.`);

        if (failsafe_count > 100) {
            logger.error(`Too many items.`);
            return data;
        }

        yield data;
    } while (token);
}

async function getRun(id: string) {
    logger.info(`Getting all data for run: ${id}`);

    try {
        let entries = [];
        let summaries;

        // loop through paginated results
        for await (const items of getRunPage(id)) {
            if (!summaries) {
                const [fifo, nudge, ...rest] = items;

                summaries = {
                    fifo: fifo,
                    nudge: nudge
                };

                entries.push(...rest);
            } else {
                entries.push(...items);
            }
        }

        return { summaries, entries };
    } catch (error) {
        logger.error(error, `Error when getting run with id: ${id}`);

        return null;
    }
}

const args = yargs(hideBin(process.argv))
    .option('id', {
        alias: 'i',
        describe: 'key of the run to get',
        type: 'string'
    })
    .demand(['id'])
    .parseSync();

// capturing to get traces and a pretty subsegment with the activity.
ns.run(async () => {
    XRay.setSegment(segment);

    const { id } = args;
    const run = await XRay.captureAsyncFunc(
        'GetFullRun',
        (subsegment) => {
            return getRun(id).finally(() => subsegment?.close());
        },
        segment
    );

    logger.info({ run }, `Full run`);

    segment?.close();
});

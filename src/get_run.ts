// manual mode, no lambda magic ="(
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { captureAsyncFunc, Segment } from 'aws-xray-sdk';
import { captureAWSv3Client, enableManualMode, getNamespace } from 'aws-xray-sdk-core';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { GameRunSummaryDAL } from './data/GameRunSummaryDAL';

import { logger } from './shared/utils';

enableManualMode();
// TODO: setting level to DEBUG or TRACE makes the tracing loop for some reason 🤷‍
// disabling for now
// setXRayLogger(logger);

// creating a context, and what will be the base segment
const ns = getNamespace();
const segment = new Segment('NodeJS-QNudge');
segment.addAnnotation('operation', 'get_run');

const ddb = captureAWSv3Client(
    new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-west-2'
    }),
    segment
);
const GameRunSummaryDDB = new GameRunSummaryDAL({ client: ddb });

async function getRun(id: string, type: string) {
    logger.info(`Getting run: ${id}`);

    try {
        const entry = await GameRunSummaryDDB.get(id, type);
        logger.info({ entry }, `Entry ${id}`);

        return entry;
    } catch (error) {
        logger.error(error, `Error when getting run with id: ${id}`);

        return null;
    }
}

const args = yargs(hideBin(process.argv))
    .option('type', {
        alias: 'type',
        describe: 'type of run to get: NUDGE | FIFO',
        choices: ['NUDGE', 'FIFO', 'ACTIVITY'],
        default: 'NUDGE'
    })
    .option('id', {
        alias: 'i',
        describe: 'key of the run to get',
        type: 'string'
    })
    .demand(['id'])
    .parseSync();

// capturing to get traces and a pretty subsegment with the activity.
ns.run(() => {
    const { id, type } = args;
    captureAsyncFunc(
        'GetRun',
        (subsegment) => {
            return getRun(id, type).finally(() => subsegment?.close());
        },
        segment
    );
});

// capturing when the event loop says bye to close the segment.
process.on('exit', () => {
    logger.debug(`Done tracing. Closing base segment.`);
    segment?.close();
});

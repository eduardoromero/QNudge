// manual mode, no lambda magic ="(
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Segment } from 'aws-xray-sdk';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { GameRunSummaryDAL } from './data/GameRunSummaryDAL';
import { getResponseMetadata, getRequestMetadata } from './shared/DynamoDBUtils';

import { logger, XRay } from './shared/utils';

// creating a context, and what will be the base segment
const ns = XRay.getNamespace();
const segment = new Segment('NodeJS-QNudge');
segment.addAnnotation('operation', 'get_run');

const ddb = XRay.captureAWSv3Client(
    new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-west-2'
    }),
    segment
);

ddb.middlewareStack.add(getRequestMetadata, {
    step: 'build',
    name: 'debug-request'
});

ddb.middlewareStack.addRelativeTo(getResponseMetadata, {
    name: 'response-size',
    relation: 'before',
    toMiddleware: 'XRaySDKInstrumentation'
});

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
ns.run(async () => {
    XRay.setSegment(segment);

    const { id, type } = args;
    await XRay.captureAsyncFunc(
        'GetRun',
        (subsegment) => {
            return getRun(id, type).finally(() => subsegment?.close());
        },
        segment
    );

    logger.debug(`Done tracing. Closing base segment.`);
    segment?.close();
});

import { duration, logger } from './utils';
import prettyBytes from 'pretty-bytes';

const id = require('@cuvva/ksuid');
const log = logger.child({ name: 'ddb-utils', client: id.generate('ddbutils').toString() });

export const getRequestMetadata = (next, context) => async (args) => {
    const { clientName, commandName } = context;

    const { input } = args;
    log.debug(`${clientName} - operation: ${commandName}`);
    log.debug(input, 'input');

    return next(args);
};

export const getResponseMetadata = (next) => async (args) => {
    const start = process.hrtime.bigint();
    return next(args).then((result) => {
        const end = process.hrtime.bigint();
        log.debug(`Request finished in ${duration(end - start)}.`);

        // request status
        if (result?.response?.statusCode) {
            log.debug(`Status: ${result.response.statusCode}`);
        }

        // size
        if (result?.response?.body?.headers) {
            const s = result.response.body.headers['content-length'];
            const size = prettyBytes(parseInt(s) || 0);
            log.debug(`Response size: ${size}`);
        }

        // return response unchanged.
        return result;
    });
};

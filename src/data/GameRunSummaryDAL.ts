import { ReturnConsumedCapacity } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, GetCommandInput, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from 'pino';
import { GameRunSummary, RunResults, SummaryRunType } from '../shared/results';
import { DataAccessProps, logger } from '../shared/utils';

type GameRunSummaryEntry = {
    key: string;
    type: string;
    results: { [key: string]: RunResults };
    distribution?: { [key: string]: number };
    created: string;
};

export class GameRunSummaryDAL {
    private readonly ddb: DynamoDBDocumentClient;
    private readonly tableName: string = 'game_activities';
    private readonly logger: Logger;

    constructor(props: DataAccessProps) {
        this.ddb = DynamoDBDocumentClient.from(props.client, {
            marshallOptions: {
                convertClassInstanceToMap: true
            }
        });
        this.logger = logger.child({ name: this.constructor.name });
    }

    /**
     * Maps a GameRunSummary to a DDB entry for GameRunSummary.
     *
     * @param summary the run summary activity to map to DDB.
     * @returns a mapped summary ready to be stored in DDB.
     */
    static map(summary: GameRunSummary): GameRunSummaryEntry {
        const { id, results, ...data } = summary;

        // remove runners (cyclic reference)
        for (const [title, result] of Object.entries(results)) {
            const { best, average, worst, count } = result;
            delete best.instance.runner;
            delete worst.instance.runner;

            results[title] = {
                best,
                worst,
                average,
                count
            };
        }

        return {
            key: id,
            ...data,
            results,
            created: new Date().toJSON()
        };
    }

    static remap(entry: GameRunSummaryEntry): GameRunSummary {
        return {
            id: entry.key,
            type: SummaryRunType[entry.type],
            results: entry.results,
            distribution: entry.distribution
        };
    }

    public async store(summary: GameRunSummary) {
        const entry = GameRunSummaryDAL.map(summary);

        this.logger.debug({ entry });

        const command = new PutCommand({
            Item: entry,
            TableName: this.tableName
        });

        this.logger.debug({ command });

        return this.ddb.send(command);
    }

    public async get(key: string, type: string): Promise<GameRunSummary> {
        const cmd: GetCommandInput = {
            ReturnConsumedCapacity: ReturnConsumedCapacity.TOTAL,
            Key: {
                key,
                type
            },
            TableName: this.tableName
        };

        this.logger.debug({ GetItem: cmd });

        return this.ddb.send(new GetCommand(cmd)).then((response) => {
            const { Item, ConsumedCapacity } = response;
            this.logger.debug({ item: Item, meta: { ConsumedCapacity } });

            const data = Item as GameRunSummaryEntry;
            return GameRunSummaryDAL.remap(data);
        });
    }
}

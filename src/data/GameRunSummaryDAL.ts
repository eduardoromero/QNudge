import { ReturnConsumedCapacity } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, GetCommandInput, PutCommand, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { Logger } from 'pino';
import { GameActivity } from '../models/GameModel';
import { GameRunSummary, RunResults, SummaryRunType } from '../shared/results';
import { DataAccessProps, logger } from '../shared/utils';
import { GameActivityDAL } from './GameActivityDAL';

export type GameRunSummaryEntry = {
    key: string;
    type: string;
    results: { [key: string]: RunResults };
    distribution?: { [key: string]: number };
    created: string;
};

export type QueryOptions = {
    token?: Record<string, any>;
};
export type FetchResponseItem = GameRunSummary | GameActivity;
export type FetchResponse = {
    data: FetchResponseItem[];
    token: Record<string, any>;
};

export class GameRunSummaryDAL {
    private readonly ddb: DynamoDBDocumentClient;
    private readonly tableName: string = 'game_activities';
    private readonly fetchIndex: string = 'run_with_entries_index';
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
            Item: { ...entry, run_id: entry.key },
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

    public async fetch_run(key: string, options: QueryOptions = {}): Promise<FetchResponse> {
        const cmd: QueryCommandInput = {
            TableName: this.tableName,
            ScanIndexForward: false,
            IndexName: this.fetchIndex,
            ConsistentRead: false,
            KeyConditionExpression: 'run_id = :key',
            ExpressionAttributeValues: {
                ':key': key
            },
            ReturnConsumedCapacity: ReturnConsumedCapacity.INDEXES,
            Limit: 25
        };

        if (options.token) {
            cmd.ExclusiveStartKey = options.token;
        }

        this.logger.debug({ QueryCommand: cmd });

        return this.ddb.send(new QueryCommand(cmd)).then((response) => {
            const { Items, ConsumedCapacity, LastEvaluatedKey } = response;
            this.logger.debug({ items: Items.length, meta: { ConsumedCapacity, LastEvaluatedKey } });

            const entries = Items.map((i: any) => {
                if (i.type === 'NUDGE' || i.type === 'FIFO') {
                    return GameRunSummaryDAL.remap(i);
                } else {
                    return GameActivityDAL.remap(i);
                }
            });
            return { data: entries, token: LastEvaluatedKey };
        });
    }
}

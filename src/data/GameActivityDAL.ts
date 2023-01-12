import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { Logger } from 'pino';
import { GameActivity, GameSize } from '../models/GameModel';
import { DataAccessProps, logger } from '../shared/utils';

const id = require('@cuvva/ksuid');
const TYPE = 'ACTIVITY';

export type GameActivityEntry = {
    key: string;
    title: string;
    size: string;
    // DDB likes Dates as Strings, marshall/unmarshall doesn't know what to do with them
    created: string;
    finished: string;
    started: string;
    nudged: boolean;
    time: number;
    time_download: number;
    time_install: number;
    time_launch: number;
    run_id?: string;
    type: string;
};

export class GameActivityDAL {
    public readonly run_id: string;
    private readonly ddb: DynamoDBDocumentClient;
    private readonly tableName: string = 'game_activities';
    private readonly logger: Logger;

    constructor(props: DataAccessProps) {
        this.run_id = props.run_id || id.generate('run').toString();
        this.ddb = DynamoDBDocumentClient.from(props.client);
        this.logger = logger.child({ name: this.constructor.name });
    }

    /**
     * Maps instants to ISO datetime for DDB, flattens title to a level up, and Config to a string value, so it's
     * easier to understand on DDB.
     *
     * @param activity the game activity to map to DDB.
     * @returns a mapped activity.
     */
    static map(activity: GameActivity): GameActivityEntry {
        const {
            game: { config },
            game
        } = activity;

        const size = GameSize[config.size];

        return {
            key: activity.id,
            type: TYPE,
            title: game.title,
            size,
            nudged: activity.nudged,
            created: new Date(activity.created).toJSON(),
            finished: new Date(activity.finished).toJSON(),
            started: new Date(activity.started).toJSON(),
            time: activity.time,
            time_download: activity.time_download,
            time_install: activity.time_install,
            time_launch: activity.game.config.launchTime
        };
    }

    static remap(entry: GameActivityEntry): GameActivity {
        return {
            id: entry.key,
            nudged: entry.nudged,
            game: {
                title: entry.title,
                config: {
                    size: GameSize[entry.size],
                    launchTime: entry.time_launch
                }
            },
            runner: undefined,
            created: new Date(entry.created).getTime(),
            finished: new Date(entry.finished).getTime(),
            started: new Date(entry.started).getTime(),
            time: entry.time,
            time_download: entry.time_download,
            time_install: entry.time_install
        };
    }

    public async store(activity: GameActivity, type: string | undefined) {
        const entry = GameActivityDAL.map(activity);

        entry.run_id = this.run_id;
        if (type) {
            entry.type = `${entry.type}_${type}`;
        }

        this.logger.debug({ data: marshall(entry) });

        const command = new PutCommand({
            Item: entry,
            TableName: this.tableName
        });

        this.logger.debug({ command });

        return this.ddb.send(command);
    }

    public async get(key: string, type: string | undefined): Promise<GameActivity> {
        return this.ddb
            .send(
                new GetCommand({
                    Key: { key, type: type ? `${TYPE}_${type}` : TYPE },
                    TableName: this.tableName
                })
            )
            .then((response) => {
                const data = response.Item as GameActivityEntry;
                return GameActivityDAL.remap(data);
            });
    }
}

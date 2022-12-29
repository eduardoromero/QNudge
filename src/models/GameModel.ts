import { getWaitTime, logger, VerboseLogger, wait } from '../shared/utils';

const id = require('@cuvva/ksuid');
const JITTER_FACTOR_SMALL = 50;
const JITTER_FACTOR_BIG = 150;

export type GameActivity = {
    id: string;
    game: GameInstance;
    runner: GameRunner;
    time: undefined | number;
    time_download: number;
    time_install: number;
    created: number;
    started: number;
    finished: number;
    nudged: boolean;
};

export enum GameSize {
    SMALL = 2,
    MEDIUM = 10,
    BIG = 50
}

export type GameConfig = {
    size: GameSize;
    launchTime: number;
};

export class GameInstance {
    readonly config: GameConfig;
    readonly title: string;

    constructor(title: string, config: GameConfig) {
        this.title = title;
        this.config = config;
    }
}

export class GameRunner {
    readonly activity: GameActivity;
    readonly game: GameInstance;
    readonly id: string;
    readonly logger: VerboseLogger;
    public nudged = false;
    public wait = false;
    private ran = false;

    constructor(activity: GameActivity, i: string = undefined) {
        this.id = i || id.generate('runner').toString();
        this.activity = activity;
        this.game = activity.game;
        this.logger = logger.child({ game: this.game.title, runner: this.id }) as VerboseLogger;
    }

    public async download() {
        // 10s per GB + 5s, +-1500ms
        const time = getWaitTime(this.game.config.size * 10 + 5, JITTER_FACTOR_SMALL);

        if (!this.wait) {
            this.activity.time_download = time;
            return time;
        }

        const download_start = new Date().getTime();
        this.logger.verbose({ event: 'downloading' }, `Downloading ${this.game.title}.`);

        // sleep
        await wait(time);

        this.logger.trace({ event: 'downloading_finished' }, `Done downloading.`);
        this.activity.time_download = new Date().getTime() - download_start;

        return time;
    }

    public async install() {
        // 5s per GB + 5s, +-500ms
        const time = getWaitTime(this.game.config.size * 50 + 50, JITTER_FACTOR_BIG);

        if (!this.wait) {
            this.activity.time_install = time;
            return time;
        }

        const install_start = new Date().getTime();
        this.logger.verbose({ event: 'installing' }, `Installing ${this.game.title}.`);

        // sleep
        await wait(time);

        this.logger.trace({ event: 'installing_finished' }, `Done installing.`);
        this.activity.time_install = new Date().getTime() - install_start;

        return time;
    }

    public async run() {
        this.activity.started = new Date().getTime();
        this.ran = true;

        logger.verbose(`Waiting for ${this.game.title} (${this.activity.id})`);

        await this.download();
        await this.install();

        this.logger.verbose(`Running ${this.game.title}.`);

        if (!this.wait) {
            this.activity.finished = this.activity.started + this.activity.time_install + this.activity.time_download;
            this.activity.time = this.activity.time_install + this.activity.time_download;

            return;
        }

        this.activity.finished = new Date().getTime();
        this.activity.time = this.activity.time_install + this.activity.time_download;

        this.logger.info({ event: 'running', t: this.activity.time }, `${this.game.title} is running.`);

        return;
    }
}

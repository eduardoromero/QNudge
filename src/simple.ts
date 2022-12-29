import { hrtime } from 'node:process';
import { GameActivity, GameInstance, GameRunner, GameSize } from './models/GameModel';
import { duration, logger } from './shared/utils';

// const activities = [];
// const NUM_GAMES = 1000;
// for (let i = 0; i < NUM_GAMES; i++) {
//     activities.push(ProbabilisticGameActivityFactory.generate());
// }
//
// const counter = {};
//
// activities.forEach((activity) => {
//     const title = activity.game.title;
//     counter[title] = counter[title] === undefined ? 1 : counter[title] + 1;
// });

// console.log(counter);

async function run() {
    const activity: GameActivity = {
        game: new GameInstance('World of Warcraft', {
            size: GameSize.BIG,
            launchTime: 20000
        }),
        created: new Date().getTime(),
        finished: null,
        id: '1',
        nudged: false,
        runner: undefined,
        started: 0,
        time: 0,
        time_download: 0,
        time_install: 0
    };

    const copy = { ...activity, id: '2' };

    const activities = [activity, copy];

    const start = hrtime.bigint();
    logger.info('Starting.');

    let done = false;
    while (!done) {
        const a = activities.shift();

        if (a === undefined) {
            done = true;
            break;
        }

        const runner = new GameRunner(a);
        runner.wait = true;
        a.runner = runner;

        await runner.run();
    }

    const end = hrtime.bigint();
    logger.info(`Done! ${duration(end - start)}`);
    logger.info(`Time: ${duration(activity.time)}`);
    logger.info(`Time: ${duration(copy.time)}`);
}

run();

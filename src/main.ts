import { hrtime } from 'node:process';
import { GameActivity, GameRunner } from './models/GameModel';
import { duration, logger } from './utils';
import { GameActivityStore, SimpleNudgingStore, SimpleStore } from './Store';
import { ProbabilisticGameActivityFactory } from './models/factories/ProbabilisticGameActivityFactory';
import * as fs from 'fs';

type RunValue = {
  type: 'average' | 'best' | 'worst';
  value: number;
  instance?: GameActivity;
};
type RunResults = {
  average: RunValue;
  best: RunValue;
  worst: RunValue;
};

function* getGameRunner(activities: GameActivity[]): Generator<GameRunner> {
  for (let i = 0; i < activities.length; i++) {
    const activity = activities[i];
    logger.info(`Getting game #${i + 1} - ${activity.game.title}`);
    activity.runner = new GameRunner(activity, `${i + 1}`);
    activity.runner.wait = false;

    yield activity.runner;
  }
}

function getRunResults(activities: GameActivity[]): RunResults {
  let best: RunValue = { type: 'best', value: Number.MAX_VALUE },
    worst: RunValue = { type: 'worst', value: 0 };

  const total = activities.reduce((acc, activity) => {
    if (activity.time < best.value) {
      best.value = activity.time;
      best.instance = activity;
    }

    if (activity.time > worst.value) {
      worst.value = activity.time;
      worst.instance = activity;
    }

    return acc + activity.time;
  }, 0);

  return {
    average: { value: total / activities.length, type: 'average' },
    best,
    worst
  };
}

type GenerateOptions = {
  fifo?: GameActivityStore;
  nudge?: GameActivityStore;
};

function generateActivities(total: number, opts: GenerateOptions = {}) {
  const { fifo = [], nudge = [] } = opts;

  logger.info(`Generating ${total} games...`);

  for (let g = 0; g < total; g++) {
    const activity = ProbabilisticGameActivityFactory.generate();
    logger.info(`Generated game ${g + 1}: ${activity.game.title}.`);

    fifo.push({ ...activity });
    nudge.push({ ...activity });
  }
}

async function run(store: GameActivityStore) {
  logger.info(`Running ${store.length()} games.`);

  for await (const runner of getGameRunner(store.getActivities())) {
    // run the game and wait to fetch and run the next

    logger.info(`Got game runner for ${runner.game.title}, running it.`);
    await runner.run();
  }

  return getRunResults(store.getActivities());
}

function printResults(results: RunResults) {
  const { average, best, worst } = results;

  logger.info(`Average time in queue: ${duration(average.value)}`);

  logger.info(
    `Best time ${duration(best.value)} for ${best.instance.game.title} (${best.instance.runner.id}) size: ${
      best.instance.game.config.size
    }GB -> download: ${duration(best.instance.time_download)} -> install: ${duration(best.instance.time_install)}`
  );

  logger.info(
    `Worst time: ${duration(worst.value)} for ${worst.instance.game.title} (${worst.instance.runner.id}) size: ${
      worst.instance.game.config.size
    }GB -> download: ${duration(worst.instance.time_download)} -> install: ${duration(worst.instance.time_install)}`
  );
}

function printGameDistribution(nudge: SimpleNudgingStore) {
  const activities = nudge.getActivities()
  const result = {};

  activities.forEach(a => {
    const title = a.game.title;
    if (result[title] === undefined) {
      result[title] = 0;
    }

    result[title] = result[title] + 1;
  });

  logger.info({ games: result }, `Games ->`);
}

async function main() {
  const total_games = 25;

  const nudge = new SimpleNudgingStore();
  const fifo = new SimpleStore();
  const start = hrtime.bigint();
  generateActivities(total_games, { fifo, nudge });

  let end = hrtime.bigint();
  logger.info(`Generation in ${duration(end - start)}.`);

  const fifo_results = run(fifo);
  const nudge_results = run(nudge);

  const [r1, r2] = await Promise.all([fifo_results, nudge_results]);

  // remove cyclic ref to activity from within runner
  fs.writeFileSync('fifo_resutls.json', JSON.stringify(fifo.getActivities().map(a => {
    const {runner, ...rest} = a;

    return rest;
  })));
  fs.writeFileSync('nudge_resutls.json', JSON.stringify(nudge.getActivities().map(a => {
    const {runner, ...rest} = a;

    return rest;
  })));

  logger.info(`FIFO:`);
  printResults(r1);

  logger.info(`NUDGE:`);
  if (nudge.getNudges()) {
    logger.info(`>> Total nudges: ${nudge.getNudges()}`);
  }

  printResults(r2);

  printGameDistribution(nudge);

  end = hrtime.bigint();
  logger.info(`Done in ${duration(end - start)}!`);
}

main();

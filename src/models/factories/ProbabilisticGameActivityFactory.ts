import { GameActivity } from '../GameModel';
import { GamesConfigMap } from '../GamesConfig';
import { GameActivityFactory } from './GameActivityFactory';

export class ProbabilisticGameActivityFactory extends GameActivityFactory {
  private static readonly weights: { [key: string]: number } = {
    'World of Warcraft': 1,
    'Lost Ark': 2,
    'Hollow Knight': 3,
    Tunic: 6
  };

  private static readonly totalWeight: number = Object.values(this.weights).reduce((acc, i) => acc + i, 0);

  public static generate(): GameActivity {
    const random = Math.random() * this.totalWeight;
    let cumulative = 0;

    let randomTitle;
    for (const [title, weight] of Object.entries(this.weights)) {
      cumulative += weight;

      if (random < cumulative) {
        randomTitle = GamesConfigMap[title];
        break;
      }
    }

    return {
      game: randomTitle,
      finished: undefined,
      started: undefined,
      runner: undefined,
      created: new Date().getTime(),
      nudged: false,
      time: 0,
      time_download: 0,
      time_install: 0
    };
  }
}

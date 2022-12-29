import { ProbabilisticGameActivityFactory } from './models/factories/ProbabilisticGameActivityFactory';

const activities = [];
const NUM_GAMES = 1000;
for (let i = 0; i < NUM_GAMES; i++) {
    activities.push(ProbabilisticGameActivityFactory.generate());
}

const counter = {};

activities.forEach((activity) => {
    const title = activity.game.title;
    counter[title] = counter[title] === undefined ? 1 : counter[title] + 1;
});

console.log(counter);

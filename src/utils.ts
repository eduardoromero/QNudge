import { default as Pino, Logger } from 'pino';
import { default as humanizeDuration } from 'humanize-duration';

export type VerboseLogger = Logger & {
  verbose: Function;
};

const base_logger = Pino({
  level: process.env.LOG_LEVEL || 'debug',
  name: 'Queue Nudging',
  // removing pid and hostname from default logger object;
  base: undefined,
  customLevels: {
    verbose: 15
  }
});

export const logger = base_logger as VerboseLogger;

export async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function jitter(value: number, jitter: number): number {
  // Generate a random number between -jitter and +jitter
  const jitter_factor = (Math.random() - 0.5) * jitter * 2;

  // Add the jitter to the original number
  return Math.round(value + jitter_factor);
}

export function getWaitTime(waitInMs: number, jitter_factor: number) {
  const time = waitInMs //jitter(waitInMs, jitter_factor);

  logger.trace(`Waiting for (${waitInMs} +/- ${jitter_factor})ms ${time}ms...`);

  return time;
}

export function nanoToMillis(nanos: bigint) {
  const milliseconds = nanos / BigInt(1e6);

  return Math.round(Number(milliseconds));
}

export function duration(value: bigint | number): string {
  const millis = typeof value === 'bigint' ? nanoToMillis(value) : value;

  return humanizeDuration(millis, {
    units: ['h', 'm', 's', 'ms'],
    round: true
  });
}

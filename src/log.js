// One place for progress messages: the terminal prints them, the app window shows them.
import { EventEmitter } from 'node:events';

export const logBus = new EventEmitter();

export function log(text) {
  const line = String(text);
  if (logBus.listenerCount('log')) logBus.emit('log', line);
  else console.log(line);
}

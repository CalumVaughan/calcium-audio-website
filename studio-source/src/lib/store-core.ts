import { reduce, type State, type Command } from './model.ts';
import { validateState } from './validate.ts';
export const KEY = 'calcium-studio:browser:v1';
export type Envelope = { revision: number; state: State };
export function createStore(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  makeBlank: () => State,
) {
  const read = (): Envelope => {
    const raw = storage.getItem(KEY);
    if (!raw) return { revision: 0, state: makeBlank() };
    try {
      const value = JSON.parse(raw);
      if (!Number.isInteger(value.revision) || value.revision < 0)
        throw new Error();
      return { revision: value.revision, state: validateState(value.state) };
    } catch {
      throw new Error(
        'The saved data could not be read. It has been left untouched; restore a valid export using Import plan or backup.',
      );
    }
  };
  const write = (data: Envelope) => {
    try {
      storage.setItem(KEY, JSON.stringify(data));
    } catch {
      throw new Error(
        'Browser storage is full or unavailable. This change was not saved. Export a backup before clearing browser data.',
      );
    }
    return data;
  };
  return {
    read,
    change(command: Command, now = Date.now()) {
      const data = read();
      const state = reduce(data.state, command, now);
      return state === data.state
        ? data
        : write({ state, revision: data.revision + 1 });
    },
    importText(raw: string) {
      if (raw.length > 8_000_000)
        throw new Error(
          'This file is too large. Please use a Calcium Studio JSON export.',
        );
      let input: unknown;
      try {
        input = JSON.parse(raw);
      } catch {
        throw new Error(
          'This file is not valid JSON. Your current data has not changed.',
        );
      }
      const state = validateState(input);
      // An imported timer is paused so a backup never resumes unattended time.
      if (state.timer) {
        const exported = (input as { exportedAt?: unknown }).exportedAt;
        const when = typeof exported === 'string' ? Date.parse(exported) : NaN;
        const extra =
          state.timer.startedAt !== null && Number.isFinite(when)
            ? Math.max(0, when - state.timer.startedAt)
            : 0;
        state.timer = {
          ...state.timer,
          elapsedMs: state.timer.elapsedMs + extra,
          startedAt: null,
        };
      }
      let revision = 0;
      try {
        revision = read().revision;
      } catch {
        /* A valid backup can replace corrupt local data after confirmation. */
      }
      return write({ state, revision: revision + 1 });
    },
  };
}

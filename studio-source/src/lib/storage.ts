import { blankState } from './blank';
import { createStore, KEY } from './store-core';
import type { Command, State } from './model';
const store = () => createStore(window.localStorage, blankState);
async function locked<T>(fn: () => T | Promise<T>): Promise<T> {
  if (navigator.locks)
    return navigator.locks.request('calcium-studio-write', fn);
  return fn();
}
export function hasSavedStudio() {
  return localStorage.getItem(KEY) !== null;
}
export async function studioFetch(
  _url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    const data =
      init?.method === 'POST'
        ? await locked(() =>
            store().change(JSON.parse(String(init.body)) as Command),
          )
        : store().read();
    return Response.json({ ...data, local: true });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : 'The change could not be saved.',
      },
      { status: 400 },
    );
  }
}
export async function importStudio(text: string) {
  const result = await locked(() => store().importText(text));
  window.dispatchEvent(new Event('studio-data-changed'));
  return result;
}
export function subscribeToStorage(callback: () => void) {
  const update = (e: StorageEvent) => {
    if (e.key === KEY) callback();
  };
  window.addEventListener('storage', update);
  window.addEventListener('studio-data-changed', callback);
  return () => {
    window.removeEventListener('storage', update);
    window.removeEventListener('studio-data-changed', callback);
  };
}
export function downloadBackup(state?: State) {
  const data = state ?? store().read().state;
  const a = document.createElement('a'),
    url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { exportedAt: new Date().toISOString(), ...data },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
  a.href = url;
  a.download =
    'calcium-studio-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

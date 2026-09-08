import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, KEY } from '../src/lib/store-core.ts';
import { blankState } from '../src/lib/blank.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
const command = (id, type, extra = {}) => ({
  id,
  type,
  day: '2026-09-08',
  ...extra,
});
const addTask = command('task-a', 'task.add', {
  title: 'Finish a sketch',
  area: 'Music',
});
function fixture() {
  const state = blankState();
  state.tasks = [
    {
      id: 'a',
      title: 'Sketch',
      area: 'Music',
      project: 'p',
      notes: 'Draft',
      done: false,
    },
  ];
  state.days = {
    '2026-09-08': {
      selected: ['a'],
      mode: 'Studio day',
      note: 'Today',
      reflection: 'Reflection',
      habits: [],
    },
  };
  state.projects = [
    {
      id: 'p',
      title: 'EP',
      subtitle: 'Three tracks',
      area: 'Music',
      status: 'Active',
      outcome: 'Release',
      milestones: [{ title: 'Mix', done: false }],
    },
  ];
  state.income = [
    {
      id: 'i',
      title: 'Example payment',
      amount: 10000,
      fees: 500,
      date: '2026-09-08',
      status: 'Received',
      note: 'Invoice',
    },
  ];
  state.opportunities = [
    {
      id: 'o',
      name: 'Example contact',
      offer: 'Music',
      next: 'Send demo',
      status: 'New',
    },
  ];
  state.sessions = [
    {
      id: 's',
      taskId: 'a',
      title: 'Sketch',
      area: 'Music',
      day: '2026-09-08',
      ms: 60000,
      note: 'A melody',
      endedAt: 61000,
      completed: false,
    },
  ];
  state.guides = [
    {
      id: 'g',
      title: 'Practice',
      category: 'Music',
      intro: 'Make something',
      sections: [
        { title: 'Begin', body: 'Use a timer.', steps: ['Open the project'] },
      ],
      sources: [{ title: 'Example', url: 'https://example.com' }],
    },
  ];
  state.settings.habits = ['Read a page'];
  return state;
}

test('a fresh browser is empty; changes persist across reloads and repeated commands', () => {
  const storage = memoryStorage();
  const store = createStore(storage, blankState);
  assert.equal(store.read().state.tasks.length, 0);
  assert.equal(store.read().state.guides.length, 0);
  assert.equal(storage.getItem(KEY), null);
  store.change(addTask);
  const reopened = createStore(storage, blankState);
  assert.equal(reopened.read().state.tasks[0].title, 'Finish a sketch');
  reopened.change(addTask);
  assert.equal(reopened.read().revision, 1);
  assert.equal(reopened.read().state.tasks.length, 1);
});

test('each writer reads the latest stored state, preserving changes from another tab', () => {
  const storage = memoryStorage();
  const first = createStore(storage, blankState),
    second = createStore(storage, blankState);
  first.change(addTask);
  second.change(command('note-a', 'day.note', { note: 'Remember this' }));
  assert.equal(first.read().state.tasks.length, 1);
  assert.equal(first.read().state.days['2026-09-08'].note, 'Remember this');
});

test('full exports round trip including private guides and configurable habits', () => {
  const store = createStore(memoryStorage(), blankState);
  const original = fixture();
  store.importText(
    JSON.stringify({ ...original, exportedAt: '2026-09-08T10:00:00Z' }),
  );
  assert.deepEqual(store.read().state, original);
  store.change(command('habit-a', 'day.habit', { habit: 'Read a page' }));
  assert.deepEqual(store.read().state.days['2026-09-08'].habits, [
    'Read a page',
  ]);
  store.change(
    command('settings-a', 'settings', {
      ...original.settings,
      season: 'Next season',
    }),
  );
  assert.deepEqual(store.read().state.settings.habits, ['Read a page']);
});

test('invalid files leave existing saved records untouched', () => {
  const storage = memoryStorage(),
    store = createStore(storage, blankState);
  store.change(addTask);
  const before = storage.getItem(KEY);
  const unsafeSource = fixture();
  unsafeSource.guides[0].sources[0].url = 'javascript:alert(1)';
  const invalidDate = fixture();
  invalidDate.income[0].date = '2026-02-30';
  const missingTask = fixture();
  missingTask.days['2026-09-08'].selected = ['missing'];
  for (const raw of [
    '{',
    '{}',
    JSON.stringify(unsafeSource),
    JSON.stringify(invalidDate),
    JSON.stringify(missingTask),
  ]) {
    assert.throws(() => store.importText(raw));
    assert.equal(storage.getItem(KEY), before);
  }
});

test('unreadable saved data is retained and a valid import can recover the workspace', () => {
  const storage = memoryStorage(),
    store = createStore(storage, blankState);
  storage.setItem(KEY, 'broken data');
  assert.throws(() => store.read(), /left untouched/);
  assert.equal(storage.getItem(KEY), 'broken data');
  store.importText(JSON.stringify(fixture()));
  assert.equal(store.read().state.tasks.length, 1);
});

test('a full browser store reports failure without falsely persisting a change', () => {
  const storage = memoryStorage(),
    store = createStore(storage, blankState);
  store.change(addTask);
  const before = storage.getItem(KEY);
  storage.setItem = () => {
    throw new Error('Quota exceeded');
  };
  assert.throws(
    () => store.change(command('done-a', 'task.done', { taskId: 'task-a' })),
    /not saved/,
  );
  assert.equal(storage.getItem(KEY), before);
  assert.equal(store.read().state.tasks[0].done, false);
});

test('import pauses a running timer at export time, never counting time since the backup', () => {
  const store = createStore(memoryStorage(), blankState),
    state = fixture();
  state.timer = {
    id: 'timer-a',
    taskId: 'a',
    day: '2026-09-08',
    notes: 'In progress',
    elapsedMs: 2000,
    startedAt: 1000,
  };
  store.importText(
    JSON.stringify({ ...state, exportedAt: new Date(6000).toISOString() }),
  );
  assert.equal(store.read().state.timer.startedAt, null);
  assert.equal(store.read().state.timer.elapsedMs, 7000);
  store.importText(JSON.stringify(state));
  assert.equal(store.read().state.timer.elapsedMs, 2000);
});

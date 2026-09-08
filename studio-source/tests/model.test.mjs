import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, elapsed, collected, xp } from '../src/lib/model.ts';
const initial = () => ({
  schemaVersion: 1,
  tasks: ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    title: id,
    project: '',
    area: 'Audio & work',
    notes: '',
    done: false,
  })),
  days: {},
  timer: null,
  sessions: [],
  projects: [],
  income: [],
  opportunities: [],
  guides: [],
  applied: [],
  settings: {
    season: 'Test',
    start: '2026-09-08',
    end: '2026-12-31',
    target: 50000,
    annual: 1200000,
    cash: 100000,
    rent: 60000,
    propertyCosts: 15000,
    living: 80000,
    reward: 'Walk',
  },
});
let id = 0;
const cmd = (type, data = {}) => ({
  id: 'op-' + ++id,
  day: '2026-09-08',
  type,
  ...data,
});
const select = (s, taskId = 'a') =>
  reduce(s, cmd('task.select', { taskId }), 1000);
test('three selected actions maximum, original state unchanged', () => {
  const original = initial();
  let s = original;
  for (const taskId of ['a', 'b', 'c']) s = select(s, taskId);
  assert.throws(() => select(s, 'd'), /three actions/);
  assert.deepEqual(original.days, {});
  s = select(s, 'b');
  s = select(s, 'd');
  assert.deepEqual(s.days['2026-09-08'].selected, ['a', 'c', 'd']);
});
test('timer survives serialization, pauses once and resumes across midnight', () => {
  let s = select(initial());
  s = reduce(s, cmd('timer.start', { taskId: 'a' }), 1000);
  const timerId = s.timer.id;
  s = JSON.parse(JSON.stringify(s));
  assert.equal(elapsed(s.timer, 6500), 5500);
  s = reduce(s, cmd('timer.pause', { timerId }), 6500);
  s = reduce(s, cmd('timer.pause', { timerId }), 8000);
  assert.equal(elapsed(s.timer, 10000), 5500);
  s = reduce(
    s,
    cmd('timer.start', { taskId: 'a', timerId, day: '2026-09-09' }),
    10000,
  );
  assert.equal(elapsed(s.timer, 13000), 8500);
  assert.equal(s.timer.day, '2026-09-08');
});
test('cannot start a second task, and a stale command cannot edit a replacement session', () => {
  let s = select(select(initial()), 'b');
  s = reduce(s, cmd('timer.start', { taskId: 'a' }), 1000);
  const first = s.timer.id;
  assert.throws(
    () => reduce(s, cmd('timer.start', { taskId: 'b' }), 1200),
    /Save the current session/,
  );
  s = reduce(
    s,
    cmd('timer.finish', {
      timerId: first,
      complete: false,
      notes: 'Useful result',
    }),
    5000,
  );
  s = reduce(s, cmd('timer.start', { taskId: 'b' }), 6000);
  assert.throws(
    () =>
      reduce(
        s,
        cmd('timer.notes', { timerId: first, notes: 'Late note' }),
        6100,
      ),
    /session has changed/,
  );
  assert.equal(s.timer.notes, '');
  assert.equal(s.sessions[0].note, 'Useful result');
  assert.equal(s.tasks[0].done, false);
});
test('retrying an ambiguous finish is idempotent and cannot award points twice', () => {
  let s = select(initial());
  s = reduce(s, cmd('timer.start', { taskId: 'a' }), 1000);
  const finish = cmd('timer.finish', {
    timerId: s.timer.id,
    complete: true,
    notes: 'Done',
    minutes: 12,
  });
  s = reduce(s, finish, 9000);
  const again = reduce(s, finish, 10000);
  assert.equal(again, s);
  assert.equal(s.sessions.length, 1);
  assert.equal(s.sessions[0].ms, 720000);
  assert.equal(xp(s), 20);
});
test('income uses received cash less fees within season, rejects invalid fees', () => {
  let s = initial();
  s = reduce(
    s,
    cmd('income.add', {
      title: 'Commission',
      amount: 25000,
      fees: 2500,
      date: '2026-09-15',
      status: 'Received',
    }),
  );
  s = reduce(
    s,
    cmd('income.add', {
      title: 'Possible work',
      amount: 40000,
      fees: 0,
      date: '2026-10-01',
      status: 'Expected',
    }),
  );
  s = reduce(
    s,
    cmd('income.add', {
      title: 'Old work',
      amount: 20000,
      fees: 0,
      date: '2026-08-01',
      status: 'Received',
    }),
  );
  assert.equal(collected(s), 22500);
  assert.throws(
    () =>
      reduce(
        s,
        cmd('income.add', {
          title: 'Invalid',
          amount: 100,
          fees: 101,
          date: '2026-09-15',
          status: 'Received',
        }),
      ),
    /Fees/,
  );
});
test('daily XP is bounded and unchecking restores the right total', () => {
  let s = initial();
  for (const habit of [
    'Language practice',
    'Outside & moving',
    'A quiet moment',
    'Daily intention',
    'Time offline',
  ])
    s = reduce(s, cmd('day.habit', { habit }));
  assert.equal(xp(s), 15);
  s = reduce(s, cmd('day.reflection', { note: 'One real observation' }));
  assert.equal(xp(s), 25);
  s = reduce(s, cmd('day.reflection', { note: 'Edited, not a second reward' }));
  assert.equal(xp(s), 25);
  s = reduce(s, cmd('day.reflection', { note: '' }));
  assert.equal(xp(s), 15);
});
test('notes retain their own date; bad dates, numbers and unknown commands reject', () => {
  let s = reduce(
    initial(),
    cmd('day.note', { note: 'Yesterday', day: '2026-09-07' }),
  );
  s = reduce(s, cmd('day.note', { note: 'Today' }));
  assert.equal(s.days['2026-09-07'].note, 'Yesterday');
  assert.throws(
    () => reduce(s, cmd('day.note', { day: '__proto__', note: 'Bad' })),
    /date/,
  );
  assert.throws(
    () => reduce(s, cmd('day.note', { day: '2026-02-30', note: 'Bad' })),
    /date/,
  );
  assert.throws(
    () =>
      reduce(
        s,
        cmd('income.add', {
          title: 'Bad',
          amount: NaN,
          fees: 0,
          date: '2026-09-08',
        }),
      ),
    /amount/,
  );
  assert.throws(() => reduce(s, cmd('unknown')), /Unknown change/);
});

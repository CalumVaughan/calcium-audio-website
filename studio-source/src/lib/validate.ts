import type { State } from './model';
const bad = (): never => {
  throw new Error(
    'This is not a valid Calcium Studio export. Your current data has not changed.',
  );
};
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : bad();
const string = (v: unknown, max = 30000) =>
  typeof v === 'string' && v.length <= max ? v : bad();
const number = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : bad();
const boolean = (v: unknown) => (typeof v === 'boolean' ? v : bad());
const array = (v: unknown, max = 5000) =>
  Array.isArray(v) && v.length <= max ? v : bad();
const date = (v: unknown) => {
  const s = string(v, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s + 'T12:00:00Z')) ||
    new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) !== s
  )
    bad();
  return s;
};
const fields = (o: Record<string, unknown>, names: string[]) =>
  names.forEach((k) => string(o[k]));
export function validateState(value: unknown): State {
  const v = object(value);
  if (v.schemaVersion !== 1) bad();
  const settings = object(v.settings);
  fields(settings, ['season', 'reward']);
  date(settings.start);
  date(settings.end);
  if (String(settings.end) < String(settings.start)) bad();
  for (const key of [
    'target',
    'annual',
    'cash',
    'rent',
    'propertyCosts',
    'living',
  ]) {
    number(settings[key]);
    if (!Number.isInteger(settings[key])) bad();
  }
  if (!Number(settings.target) || !Number(settings.annual)) bad();
  if (settings.habits !== undefined)
    array(settings.habits, 20).forEach((h) => string(h, 100));
  const ids = new Set<string>();
  for (const item of array(v.tasks)) {
    const t = object(item);
    fields(t, ['id', 'title', 'project', 'area', 'notes']);
    boolean(t.done);
    if (t.completedAt !== undefined) number(t.completedAt);
    if (ids.has(String(t.id))) bad();
    ids.add(String(t.id));
  }
  for (const [key, item] of Object.entries(object(v.days))) {
    date(key);
    const d = object(item);
    fields(d, ['mode', 'note', 'reflection']);
    const selected = array(d.selected, 3);
    for (const id of selected) {
      string(id);
      if (!ids.has(String(id))) bad();
    }
    if (new Set(selected).size !== selected.length) bad();
    array(d.habits, 20).forEach((h) => string(h, 100));
  }
  if (v.timer !== null) {
    const t = object(v.timer);
    fields(t, ['taskId', 'notes']);
    if (t.id !== undefined) string(t.id);
    if (!ids.has(String(t.taskId))) bad();
    date(t.day);
    number(t.elapsedMs);
    if (t.startedAt !== null) number(t.startedAt);
  }
  for (const item of array(v.sessions, 20000)) {
    const s = object(item);
    fields(s, ['id', 'taskId', 'title', 'area', 'note']);
    date(s.day);
    number(s.ms);
    number(s.endedAt);
    boolean(s.completed);
  }
  for (const item of array(v.projects)) {
    const p = object(item);
    fields(p, ['id', 'title', 'subtitle', 'area', 'status', 'outcome']);
    for (const item of array(p.milestones, 200)) {
      const m = object(item);
      string(m.title);
      boolean(m.done);
    }
  }
  for (const item of array(v.income)) {
    const i = object(item);
    fields(i, ['id', 'title', 'note']);
    date(i.date);
    number(i.amount);
    number(i.fees);
    if (
      Number(i.fees) > Number(i.amount) ||
      !['Expected', 'Received'].includes(String(i.status))
    )
      bad();
  }
  for (const item of array(v.opportunities)) {
    fields(object(item), ['id', 'name', 'offer', 'next', 'status']);
  }
  for (const item of array(v.guides, 200)) {
    const g = object(item);
    fields(g, ['id', 'title', 'category', 'intro']);
    for (const item of array(g.sections, 100)) {
      const s = object(item);
      fields(s, ['title', 'body']);
      if (s.steps !== undefined) array(s.steps, 100).forEach((x) => string(x));
    }
    if (g.sources !== undefined)
      for (const item of array(g.sources, 100)) {
        const source = object(item);
        fields(source, ['title', 'url']);
        if (!/^https:\/\//.test(String(source.url))) bad();
      }
  }
  array(v.applied, 500).forEach((x) => string(x, 100));
  // Normalize to the supported fields; ignore unrelated export metadata.
  return {
    schemaVersion: 1,
    tasks: v.tasks,
    days: v.days,
    timer: v.timer,
    sessions: v.sessions,
    projects: v.projects,
    income: v.income,
    opportunities: v.opportunities,
    guides: v.guides,
    settings: v.settings,
    applied: v.applied,
  } as State;
}

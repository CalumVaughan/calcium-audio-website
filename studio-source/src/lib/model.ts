export const AREAS = [
  'Audio & work',
  'Music',
  'Body & habits',
  'People',
  'Languages',
  'Wonder',
  'Life admin',
] as const;
export type Area = (typeof AREAS)[number];
export const HABITS = [
  'Language practice',
  'Outside & moving',
  'A quiet moment',
  'Daily intention',
  'Time offline',
] as const;
export const MODES = [
  'Studio day',
  'Travel day',
  'Family & friends',
  'Fresh start',
] as const;
export type Task = {
  id: string;
  title: string;
  project: string;
  area: Area;
  notes: string;
  done: boolean;
  completedAt?: number;
};
export type Day = {
  selected: string[];
  mode: string;
  note: string;
  reflection: string;
  habits: string[];
};
export type Timer = {
  id?: string;
  taskId: string;
  startedAt: number | null;
  elapsedMs: number;
  notes: string;
  day: string;
};
export type Session = {
  id: string;
  taskId: string;
  title: string;
  area: Area;
  day: string;
  ms: number;
  note: string;
  endedAt: number;
  completed: boolean;
};
export type Project = {
  id: string;
  title: string;
  subtitle: string;
  area: Area;
  status: string;
  outcome: string;
  milestones: { title: string; done: boolean }[];
};
export type Income = {
  id: string;
  title: string;
  amount: number;
  fees: number;
  date: string;
  status: 'Received' | 'Expected';
  note: string;
};
export type Opportunity = {
  id: string;
  name: string;
  offer: string;
  next: string;
  status: string;
};
export type Guide = {
  id: string;
  title: string;
  category: string;
  intro: string;
  sections: { title: string; body: string; steps?: string[] }[];
  sources?: { title: string; url: string }[];
};
export type State = {
  schemaVersion: 1;
  tasks: Task[];
  days: Record<string, Day>;
  timer: Timer | null;
  sessions: Session[];
  projects: Project[];
  income: Income[];
  opportunities: Opportunity[];
  settings: {
    season: string;
    start: string;
    end: string;
    target: number;
    annual: number;
    cash: number;
    rent: number;
    propertyCosts: number;
    living: number;
    reward: string;
    habits?: string[];
  };
  guides: Guide[];
  applied: string[];
};
export type Command = {
  id: string;
  type: string;
  day: string;
  [key: string]: unknown;
};
export const emptyDay = (): Day => ({
  selected: [],
  mode: 'Studio day',
  note: '',
  reflection: '',
  habits: [],
});
export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const elapsed = (t: Timer | null, now = Date.now()) =>
  t
    ? t.elapsedMs + (t.startedAt === null ? 0 : Math.max(0, now - t.startedAt))
    : 0;
export const collected = (s: State) =>
  s.income
    .filter(
      (i) =>
        i.status === 'Received' &&
        i.date >= s.settings.start &&
        i.date <= s.settings.end,
    )
    .reduce((n, i) => n + i.amount - i.fees, 0);
export const xp = (s: State) =>
  s.tasks.filter((t) => t.done).length * 20 +
  Object.values(s.days).reduce(
    (n, d) =>
      n + Math.min(3, d.habits.length) * 5 + (d.reflection.trim() ? 10 : 0),
    0,
  );
export function reduce(original: State, c: Command, now = Date.now()): State {
  const fail = (m: string): never => {
    throw new Error(m);
  };
  const str = (v: unknown, max = 500) =>
    typeof v === 'string' && v.length <= max
      ? v
      : fail('Please shorten or check this text.');
  const text = (v: unknown, max = 500) =>
    str(v, max).trim() || fail('Please fill in the required text.');
  const num = (v: unknown, min = 0, max = 100000000) =>
    typeof v === 'number' &&
    Number.isFinite(v) &&
    Number.isInteger(v) &&
    v >= min &&
    v <= max
      ? v
      : fail('Please enter a valid amount.');
  const date = (v: unknown) => {
    const d = str(v, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !Number.isFinite(Date.parse(d + 'T12:00:00Z')) ||
      new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) !== d
    )
      fail('Please use a valid date.');
    return d;
  };
  text(c.id, 100);
  date(c.day);
  if (original.applied.includes(c.id)) return original;
  const s: State = structuredClone(original);
  const d = (s.days[c.day] ??= emptyDay());
  const task = (id: unknown) =>
    s.tasks.find((t) => t.id === id) ?? fail('That action no longer exists.');
  const timer = () => {
    const t = s.timer ?? fail('Start a session first.');
    if ((c.timerId ?? null) !== (t.id ?? null))
      fail('This session has changed. Refresh before editing it.');
    return t;
  };
  switch (c.type) {
    case 'task.add': {
      const area =
        AREAS.find((a) => a === c.area) ?? fail('Choose a life area.');
      if (s.tasks.length >= 2000)
        fail('Please export your archive before adding more actions.');
      s.tasks.push({
        id: c.id,
        title: text(c.title, 200),
        project: str(c.project ?? '', 100),
        area,
        notes: str(c.notes ?? '', 10000),
        done: false,
      });
      break;
    }
    case 'task.edit': {
      const t = task(c.taskId);
      t.title = text(c.title, 200);
      t.notes = str(c.notes ?? '', 10000);
      break;
    }
    case 'task.select': {
      const t = task(c.taskId);
      if (d.selected.includes(t.id)) {
        if (s.timer?.taskId === t.id)
          fail('Save this session before removing the action.');
        d.selected = d.selected.filter((i) => i !== t.id);
      } else {
        if (d.selected.length >= 3)
          fail('Your day has three actions. Remove one to make room.');
        if (t.done) fail('This action is already complete.');
        d.selected.push(t.id);
      }
      break;
    }
    case 'task.done': {
      const t = task(c.taskId);
      if (s.timer?.taskId === t.id)
        fail('Finish the active session to complete this action.');
      t.done = !t.done;
      t.completedAt = t.done ? now : undefined;
      break;
    }
    case 'timer.start': {
      const t = task(c.taskId);
      if (t.done) fail('This action is already complete.');
      if (!s.timer && !d.selected.includes(t.id))
        fail('Choose this action for today first.');
      if (s.timer && s.timer.taskId !== t.id)
        fail('Save the current session before switching actions.');
      if (s.timer) timer();
      if (s.timer?.startedAt != null) break;
      s.timer = s.timer
        ? { ...s.timer, startedAt: now }
        : {
            id: c.id,
            taskId: t.id,
            startedAt: now,
            elapsedMs: 0,
            notes: '',
            day: c.day,
          };
      break;
    }
    case 'timer.pause': {
      const t = timer();
      t.elapsedMs = elapsed(t, now);
      t.startedAt = null;
      break;
    }
    case 'timer.notes':
      timer().notes = str(c.notes, 10000);
      break;
    case 'timer.finish': {
      const t = timer();
      const a = task(t.taskId);
      let ms = elapsed(t, now);
      if (c.minutes !== undefined) ms = num(c.minutes, 0, 1440) * 60000;
      const note = str(c.notes ?? t.notes, 10000);
      s.sessions.unshift({
        id: c.id,
        taskId: a.id,
        title: a.title,
        area: a.area,
        day: t.day,
        ms,
        note,
        endedAt: now,
        completed: c.complete === true,
      });
      if (c.complete === true) {
        a.done = true;
        a.completedAt = now;
      }
      s.timer = null;
      break;
    }
    case 'day.mode':
      d.mode = MODES.find((m) => m === c.mode) ?? fail('Choose a day mode.');
      break;
    case 'day.note':
      d.note = str(c.note, 30000);
      break;
    case 'day.reflection':
      d.reflection = str(c.note, 30000);
      break;
    case 'day.habit': {
      const h =
        (s.settings.habits ?? HABITS).find((h) => h === c.habit) ??
        fail('Unknown habit.');
      d.habits = d.habits.includes(h)
        ? d.habits.filter((x) => x !== h)
        : [...d.habits, h];
      break;
    }
    case 'project.milestone': {
      const p =
        s.projects.find((p) => p.id === c.projectId) ??
        fail('Project missing.');
      const m = p.milestones[num(c.index, 0, p.milestones.length - 1)];
      m.done = !m.done;
      break;
    }
    case 'project.status': {
      const p =
        s.projects.find((p) => p.id === c.projectId) ??
        fail('Project missing.');
      p.status =
        ['Active', 'Next', 'Parked', 'Released'].find((x) => x === c.status) ??
        fail('Choose a status.');
      break;
    }
    case 'income.add': {
      const amount = num(c.amount),
        fees = num(c.fees);
      if (fees > amount) fail('Fees cannot exceed the payment.');
      s.income.unshift({
        id: c.id,
        title: text(c.title, 200),
        amount,
        fees,
        date: date(c.date),
        status: c.status === 'Expected' ? 'Expected' : 'Received',
        note: str(c.note ?? '', 2000),
      });
      break;
    }
    case 'income.remove':
      s.income = s.income.filter((i) => i.id !== c.incomeId);
      break;
    case 'income.receive': {
      const i =
        s.income.find((i) => i.id === c.incomeId) ?? fail('Payment missing.');
      i.status = 'Received';
      i.date = c.day;
      break;
    }
    case 'opportunity.add':
      s.opportunities.push({
        id: c.id,
        name: text(c.name, 100),
        offer: text(c.offer, 300),
        next: text(c.next, 500),
        status: 'To contact',
      });
      break;
    case 'opportunity.edit': {
      const o =
        s.opportunities.find((o) => o.id === c.opportunityId) ??
        fail('Contact missing.');
      o.next = text(c.next, 500);
      o.status =
        ['To contact', 'Conversation', 'Proposal', 'Booked', 'Closed'].find(
          (x) => x === c.status,
        ) ?? fail('Choose a status.');
      break;
    }
    case 'settings': {
      const season = text(c.season, 100),
        start = date(c.start),
        end = date(c.end);
      if (end < start) fail('The end date must follow the start.');
      s.settings = {
        ...(s.settings.habits ? { habits: [...s.settings.habits] } : {}),
        season,
        start,
        end,
        target: num(c.target, 1),
        annual: num(c.annual, 1),
        cash: num(c.cash),
        rent: num(c.rent),
        propertyCosts: num(c.propertyCosts),
        living: num(c.living),
        reward: text(c.reward, 300),
      };
      break;
    }
    default:
      fail('Unknown change. Please refresh the page.');
  }
  s.applied = [...s.applied, c.id].slice(-500);
  return s;
}

import { dateKey, type State } from './model.ts';
export function blankState(): State {
  const end = new Date();
  end.setDate(end.getDate() + 90);
  return {
    schemaVersion: 1,
    tasks: [],
    days: {},
    timer: null,
    sessions: [],
    projects: [],
    income: [],
    opportunities: [],
    guides: [],
    applied: [],
    settings: {
      season: 'My creative season',
      start: dateKey(),
      end: dateKey(end),
      target: 50000,
      annual: 1200000,
      cash: 0,
      rent: 0,
      propertyCosts: 0,
      living: 0,
      reward: 'Time for something I enjoy.',
    },
  };
}

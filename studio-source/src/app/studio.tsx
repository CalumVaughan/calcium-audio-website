'use client';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import {
  AudioLines,
  Sun,
  Flag,
  BookOpen,
  Wallet,
  NotebookPen,
  ChartNoAxesColumnIncreasing,
  Settings,
  Plus,
  Play,
  Pause,
  Check,
  ArrowUpRight,
  X,
  HardDrive,
  RefreshCw,
  LockKeyhole,
  Leaf,
  Headphones,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  AREAS,
  HABITS,
  MODES,
  dateKey,
  emptyDay,
  elapsed,
  collected,
  xp,
  type State,
  type Task,
  type Guide,
  type Command,
} from '@/lib/model';
import { Projects, Money, Review, SettingsPage, FieldGuide } from './views';
import { studioFetch, subscribeToStorage } from '@/lib/storage';
import { ImportPlan } from './backup';

export const money = (p: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: p % 100 ? 2 : 0,
  }).format(p / 100);
export const duration = (ms: number) => {
  const n = Math.floor(ms / 1000);
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
};
type StudioReply = {
  state: State;
  revision: number;
  local: boolean;
  error?: string;
};
export type Send = (data: Record<string, unknown>) => Promise<boolean>;
export function Pick({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Tag({ area }: { area: string }) {
  return (
    <span
      className={
        'tag ' +
        (area === 'Music'
          ? 'music'
          : area === 'People'
            ? 'people'
            : area === 'Languages'
              ? 'languages'
              : area === 'Wonder'
                ? 'wonder'
                : '')
      }
    >
      {area}
    </span>
  );
}
export function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'panel ' + className}>
      {title && (
        <div className="panel-head">
          <h2>{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Notes({
  value,
  onSave,
  placeholder,
  label,
}: {
  value: string;
  onSave: (v: string) => Promise<boolean>;
  placeholder: string;
  label: string;
}) {
  const [text, setText] = useState(value),
    [status, setStatus] = useState('Saved'),
    dirty = useRef(false),
    saveRef = useRef(onSave),
    textRef = useRef(value);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    if (!dirty.current) {
      setText(value);
      textRef.current = value;
    }
  }, [value]);
  const save = useCallback(async () => {
    if (!dirty.current) return;
    const current = textRef.current;
    setStatus('Saving…');
    const ok = await saveRef.current(current);
    if (ok && textRef.current === current) {
      dirty.current = false;
      setStatus('Saved');
    } else if (!ok) setStatus('Not saved · retry below');
  }, []);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(save, 900);
    return () => clearTimeout(t);
  }, [text, save]);
  useEffect(
    () => () => {
      if (dirty.current) void save();
    },
    [save],
  );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return (
    <div className="note-editor">
      <Textarea
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onBlur={() => void save()}
        onChange={(e) => {
          dirty.current = true;
          textRef.current = e.target.value;
          setText(e.target.value);
          setStatus('Unsaved draft');
        }}
      />
      <div className="note-footer">
        <span>
          {status} · {text.length} characters
        </span>
        <Button variant="ghost" onClick={() => void save()}>
          Save note
        </Button>
      </div>
    </div>
  );
}
export default function Studio() {
  const [state, setState] = useState<State | null>(null),
    [page, setPage] = useState('Today'),
    [error, setError] = useState(''),
    [local, setLocal] = useState(false),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState(0);
  const revision = useRef(-1),
    queue = useRef(Promise.resolve()),
    failed = useRef<Command | null>(null);
  const [dialog, setDialog] = useState<'choose' | 'add' | 'finish' | null>(
      null,
    ),
    [edit, setEdit] = useState<Task | null>(null),
    [now, setNow] = useState(() => Date.now()),
    [finishNote, setFinishNote] = useState(''),
    [timerDraft, setTimerDraft] = useState(''),
    [adjust, setAdjust] = useState('');
  const [title, setTitle] = useState(''),
    [area, setArea] = useState<string>('Audio & work'),
    [project, setProject] = useState(''),
    [taskNote, setTaskNote] = useState('');
  const timerDirty = useRef(false),
    timerText = useRef(''),
    timerSource = useRef('');
  const [timerNoteStatus, setTimerNoteStatus] = useState('Saved');
  const [search, setSearch] = useState(''),
    [guide, setGuide] = useState<Guide | null>(null);
  const accept = useCallback((j: StudioReply) => {
    if (j.revision >= revision.current) {
      revision.current = j.revision;
      setState(j.state);
      setLocal(j.local);
    }
  }, []);
  const load = useCallback(async () => {
    try {
      const r = await studioFetch('/api/studio', { cache: 'no-store' });
      const j = (await r.json()) as StudioReply;
      if (!r.ok) throw new Error(j.error);
      accept(j);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your studio.');
    } finally {
      setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && pending === 0 && !failed.current) void load();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load, pending]);
  useEffect(
    () =>
      subscribeToStorage(() => {
        void load();
      }),
    [load],
  );
  const send: Send = useCallback(
    (data) =>
      new Promise((resolve) => {
        const command = {
          id: crypto.randomUUID(),
          day: dateKey(),
          ...data,
        } as Command;
        setPending((n) => n + 1);
        queue.current = queue.current.then(async () => {
          try {
            if (failed.current && failed.current.id !== command.id) {
              setError('Retry the unconfirmed change before making another.');
              resolve(false);
              return;
            }
            const r = await studioFetch('/api/studio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(command),
            });
            const j = (await r.json()) as StudioReply;
            if (!r.ok) {
              if (r.status >= 500 || r.status === 409) failed.current = command;
              throw new Error(j.error || 'Could not save.');
            }
            accept(j);
            if (failed.current?.id === command.id) failed.current = null;
            setError('');
            resolve(true);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : 'Connection lost. Keep this page open and retry.',
            );
            if (e instanceof TypeError) failed.current = command;
            resolve(false);
          } finally {
            setPending((n) => n - 1);
          }
        });
      }),
    [accept],
  );
  const retry = async () => {
    const c = failed.current;
    if (!c) {
      void load();
      return;
    }
    await send(c);
  };
  const timerKey = state?.timer
    ? (state.timer.id ?? state.timer.taskId + state.timer.day)
    : '';
  const timerServerNotes = state?.timer?.notes ?? '';
  const activeTimerId = state?.timer?.id;
  // oxlint-disable-next-line react/react-compiler -- Preserve an unsaved edit while synchronizing changes from other sessions/devices.
  useEffect(() => {
    if (timerSource.current !== timerKey || !timerDirty.current) {
      timerSource.current = timerKey;
      timerDirty.current = false;
      timerText.current = timerServerNotes;
      setTimerDraft(timerServerNotes);
      setTimerNoteStatus('Saved');
    }
  }, [timerKey, timerServerNotes]);
  useEffect(() => {
    if (!timerDirty.current || !timerKey) return;
    const t = setTimeout(async () => {
      setTimerNoteStatus('Saving…');
      const ok = await send({
        type: 'timer.notes',
        timerId: activeTimerId,
        notes: timerDraft,
      });
      if (ok && timerText.current === timerDraft) {
        timerDirty.current = false;
        setTimerNoteStatus('Saved');
      } else if (!ok) setTimerNoteStatus('Not saved · retry');
    }, 800);
    return () => clearTimeout(t);
  }, [timerDraft, timerKey, activeTimerId, send]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (failed.current || timerDirty.current || pending) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  const day = dateKey(new Date(now));
  const d = state?.days[day] ?? emptyDay();
  const timer = state?.timer;
  const completed =
    state?.tasks.filter((t) => t.done && d.selected.includes(t.id)).length ?? 0;
  const task = state?.tasks.find((t) => t.id === timer?.taskId);
  const saveTask = async () => {
    if (
      await send(
        edit
          ? { type: 'task.edit', taskId: edit.id, title, notes: taskNote }
          : { type: 'task.add', title, area, project, notes: taskNote },
      )
    ) {
      setDialog(null);
      setEdit(null);
      setTitle('');
      setTaskNote('');
    }
  };
  const openAdd = () => {
    setEdit(null);
    setTitle('');
    setTaskNote('');
    setArea('Audio & work');
    setProject('');
    setDialog('add');
  };
  const openEdit = (t: Task) => {
    setEdit(t);
    setTitle(t.title);
    setTaskNote(t.notes);
    setDialog('add');
  };
  const choose = (id: string) => void send({ type: 'task.select', taskId: id });
  const nav = [
    ['Today', Sun],
    ['Projects', Flag],
    ['Money', Wallet],
    ['Diary', NotebookPen],
    ['Review', ChartNoAxesColumnIncreasing],
    ['Field guide', BookOpen],
  ] as const;
  if (loading)
    return (
      <main className="min-h-screen grid place-items-center">
        <div className="stack">
          <div className="brand">
            <span className="brand-mark">Ca</span> Calcium Studio
          </div>
          <p>Opening your studio…</p>
        </div>
      </main>
    );
  if (!state)
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <Panel>
          <h1>Your saved workspace needs attention.</h1>
          <p className="my-5">{error}</p>
          <div className="row wrap">
            <Button onClick={() => void load()}>Try again</Button>
            <ImportPlan />
          </div>
        </Panel>
      </main>
    );
  const points = xp(state);
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '218px' } as React.CSSProperties}
    >
      <Sidebar>
        <SidebarHeader className="px-6 py-7">
          <div className="brand">
            <span className="brand-mark">Ca</span> Calcium
            <span className="accent">.</span>
          </div>
          <span className="eyebrow mt-2 pl-1">PRIVATE / STUDIO</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-4">
            <div className="eyebrow px-3 mb-3 mt-3">Workspace</div>
            <SidebarMenu>
              {nav.map(([name, Icon]) => (
                <SidebarMenuItem key={name}>
                  <SidebarMenuButton
                    isActive={page === name}
                    onClick={() => {
                      setPage(name);
                      setGuide(null);
                    }}
                  >
                    <Icon />
                    <span>{name}</span>
                    {name === 'Today' && (
                      <span className="ml-auto small">{completed}/3</span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <div className="mx-5 mt-8 p-4 rounded-xl border border-border">
            <div className="row between">
              <span className="eyebrow">Momentum</span>
              <span className="accent small">{points} XP</span>
            </div>
            <p className="text-sm my-3">Completed work. Recorded life.</p>
            <Progress
              value={points % 100}
              aria-label="Progress to next 100 experience points"
            />
            <p className="small mt-3">
              {100 - (points % 100)} XP to the next marker
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter className="px-5 pb-6">
          <SidebarMenuButton
            isActive={page === 'Settings'}
            onClick={() => setPage('Settings')}
          >
            <Settings />
            <span>Settings & backup</span>
          </SidebarMenuButton>
          <div className="row small px-3 pt-4">
            <LockKeyhole size={13} /> Stored on this device
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="topbar-left">
            <SidebarTrigger />
            <span className="small">
              Studio <span className="mx-2">/</span>
              <span className="text-foreground">{page}</span>
            </span>
          </div>
          <div className="row">
            <span className="save-status">
              {pending ? (
                <RefreshCw size={14} />
              ) : error ? (
                <X size={14} />
              ) : (
                <HardDrive size={14} />
              )}{' '}
              {pending
                ? 'Saving…'
                : error
                  ? 'Needs attention'
                  : local
                    ? 'Saved in this browser'
                    : 'Online'}
            </span>
            <span className="tag hide-small">SEASON 01</span>
          </div>
        </header>
        <div className="shell-content">
          {!state.guides.length && (
            <div className="setup-strip">
              <div>
                <h2>Bring in your private plan</h2>
                <p>
                  The app is ready. Import your plan file to load your projects,
                  goals and field guide. Your records stay in this browser.
                </p>
              </div>
              <ImportPlan />
            </div>
          )}
          {error && (
            <div role="alert" className="alert-box">
              <span>{error}</span>
              <Button variant="outline" onClick={() => void retry()}>
                Retry
              </Button>
            </div>
          )}
          {page === 'Today' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow mb-3">
                    {new Date(now).toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </div>
                  <h1>Today.</h1>
                  <p>Choose three actions. Work on one. Leave a record.</p>
                </div>
                <Pick
                  value={d.mode}
                  options={[...MODES]}
                  label="Day mode"
                  onChange={(mode) => void send({ type: 'day.mode', mode })}
                />
              </div>
              {d.mode !== 'Studio day' && (
                <div className="alert-box">
                  <span>
                    {d.mode === 'Travel day'
                      ? 'Travel counts. Choose one small action, eat, walk and arrive.'
                      : d.mode === 'Family & friends'
                        ? 'Keep one small anchor. Give the people you are with your attention.'
                        : 'Get dressed, step outside and do ten minutes of one useful thing. Start from here.'}
                  </span>
                </div>
              )}
              <div className="today-grid">
                <div className="stack">
                  <Panel
                    title="01 / Daily actions"
                    aside={
                      <Button
                        variant="ghost"
                        onClick={() => setDialog('choose')}
                      >
                        <Pencil size={14} /> Choose actions
                      </Button>
                    }
                  >
                    {d.selected.map((id, i) => {
                      const t = state.tasks.find((t) => t.id === id);
                      if (!t) return null;
                      return (
                        <div
                          className={'task-row ' + (t.done ? 'task-done' : '')}
                          key={id}
                        >
                          <span className="task-number">0{i + 1}</span>
                          <div className="task-copy">
                            <button
                              className="task-title"
                              onClick={() => openEdit(t)}
                            >
                              {t.title}
                            </button>
                            <div>
                              <Tag area={t.area} />
                            </div>
                          </div>
                          <div className="task-actions">
                            {t.done ? (
                              <Button
                                variant="ghost"
                                aria-label={'Reopen ' + t.title}
                                onClick={() =>
                                  void send({ type: 'task.done', taskId: id })
                                }
                              >
                                <Check className="green" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant={
                                    timer?.taskId === id
                                      ? 'secondary'
                                      : 'outline'
                                  }
                                  disabled={
                                    (!!timer && timer.taskId !== id) ||
                                    pending > 0
                                  }
                                  aria-label={'Start ' + t.title}
                                  onClick={() =>
                                    void send({
                                      type: 'timer.start',
                                      taskId: id,
                                      timerId: timer?.id,
                                    })
                                  }
                                >
                                  <Play size={13} />
                                  <span className="hidden sm:inline">
                                    {timer?.taskId === id ? 'Resume' : 'Start'}
                                  </span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  aria-label={'Complete ' + t.title}
                                  disabled={timer?.taskId === id}
                                  onClick={() =>
                                    void send({ type: 'task.done', taskId: id })
                                  }
                                >
                                  <Check size={14} />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {Array.from({ length: 3 - d.selected.length }, (_, i) => (
                      <button
                        className="empty-slot"
                        key={i}
                        onClick={() => setDialog('choose')}
                      >
                        <Plus size={16} /> Choose action{' '}
                        {d.selected.length + i + 1}
                      </button>
                    ))}
                    <div className="statline">
                      <div>
                        <strong>
                          {completed}
                          <span> / 3</span>
                        </strong>
                        <span>actions finished</span>
                      </div>
                      <div>
                        <strong>
                          {Math.round(
                            state.sessions
                              .filter((s) => s.day === day)
                              .reduce((n, s) => n + s.ms, 0) / 60000,
                          )}
                          <span> min</span>
                        </strong>
                        <span>sessions recorded</span>
                      </div>
                      <div>
                        <strong>
                          {d.habits.length}
                          <span> / 5</span>
                        </strong>
                        <span>personal anchors</span>
                      </div>
                    </div>
                  </Panel>
                  <Panel
                    title="02 / Notebook"
                    aside={<NotebookPen size={18} className="muted" />}
                  >
                    <Notes
                      key={day}
                      value={d.note}
                      label="Daily notes"
                      placeholder="An idea, a conversation, something you noticed. No need to make it profound."
                      onSave={(note) => send({ type: 'day.note', day, note })}
                    />
                  </Panel>
                  <Panel
                    title="03 / Activity"
                    aside={
                      <Button variant="ghost" onClick={() => setPage('Diary')}>
                        Open diary <ArrowUpRight />
                      </Button>
                    }
                  >
                    {state.sessions.filter((s) => s.day === day).length ? (
                      state.sessions
                        .filter((s) => s.day === day)
                        .map((s) => (
                          <div className="feed-item" key={s.id}>
                            <div className="row between">
                              <strong className="text-sm">{s.title}</strong>
                              <span className="small">
                                {Math.round(s.ms / 60000)} min
                              </span>
                            </div>
                            <p>
                              {s.note ||
                                'A session recorded. You can pick this up again.'}
                            </p>
                          </div>
                        ))
                    ) : (
                      <Empty>
                        <Headphones size={24} />
                        Your first session will appear here.
                        <br />A record of doing, not another to-do list.
                      </Empty>
                    )}
                  </Panel>
                </div>
                <div className="stack">
                  <Panel className="focus-panel">
                    <div className="row between">
                      <span className="eyebrow accent">
                        {timer ? (
                          <>
                            <span className="live-dot" />
                            {timer.startedAt
                              ? 'Session running'
                              : 'Session paused'}
                          </>
                        ) : (
                          'Session / idle'
                        )}
                      </span>
                      <AudioLines size={20} className="accent" />
                    </div>
                    <div className="timer-clock">
                      {duration(elapsed(timer ?? null, now))}
                    </div>
                    <h3>{task?.title || 'No active session'}</h3>
                    <p className="sub mt-2">
                      {timer
                        ? 'Keep this open while you work. Pauses are allowed.'
                        : 'Start one of today’s actions. Your time and notes will stay together.'}
                    </p>
                    {timer ? (
                      <>
                        <Textarea
                          aria-label="Session notes"
                          placeholder="What are you trying? What changed?"
                          value={timerDraft}
                          onChange={(e) => {
                            timerDirty.current = true;
                            timerText.current = e.target.value;
                            setTimerNoteStatus('Unsaved draft');
                            setTimerDraft(e.target.value);
                          }}
                        />
                        <div className="row buttons wrap">
                          <Button
                            variant="outline"
                            disabled={pending > 0}
                            onClick={() =>
                              void send({
                                type: timer.startedAt
                                  ? 'timer.pause'
                                  : 'timer.start',
                                taskId: timer.taskId,
                                timerId: timer.id,
                              })
                            }
                          >
                            {timer.startedAt ? <Pause /> : <Play />}
                            {timer.startedAt ? 'Pause' : 'Resume'}
                          </Button>
                          <Button
                            disabled={pending > 0}
                            onClick={() => {
                              setFinishNote(timerDraft);
                              setAdjust('');
                              setDialog('finish');
                            }}
                          >
                            Save session <Check />
                          </Button>
                        </div>
                        <p className="small mt-3">
                          {timerNoteStatus} · session notes save automatically.
                        </p>
                      </>
                    ) : (
                      <div className="idle-label">
                        <span>Ready when you are</span>
                        <span>REC — OFF</span>
                      </div>
                    )}
                  </Panel>
                  <div className="goal-panel">
                    <div className="row between">
                      <span className="eyebrow">Season income</span>
                      <Flag size={16} className="accent" />
                    </div>
                    <div className="goal-number mt-3">
                      {money(collected(state))}
                      <span> / {money(state.settings.target)}</span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        (collected(state) / state.settings.target) * 100,
                      )}
                      aria-label="Creative income received toward season goal"
                    />
                    <p className="small">
                      Creative payments received · through{' '}
                      {new Date(
                        state.settings.end + 'T12:00:00',
                      ).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <Button
                      variant="ghost"
                      className="mt-2 -ml-3"
                      onClick={() => setPage('Money')}
                    >
                      Open payments <ArrowUpRight />
                    </Button>
                  </div>
                  <Panel
                    title="Daily anchors"
                    aside={<Leaf size={18} className="green" />}
                  >
                    {(state.settings.habits ?? HABITS).map((h, i) => (
                      <div className="habit-row" key={h}>
                        <label htmlFor={'habit-' + i}>{h}</label>
                        <Checkbox
                          id={'habit-' + i}
                          checked={d.habits.includes(h)}
                          onCheckedChange={() =>
                            void send({ type: 'day.habit', habit: h })
                          }
                        />
                      </div>
                    ))}
                    <p className="small mt-4">
                      Optional anchors. An unchecked box is information, not a
                      verdict.
                    </p>
                  </Panel>
                </div>
              </div>
            </>
          )}
          {page === 'Projects' && (
            <Projects state={state} send={send} openAdd={openAdd} />
          )}
          {page === 'Money' && (
            <Money state={state} send={send} error={error} />
          )}
          {page === 'Field guide' && (
            <FieldGuide
              state={state}
              guide={guide}
              setGuide={setGuide}
              send={send}
            />
          )}
          {page === 'Review' && <Review state={state} send={send} />}
          {page === 'Settings' && <SettingsPage state={state} send={send} />}
          {page === 'Diary' && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Diary.</h1>
                  <p>
                    Sessions, small wins and passing thoughts. No rereading
                    obligation.
                  </p>
                </div>
              </div>
              <div className="stack">
                {[
                  ...new Set([
                    day,
                    ...Object.keys(state.days),
                    ...state.sessions.map((s) => s.day),
                  ]),
                ]
                  .sort()
                  .reverse()
                  .map((key) => {
                    const diary = state.days[key] ?? emptyDay();
                    return (
                      <Panel
                        key={key}
                        title={new Date(key + 'T12:00:00').toLocaleDateString(
                          'en-GB',
                          { weekday: 'long', day: 'numeric', month: 'long' },
                        )}
                        aside={<span className="tag">{diary.mode}</span>}
                      >
                        <div className="grid-2">
                          <div>
                            <Notes
                              value={diary.note}
                              label={'Notes for ' + key}
                              placeholder="What happened? What caught your attention?"
                              onSave={(note) =>
                                send({ type: 'day.note', day: key, note })
                              }
                            />
                            <div className="row wrap mt-4">
                              {diary.habits.map((h) => (
                                <span className="tag" key={h}>
                                  <Check size={12} />
                                  {h}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            {state.sessions
                              .filter((s) => s.day === key)
                              .map((s) => (
                                <div className="feed-item" key={s.id}>
                                  <div className="row between">
                                    <strong>{s.title}</strong>
                                    <span className="small">
                                      {duration(s.ms)}
                                    </span>
                                  </div>
                                  <p>{s.note || 'Session saved.'}</p>
                                </div>
                              ))}
                            {!state.sessions.some((s) => s.day === key) && (
                              <p className="sub">No timed sessions recorded.</p>
                            )}
                            <div className="mt-6">
                              <h3 className="mb-3">Reflection</h3>
                              <Notes
                                value={diary.reflection}
                                label={'Reflection for ' + key}
                                placeholder="One thing that moved forward. One thing to change tomorrow."
                                onSave={(note) =>
                                  send({
                                    type: 'day.reflection',
                                    day: key,
                                    note,
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </Panel>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      </SidebarInset>
      <Dialog
        open={dialog !== null}
        onOpenChange={(v) => !v && setDialog(null)}
      >
        <DialogContent>
          {error && (
            <div className="alert-box" role="alert">
              {error}
            </div>
          )}
          <DialogTitle>
            {dialog === 'choose'
              ? 'Choose today’s three'
              : dialog === 'finish'
                ? 'Save session'
                : edit
                  ? 'Edit action'
                  : 'New action'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'choose'
              ? 'Pick a useful result, a creative step, and room for life. You can choose fewer on a lighter day.'
              : dialog === 'finish'
                ? 'Save what happened. The action can stay open for another session.'
                : 'A small, specific action is easier to start than an entire ambition.'}
          </DialogDescription>
          {dialog === 'choose' && (
            <>
              <div className="row">
                <Input
                  aria-label="Search actions"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find an action…"
                />
                <Button onClick={openAdd}>
                  <Plus /> New
                </Button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto">
                {state.tasks
                  .filter(
                    (t) =>
                      (!t.done || d.selected.includes(t.id)) &&
                      (t.title + ' ' + t.area)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((t) => (
                    <div className="task-row" key={t.id}>
                      <Checkbox
                        aria-label={'Choose ' + t.title}
                        checked={d.selected.includes(t.id)}
                        disabled={
                          !d.selected.includes(t.id) && d.selected.length >= 3
                        }
                        onCheckedChange={() => choose(t.id)}
                      />
                      <div className="task-copy">
                        <button
                          className="task-title"
                          onClick={() => openEdit(t)}
                        >
                          {t.title}
                        </button>
                        <div>
                          <Tag area={t.area} />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              <Button onClick={() => setDialog(null)}>
                That’s my day · {d.selected.length}/3
              </Button>
            </>
          )}
          {dialog === 'add' && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void saveTask();
              }}
            >
              <Field label="The next action">
                <Input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Export a rough mix of track one"
                />
              </Field>
              {!edit && (
                <div className="form-grid">
                  <Field label="Life area">
                    <Pick
                      value={area}
                      options={[...AREAS]}
                      label="Life area"
                      onChange={setArea}
                    />
                  </Field>
                  <Field label="Project (optional)">
                    <Input
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    />
                  </Field>
                </div>
              )}
              <Field label="Notes / what done looks like">
                <Textarea
                  value={taskNote}
                  onChange={(e) => setTaskNote(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={pending > 0}>
                {edit ? 'Save action' : 'Add to the action list'}
              </Button>
            </form>
          )}
          {dialog === 'finish' && (
            <div className="form-stack">
              <Field label="Session notes">
                <Textarea
                  value={finishNote}
                  onChange={(e) => setFinishNote(e.target.value)}
                  placeholder="What changed? Where do you pick it up next?"
                />
              </Field>
              <Field label="Correct the time, if you left it running (minutes, optional)">
                <Input
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  value={adjust}
                  onChange={(e) => setAdjust(e.target.value)}
                  placeholder={String(
                    Math.round(elapsed(timer ?? null, now) / 60000),
                  )}
                />
              </Field>
              <div className="row wrap">
                <Button
                  variant="outline"
                  disabled={pending > 0}
                  onClick={async () => {
                    if (
                      await send({
                        type: 'timer.finish',
                        timerId: timer?.id,
                        notes: finishNote,
                        ...(adjust !== '' ? { minutes: Number(adjust) } : {}),
                        complete: false,
                      })
                    )
                      setDialog(null);
                  }}
                >
                  Save · keep action open
                </Button>
                <Button
                  disabled={pending > 0}
                  onClick={async () => {
                    if (
                      await send({
                        type: 'timer.finish',
                        timerId: timer?.id,
                        notes: finishNote,
                        ...(adjust !== '' ? { minutes: Number(adjust) } : {}),
                        complete: true,
                      })
                    )
                      setDialog(null);
                  }}
                >
                  <Check /> Save & complete action
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

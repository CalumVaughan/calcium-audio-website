import { ImportPlan } from './backup';
('use client');
import { useState } from 'react';
import {
  Plus,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  dateKey,
  collected,
  xp,
  emptyDay,
  type State,
  type Guide,
  type Opportunity,
} from '@/lib/model';
import {
  Panel,
  Field,
  Pick,
  Tag,
  Empty,
  Notes,
  money,
  type Send,
} from './studio';

export function Projects({
  state,
  send,
  openAdd,
}: {
  state: State;
  send: Send;
  openAdd: () => void;
}) {
  const [filter, setFilter] = useState('All');
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow mb-3">Projects / next steps</div>
          <h1>Projects.</h1>
          <p>Keep your active projects small and their finish lines clear.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus /> New action
        </Button>
      </div>
      <div className="path-strip">
        {[
          [
            '01 · ARRIVE',
            'Find your rhythm',
            'Settle in and choose a working rhythm.',
          ],
          [
            '02 · RELEASE',
            'Ship something real',
            'Finish and share an existing project.',
          ],
          [
            '03 · CONNECT',
            'Make work with people',
            'Small paid offers and warm conversations.',
          ],
          [
            '04 · KEEP GOING',
            'Leave with evidence',
            'Payments, releases and a clear next step.',
          ],
        ].map(([a, b, c]) => (
          <div key={a}>
            <span className="eyebrow accent">{a}</span>
            <strong>{b}</strong>
            <p>{c}</p>
          </div>
        ))}
      </div>
      <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
        <TabsList className="mb-5">
          {['All', 'Active', 'Next', 'Parked', 'Released'].map((v) => (
            <TabsTrigger key={v} value={v} className="px-3">
              {v}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="grid-2">
          {state.projects
            .filter((p) => filter === 'All' || p.status === filter)
            .map((p) => (
              <Panel key={p.id} className="project-card">
                <div className="project-top">
                  <div>
                    <Tag area={p.area} />
                    <h2>{p.title}</h2>
                    <p>{p.subtitle}</p>
                  </div>
                  <Pick
                    value={p.status}
                    options={['Active', 'Next', 'Parked', 'Released']}
                    label={'Status of ' + p.title}
                    onChange={(status) =>
                      void send({
                        type: 'project.status',
                        projectId: p.id,
                        status,
                      })
                    }
                  />
                </div>
                <p>{p.outcome}</p>
                <div className="row between small mb-2">
                  <span>Evidence of progress</span>
                  <span>
                    {p.milestones.filter((m) => m.done).length}/
                    {p.milestones.length}
                  </span>
                </div>
                <Progress
                  value={
                    (p.milestones.filter((m) => m.done).length /
                      p.milestones.length) *
                    100
                  }
                  aria-label={p.title + ' milestones'}
                />
                <div className="milestones">
                  {p.milestones.map((m, i) => (
                    <label className="milestone" key={i}>
                      <Checkbox
                        checked={m.done}
                        onCheckedChange={() =>
                          void send({
                            type: 'project.milestone',
                            projectId: p.id,
                            index: i,
                          })
                        }
                      />
                      <span className={m.done ? 'muted line-through' : ''}>
                        {m.title}
                      </span>
                    </label>
                  ))}
                </div>
              </Panel>
            ))}
        </div>
      </Tabs>
      <div className="mt-6">
        <Panel
          title="The action list"
          aside={
            <span className="small">
              {state.tasks.filter((t) => !t.done).length} open
            </span>
          }
        >
          {state.tasks.map((t) => (
            <div className="task-row" key={t.id}>
              <Checkbox
                aria-label={'Complete ' + t.title}
                disabled={state.timer?.taskId === t.id}
                checked={t.done}
                onCheckedChange={() =>
                  void send({ type: 'task.done', taskId: t.id })
                }
              />
              <div className="task-copy">
                <h3 className={t.done ? 'line-through muted' : ''}>
                  {t.title}
                </h3>
                <p className="sub mt-1">{t.notes}</p>
                <div className="mt-2">
                  <Tag area={t.area} />
                </div>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}
export function Money({
  state,
  send,
  error,
}: {
  state: State;
  send: Send;
  error: string;
}) {
  const [modal, setModal] = useState<
      'payment' | 'contact' | 'edit' | 'remove' | null
    >(null),
    [selected, setSelected] = useState<Opportunity | null>(null),
    [remove, setRemove] = useState('');
  const [title, setTitle] = useState(''),
    [amount, setAmount] = useState(''),
    [fees, setFees] = useState('0'),
    [date, setDate] = useState(dateKey()),
    [status, setStatus] = useState('Received'),
    [note, setNote] = useState('');
  const [name, setName] = useState(''),
    [offer, setOffer] = useState(''),
    [next, setNext] = useState(''),
    [stage, setStage] = useState('To contact'),
    [busy, setBusy] = useState(false);
  const total = collected(state),
    expected = state.income
      .filter((i) => i.status === 'Expected')
      .reduce((n, i) => n + i.amount - i.fees, 0);
  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const ok = await send(
      modal === 'payment'
        ? {
            type: 'income.add',
            title,
            amount: Math.round(Number(amount) * 100),
            fees: Math.round(Number(fees) * 100),
            date,
            status,
            note,
          }
        : modal === 'edit'
          ? {
              type: 'opportunity.edit',
              opportunityId: selected?.id,
              next,
              status: stage,
            }
          : { type: 'opportunity.add', name, offer, next },
    );
    setBusy(false);
    if (ok) {
      setModal(null);
      setTitle('');
      setAmount('');
      setFees('0');
      setNote('');
      setName('');
      setOffer('');
      setNext('');
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow mb-3">Creative work → actual payments</div>
          <h1>Money.</h1>
          <p>
            {money(state.settings.target)} in total this season. A first step
            towards {money(state.settings.annual)} a year.
          </p>
        </div>
        <Button
          onClick={() => {
            setDate(dateKey());
            setStatus('Received');
            setModal('payment');
          }}
        >
          <Plus /> Log a payment
        </Button>
      </div>
      <div className="grid-3 mb-6">
        <div className="metric">
          <span className="eyebrow">Received this season</span>
          <strong className="accent">{money(total)}</strong>
          <Progress
            value={Math.min(100, (total / state.settings.target) * 100)}
            aria-label="Income target progress"
          />
          <p className="mt-3">
            of {money(state.settings.target)} · fees deducted, before personal
            tax
          </p>
        </div>
        <div className="metric">
          <span className="eyebrow">Expected · not received</span>
          <strong>{money(expected)}</strong>
          <p>Only received payments move the season goal.</p>
        </div>
        <div className="metric">
          <span className="eyebrow">Conversations in motion</span>
          <strong>
            {
              state.opportunities.filter((o) =>
                ['Conversation', 'Proposal', 'Booked'].includes(o.status),
              ).length
            }
          </strong>
          <p>A useful offer and a next step beat endless posting.</p>
        </div>
      </div>
      <Panel
        title="Payments"
        aside={<span className="small">Manually recorded · GBP</span>}
      >
        {state.income.length ? (
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                {['Work', 'Date', 'Net payment', 'Status', ''].map((h, i) => (
                  <TableHead key={i}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.income.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <strong>{i.title}</strong>
                    {i.note && <p className="small">{i.note}</p>}
                  </TableCell>
                  <TableCell>{i.date}</TableCell>
                  <TableCell>
                    {money(i.amount - i.fees)}
                    <p className="small">{money(i.fees)} fees</p>
                  </TableCell>
                  <TableCell>
                    {i.status === 'Expected' ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          void send({ type: 'income.receive', incomeId: i.id })
                        }
                      >
                        Mark received
                      </Button>
                    ) : (
                      <span className="green row">
                        <Check size={14} /> Received
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      aria-label={'Remove ' + i.title}
                      onClick={() => {
                        setRemove(i.id);
                        setModal('remove');
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>
            <Wallet size={24} />
            Start with the first actual payment.
            <br />
            The comedy track can become your first entry when it is paid.
          </Empty>
        )}
      </Panel>
      <div className="mt-6">
        <Panel
          title="People to make things with"
          aside={
            <Button variant="outline" onClick={() => setModal('contact')}>
              <Plus /> Add a lead
            </Button>
          }
        >
          <div className="grid-3">
            {state.opportunities.map((o) => (
              <div key={o.id} className="p-5 rounded-xl border border-border">
                <span className="tag mb-3">{o.status}</span>
                <h3>{o.name}</h3>
                <p className="sub mt-2">{o.offer}</p>
                <div className="border-t border-border mt-4 pt-4">
                  <span className="eyebrow">Next move</span>
                  <p className="sub mt-2">{o.next}</p>
                </div>
                <Button
                  variant="ghost"
                  className="mt-3 -ml-3"
                  onClick={() => {
                    setSelected(o);
                    setNext(o.next);
                    setStage(o.status);
                    setModal('edit');
                  }}
                >
                  Update next step <ArrowUpRight />
                </Button>
              </div>
            ))}
          </div>
          <p className="small mt-5">
            This is your contact notebook. Nothing is sent on your behalf.
          </p>
        </Panel>
      </div>
      <div className="grid-2 mt-6">
        <Panel title="A realistic route to £500">
          <p className="sub">
            An illustration to test, not a forecast: a £50 track + a £250 scoped
            prototype + £200 in product receipts. Adjust the mix to what people
            actually want.
          </p>
          <div className="path-strip mt-5 mb-0 !grid-cols-3">
            {[
              ['Show', 'A short, relevant demo'],
              ['Offer', 'One result with a clear scope'],
              ['Deliver', 'Get paid, then ask for an introduction'],
            ].map(([a, b]) => (
              <div key={a}>
                <strong>{a}</strong>
                <p>{b}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Your baseline, made visible">
          <div className="row between py-2">
            <span className="sub">Rent after property costs</span>
            <strong>
              {money(state.settings.rent - state.settings.propertyCosts)}/mo
            </strong>
          </div>
          <div className="row between py-2">
            <span className="sub">Living-cost assumption</span>
            <strong>{money(state.settings.living)}/mo</strong>
          </div>
          <div className="row between py-2 border-t border-border mt-2">
            <span className="sub">Monthly gap before creative work</span>
            <strong className="amber">
              {money(
                Math.max(
                  0,
                  state.settings.living -
                    state.settings.rent +
                    state.settings.propertyCosts,
                ),
              )}
            </strong>
          </div>
          <p className="small mt-4">
            Editable planning figures, not a live bank balance. Gifts and
            borrowing are not creative income. See Settings for the assumptions.
          </p>
        </Panel>
      </div>
      <Dialog open={modal !== null} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          {error && (
            <div className="alert-box" role="alert">
              {error}
            </div>
          )}
          <DialogTitle>
            {modal === 'payment'
              ? 'Record a creative payment'
              : modal === 'remove'
                ? 'Remove this entry?'
                : modal === 'edit'
                  ? 'Keep the next move clear'
                  : 'A person, a useful offer.'}
          </DialogTitle>
          <DialogDescription>
            {modal === 'payment'
              ? 'Use the amount paid and the actual platform fees. Expected income stays separate.'
              : modal === 'remove'
                ? 'This removes the payment from your records and recalculates the goal.'
                : 'A small conversation can lead to a real collaboration.'}
          </DialogDescription>
          {modal === 'remove' ? (
            <div className="row">
              <Button variant="outline" onClick={() => setModal(null)}>
                Keep entry
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (await send({ type: 'income.remove', incomeId: remove }))
                    setModal(null);
                }}
              >
                Remove entry
              </Button>
            </div>
          ) : (
            <form className="form-stack" onSubmit={submit}>
              {modal === 'payment' ? (
                <>
                  <Field label="What was the work?">
                    <Input
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="Gross amount (£)">
                      <Input
                        type="number"
                        required
                        min="0"
                        step=".01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </Field>
                    <Field label="Fees (£)">
                      <Input
                        type="number"
                        required
                        min="0"
                        step=".01"
                        value={fees}
                        onChange={(e) => setFees(e.target.value)}
                      />
                    </Field>
                    <Field label="Payment / expected date">
                      <Input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </Field>
                    <Field label="Payment status">
                      <Pick
                        value={status}
                        options={['Received', 'Expected']}
                        onChange={setStatus}
                        label="Payment status"
                      />
                    </Field>
                  </div>
                  <Field label="Notes (optional)">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <>
                  {modal === 'contact' && (
                    <>
                      <Field label="Name / organisation">
                        <Input
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </Field>
                      <Field label="What could you help them make?">
                        <Input
                          required
                          value={offer}
                          onChange={(e) => setOffer(e.target.value)}
                        />
                      </Field>
                    </>
                  )}
                  <Field label="The next concrete step">
                    <Textarea
                      required
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                    />
                  </Field>
                  {modal === 'edit' && (
                    <Field label="Where is it up to?">
                      <Pick
                        value={stage}
                        options={[
                          'To contact',
                          'Conversation',
                          'Proposal',
                          'Booked',
                          'Closed',
                        ]}
                        onChange={setStage}
                        label="Lead status"
                      />
                    </Field>
                  )}
                </>
              )}
              <Button disabled={busy} type="submit">
                Save {modal === 'payment' ? 'payment' : 'next step'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function Review({ state, send }: { state: State; send: Send }) {
  const now = new Date(),
    week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - 6 + i);
      return dateKey(d);
    });
  const sessions = state.sessions.filter((s) => week.includes(s.day)),
    minutes = sessions.reduce((n, s) => n + s.ms, 0) / 60000;
  const values = week.map((day) =>
    sessions.filter((s) => s.day === day).reduce((n, s) => n + s.ms / 60000, 0),
  );
  const tasks = state.tasks.filter(
    (t) =>
      t.done &&
      t.completedAt &&
      week.includes(dateKey(new Date(t.completedAt))),
  );
  const points = xp(state),
    d = state.days[dateKey()] ?? emptyDay();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow mb-3">Last seven days</div>
          <h1>Weekly review.</h1>
          <p>Fifteen minutes on Sunday. Keep what helps. Change one thing.</p>
        </div>
      </div>
      <div className="grid-3 mb-6">
        <div className="metric">
          <span className="eyebrow">Actions completed · 7 days</span>
          <strong>{tasks.length}</strong>
          <p>Finished outputs matter more than heroic workdays.</p>
        </div>
        <div className="metric">
          <span className="eyebrow">Recorded sessions · 7 days</span>
          <strong>
            {Math.round(minutes)} <span className="sub">minutes</span>
          </strong>
          <p>Useful context, never a target to maximise.</p>
        </div>
        <div className="metric">
          <span className="eyebrow">Creative payments · season</span>
          <strong>{money(collected(state))}</strong>
          <p>
            Target: {money(state.settings.target)} by {state.settings.end}.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <Panel title="The shape of your week">
          <div className="day-bars">
            {values.map((n, i) => (
              <div key={week[i]} className="bar-col">
                <span>{Math.round(n)}m</span>
                <i
                  style={{
                    height: Math.max(3, (n / Math.max(1, ...values)) * 80),
                  }}
                />
                <span>
                  {new Date(week[i] + 'T12:00:00').toLocaleDateString('en-GB', {
                    weekday: 'short',
                  })}
                </span>
              </div>
            ))}
          </div>
          <p className="small mt-5">
            Time is a record of sessions you chose to track. Untimed life still
            counts.
          </p>
        </Panel>
        <Panel title="Make space for the next week">
          <Notes
            value={d.reflection}
            label="Weekly reflection"
            placeholder="What did I finish or share? Who did I work with? What helped me feel alive? What is one adjustment for next week?"
            onSave={(note) => send({ type: 'day.reflection', note })}
          />
        </Panel>
      </div>
      <div className="grid-2 mt-6">
        <Panel title="Your momentum">
          <div className="goal-number accent">
            {points}{' '}
            <span>XP · {Math.floor(points / 100)} markers reached</span>
          </div>
          <p className="sub mt-3">
            20 XP per completed action. 5 XP for a personal anchor, capped at 15
            per day. 10 XP for leaving a reflection. No points for time spent,
            money, likes, dates or opening the dashboard.
          </p>
          <div className="mt-5 p-4 rounded-xl border border-border">
            <span className="eyebrow">A reward to remember</span>
            <p className="mt-2">{state.settings.reward}</p>
          </div>
          <p className="small mt-3">
            Enjoyment is allowed before you earn anything. Markers are reminders
            to celebrate.
          </p>
        </Panel>
        <Panel title="Useful decision points">
          <div className="feed-item">
            <h3>After two weeks</h3>
            <p>
              Does the dashboard help you begin? Remove any tracking you avoid.
              Don’t build another system yet.
            </p>
          </div>
          <div className="feed-item">
            <h3>After six weeks</h3>
            <p>
              If conversations are happening but work is not selling, change the
              offer or the people you approach. If there are no conversations,
              prioritise reaching out.
            </p>
          </div>
          <div className="feed-item">
            <h3>At the end of your season</h3>
            <p>
              Review money received, things released, friendships and daily
              life. Set the next three-month target from evidence. £500 total is
              a useful beginning.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
export function FieldGuide({
  state,
  guide,
  setGuide,
  send,
}: {
  state: State;
  guide: Guide | null;
  setGuide: (g: Guide | null) => void;
  send: Send;
}) {
  const [search, setSearch] = useState(''),
    [added, setAdded] = useState('');
  if (guide)
    return (
      <div className="guide-body">
        <Button
          variant="ghost"
          className="-ml-3 mb-5"
          onClick={() => {
            setGuide(null);
            setAdded('');
          }}
        >
          <ArrowLeft /> Field guide
        </Button>
        <div className="eyebrow accent mb-3">{guide.category}</div>
        <h1>{guide.title}</h1>
        <p className="intro">{guide.intro}</p>
        {guide.sections.map((section, i) => (
          <section key={i}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
            {section.steps && (
              <ul>
                {section.steps.map((step, j) => (
                  <li key={j}>
                    {step}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2"
                      aria-label={'Add action: ' + step}
                      disabled={added === i + '-' + j}
                      onClick={async () => {
                        if (
                          await send({
                            type: 'task.add',
                            title: step.slice(0, 200),
                            notes: section.title + ' · ' + guide.title,
                            area:
                              guide.category === 'Languages'
                                ? 'Languages'
                                : guide.category === 'People'
                                  ? 'People'
                                  : guide.category === 'Wonder'
                                    ? 'Wonder'
                                    : guide.category === 'Body & habits'
                                      ? 'Body & habits'
                                      : guide.category === 'Music'
                                        ? 'Music'
                                        : guide.category === 'Life admin'
                                          ? 'Life admin'
                                          : 'Audio & work',
                            project: '',
                          })
                        )
                          setAdded(i + '-' + j);
                      }}
                    >
                      {added === i + '-' + j ? (
                        <Check size={12} />
                      ) : (
                        <Plus size={12} />
                      )}{' '}
                      {added === i + '-' + j ? 'Added' : 'Make an action'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {guide.sources?.length && (
          <section>
            <h2>Sources & further reading</h2>
            <p className="small">
              Check source dates when using this guidance. Personal experiments
              and suggested prices are planning choices, not promises.
            </p>
            <ul>
              {guide.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow mb-3">Reference / life plan</div>
          <h1>Field guide.</h1>
          <p>
            Your reference shelf. Read one useful part, then go and do
            something.
          </p>
        </div>
      </div>
      <div className="row mb-6 max-w-xl">
        <Search className="muted" size={18} />
        <Input
          aria-label="Search the field guide"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Money, music, relationships, Chinese…"
        />
      </div>
      <div className="grid-3">
        {state.guides
          .filter((g) =>
            (
              g.title +
              ' ' +
              g.category +
              ' ' +
              g.intro +
              ' ' +
              g.sections.map((s) => s.body).join(' ')
            )
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((g) => (
            <button
              className="guide-button"
              key={g.id}
              onClick={() => setGuide(g)}
            >
              <div className="row between">
                <span className="eyebrow accent">{g.category}</span>
                <ArrowUpRight size={17} className="muted" />
              </div>
              <h3>{g.title}</h3>
              <p>{g.intro}</p>
              <span className="small inline-block mt-4">
                {g.sections.length} practical sections
              </span>
            </button>
          ))}
      </div>
      {!state.guides.some((g) =>
        (
          g.title +
          ' ' +
          g.category +
          ' ' +
          g.intro +
          ' ' +
          g.sections.map((s) => s.body).join(' ')
        )
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) && <Empty>No guide matches that search. Try a broader word.</Empty>}
    </>
  );
}
export function SettingsPage({ state, send }: { state: State; send: Send }) {
  const [s, setS] = useState({ ...state.settings }),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const set = (k: keyof typeof s, v: string | number) => {
    setS({ ...s, [k]: v });
    setSaved(false);
  };
  const download = () => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { exportedAt: new Date().toISOString(), ...state },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    a.href = url;
    a.download = 'calcium-studio-' + dateKey() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings.</h1>
          <p>Adjust the assumptions. Keep a copy of your records.</p>
        </div>
        <Button variant="outline" onClick={download}>
          <Download /> Export my data
        </Button>
      </div>
      <div className="grid-2">
        <Panel title="This season">
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setSaved(await send({ type: 'settings', ...s }));
              setBusy(false);
            }}
          >
            <Field label="Season name">
              <Input
                required
                value={s.season}
                onChange={(e) => set('season', e.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="Income tracking starts">
                <Input
                  type="date"
                  required
                  value={s.start}
                  onChange={(e) => set('start', e.target.value)}
                />
              </Field>
              <Field label="Season target date">
                <Input
                  type="date"
                  required
                  value={s.end}
                  onChange={(e) => set('end', e.target.value)}
                />
              </Field>
              <Field label="Season creative income target (£)">
                <Input
                  type="number"
                  min=".01"
                  step=".01"
                  required
                  value={s.target / 100}
                  onChange={(e) =>
                    set('target', Math.round(Number(e.target.value) * 100))
                  }
                />
              </Field>
              <Field label="Longer-term annual ambition (£)">
                <Input
                  type="number"
                  min=".01"
                  step=".01"
                  required
                  value={s.annual / 100}
                  onChange={(e) =>
                    set('annual', Math.round(Number(e.target.value) * 100))
                  }
                />
              </Field>
            </div>
            <Field label="A simple reward">
              <Textarea
                value={s.reward}
                required
                onChange={(e) => set('reward', e.target.value)}
              />
            </Field>
            <h3 className="mt-2">Money assumptions</h3>
            <p className="small">
              Planning figures from your imported plan. Update them when you
              check your accounts. These do not calculate tax or track your bank
              automatically.
            </p>
            <div className="form-grid">
              {(
                [
                  ['cash', 'Cash snapshot (£)'],
                  ['rent', 'Monthly rent received (£)'],
                  ['propertyCosts', 'Property / other fixed costs (£/mo)'],
                  ['living', 'Living costs incl. accommodation (£/mo)'],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <Input
                    type="number"
                    required
                    min="0"
                    step=".01"
                    value={s[k] / 100}
                    onChange={(e) =>
                      set(k, Math.round(Number(e.target.value) * 100))
                    }
                  />
                </Field>
              ))}
            </div>
            <Button type="submit" disabled={busy}>
              {saved ? (
                <>
                  <Check /> Settings saved
                </>
              ) : (
                'Save settings'
              )}
            </Button>
          </form>
        </Panel>
        <div className="stack">
          <Panel title="Storage & backup">
            <p className="sub">
              Your plan, diary and activity records are saved in this browser on
              this device. Other visitors to the website get their own empty
              workspace.
            </p>
            <p className="sub mt-4">
              This version has no account sign-in or cloud sync. Anyone using
              this browser profile can open its records. Clearing this site's
              browser data removes them, so keep an exported backup.
            </p>
            <p className="sub mt-4">
              Import your private plan once on each browser where you want to
              use it. Changes do not automatically sync between devices.
              Supabase can be connected later.
            </p>
            <div className="row wrap mt-5">
              <ImportPlan />
              <Button variant="outline" onClick={download}>
                <Download /> Export backup
              </Button>
            </div>
          </Panel>
          <Panel title="How to use it without living in it">
            <div className="feed-item">
              <h3>Morning · two minutes</h3>
              <p>
                Pick up to three actions. One useful result is enough on a
                travel day.
              </p>
            </div>
            <div className="feed-item">
              <h3>During the day · as needed</h3>
              <p>
                Start a session, capture a thought, move on. You do not need to
                time leisure or conversations.
              </p>
            </div>
            <div className="feed-item">
              <h3>Evening · one minute</h3>
              <p>
                Record what happened. Leave a next step if it helps. Close the
                laptop.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

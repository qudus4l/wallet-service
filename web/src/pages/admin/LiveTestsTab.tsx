import { useState } from 'react';
import { Money } from '../../components/Money';
import { Button, ErrorNote } from '../../components/ui';
import { api, ApiError, newIdempotencyKey } from '../../lib/api';
import { formatNaira } from '../../lib/money';

type CellState = 'waiting' | 'sent' | 'declined' | 'replayed' | 'failed';
interface Cell {
  state: CellState;
  ms?: number;
  code?: string;
  transactionId?: string;
}
interface Outcome {
  senderBalance: number;
  recipientBalance: number;
  distinctTransactions: number;
  passed: boolean;
  summary: string;
}

interface TestSpec {
  id: 'double-spend' | 'duplicate';
  title: string;
  description: string;
  fund: number;
  payment: number;
  requests: number;
  sameKey: boolean;
}

const TESTS: TestSpec[] = [
  {
    id: 'double-spend',
    title: 'Double-spend test',
    description:
      'Funds a new wallet with ₦10.00, then fires 25 payments of ₦1.00 at the same instant. Exactly 10 should go through and 15 should be declined, leaving ₦0.00. Never less.',
    fund: 1_000,
    payment: 100,
    requests: 25,
    sameKey: false,
  },
  {
    id: 'duplicate',
    title: 'Duplicate request test',
    description:
      'Funds a new wallet with ₦5.00, then sends the same ₦1.00 payment 10 times at once, as a flaky network or an impatient double-click would. It should be paid once; the other 9 get the original receipt back.',
    fund: 500,
    payment: 100,
    requests: 10,
    sameKey: true,
  },
];

export function LiveTestsTab() {
  return (
    <section className="live-tests">
      <p className="muted live-tests__intro">
        These run against this live server and its real database, from your browser. Each run
        creates two fresh accounts, so they never touch real users.
      </p>
      {TESTS.map((spec) => (
        <LiveTest key={spec.id} spec={spec} />
      ))}
    </section>
  );
}

function LiveTest({ spec }: { spec: TestSpec }) {
  const [phase, setPhase] = useState<'idle' | 'setup' | 'firing' | 'checking' | 'done'>('idle');
  const [cells, setCells] = useState<Cell[]>(() => blank(spec.requests));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function run() {
    setError(null);
    setOutcome(null);
    setCells(blank(spec.requests));
    try {
      setPhase('setup');
      const ctx = await createAccounts(spec.fund);

      setPhase('firing');
      const sharedKey = newIdempotencyKey();
      const started = performance.now();
      const results = await Promise.all(
        Array.from({ length: spec.requests }, async (_, i) => {
          const cell = await sendOne(
            ctx,
            spec.payment,
            spec.sameKey ? sharedKey : newIdempotencyKey(),
            started,
          );
          setCells((prev) => prev.map((c, j) => (j === i ? cell : c)));
          return cell;
        }),
      );

      setPhase('checking');
      const [sender, recipient] = await Promise.all([
        api.wallets(ctx.token),
        api.admin.user(ctx.recipientId),
      ]);
      const senderBalance = sender.data[0]?.balance ?? NaN;
      const recipientBalance = recipient.data.wallets[0]?.balance ?? NaN;
      setOutcome(judge(spec, results, senderBalance, recipientBalance));
      setPhase('done');
    } catch (err) {
      setError(err);
      setPhase('idle');
    }
  }

  const counts = tally(cells);
  const running = phase === 'setup' || phase === 'firing' || phase === 'checking';
  return (
    <article className="live-test" aria-labelledby={`${spec.id}-title`}>
      <header className="live-test__head">
        <div>
          <h2 id={`${spec.id}-title`}>{spec.title}</h2>
          <p className="live-test__description">{spec.description}</p>
        </div>
        <Button onClick={() => void run()} busy={running}>
          {running ? PHASE_LABEL[phase] : phase === 'done' ? 'Run again' : 'Run test'}
        </Button>
      </header>

      <div className="live-test__body">
        <ol
          className={`cells cells--${spec.requests}`}
          aria-label={`${spec.requests} simultaneous requests`}
        >
          {cells.map((cell, i) => (
            <li key={i} className={`cell cell--${cell.state}`} title={cellTitle(cell)}>
              <span className="cell__n">{i + 1}</span>
              {cell.ms !== undefined && <span className="cell__ms">{cell.ms} ms</span>}
            </li>
          ))}
        </ol>

        <dl className="tally" aria-live="polite">
          <div>
            <dt>
              <i className="swatch swatch--sent" aria-hidden />
              Paid
            </dt>
            <dd>{counts.sent}</dd>
          </div>
          {spec.sameKey ? (
            <div>
              <dt>
                <i className="swatch swatch--replayed" aria-hidden />
                Returned original receipt
              </dt>
              <dd>{counts.replayed}</dd>
            </div>
          ) : (
            <div>
              <dt>
                <i className="swatch swatch--declined" aria-hidden />
                Declined, insufficient funds
              </dt>
              <dd>{counts.declined}</dd>
            </div>
          )}
          {counts.failed > 0 && (
            <div>
              <dt>
                <i className="swatch swatch--failed" aria-hidden />
                Other errors
              </dt>
              <dd>{counts.failed}</dd>
            </div>
          )}
          <div className="tally__balance">
            <dt>Sender’s balance after</dt>
            <dd>
              {outcome ? (
                <Money kobo={outcome.senderBalance} size="lg" />
              ) : (
                <span className="muted">Not run yet</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {outcome && (
        <p className={`verdict verdict--${outcome.passed ? 'pass' : 'fail'}`} role="status">
          {outcome.summary}
        </p>
      )}
      <ErrorNote error={error} />
    </article>
  );
}

const PHASE_LABEL = {
  idle: 'Run test',
  setup: 'Creating accounts…',
  firing: 'Sending…',
  checking: 'Checking balances…',
  done: 'Run again',
} as const;

const blank = (n: number): Cell[] => Array.from({ length: n }, () => ({ state: 'waiting' }));

interface TestAccounts {
  token: string;
  senderWallet: string;
  recipientWallet: string;
  recipientId: string;
}

async function createAccounts(fund: number): Promise<TestAccounts> {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const password = `live-test-${crypto.randomUUID()}`;
  const senderEmail = `live-test-${stamp}-sender@example.com`;
  const [sender, recipient] = await Promise.all([
    api.register({ email: senderEmail, password, fullName: 'Live Test Sender' }),
    api.register({
      email: `live-test-${stamp}-recipient@example.com`,
      password,
      fullName: 'Live Test Recipient',
    }),
  ]);
  const { data: login } = await api.login(senderEmail, password);
  const senderWallet = sender.data.wallets[0]!.id;
  await api.admin.deposit(senderWallet, fund, newIdempotencyKey(), 'Live test funding');
  return {
    token: login.accessToken,
    senderWallet,
    recipientWallet: recipient.data.wallets[0]!.id,
    recipientId: recipient.data.user.id,
  };
}

async function sendOne(
  ctx: TestAccounts,
  amount: number,
  key: string,
  started: number,
): Promise<Cell> {
  try {
    const res = await api.transfer(
      {
        sourceWalletId: ctx.senderWallet,
        destinationWalletId: ctx.recipientWallet,
        amount,
        narration: 'Live test',
      },
      key,
      ctx.token,
    );
    return {
      state: res.replayed ? 'replayed' : 'sent',
      ms: elapsed(started),
      transactionId: res.data.id,
    };
  } catch (err) {
    const code = err instanceof ApiError ? err.code : 'UNKNOWN';
    return {
      state: code === 'INSUFFICIENT_FUNDS' ? 'declined' : 'failed',
      ms: elapsed(started),
      code,
    };
  }
}

const elapsed = (started: number) => Math.round(performance.now() - started);

function tally(cells: Cell[]) {
  const count = (s: CellState) => cells.filter((c) => c.state === s).length;
  return {
    sent: count('sent'),
    declined: count('declined'),
    replayed: count('replayed'),
    failed: count('failed'),
  };
}

function judge(
  spec: TestSpec,
  cells: Cell[],
  senderBalance: number,
  recipientBalance: number,
): Outcome {
  const { sent, declined, replayed, failed } = tally(cells);
  const distinctTransactions = new Set(cells.map((c) => c.transactionId).filter(Boolean)).size;
  const expectedPaid = spec.sameKey
    ? 1
    : Math.min(spec.requests, Math.floor(spec.fund / spec.payment));
  const paidOut = recipientBalance;
  const passed =
    failed === 0 &&
    distinctTransactions === expectedPaid &&
    paidOut === expectedPaid * spec.payment &&
    senderBalance === spec.fund - paidOut &&
    (spec.sameKey ? sent + replayed === spec.requests : sent + declined === spec.requests);

  const summary = passed
    ? spec.sameKey
      ? `Passed. ${spec.requests} identical requests produced one payment of ${formatNaira(spec.payment)}; ${replayed} got the original receipt back. The sender has ${formatNaira(senderBalance)} left.`
      : `Passed. Exactly ${sent} of ${spec.requests} simultaneous payments went through and ${declined} were declined. ${formatNaira(paidOut)} moved, ${formatNaira(senderBalance)} left. Nothing overspent.`
    : `Unexpected result: ${sent} paid, ${declined} declined, ${replayed} replayed, ${failed} other errors; ${distinctTransactions} distinct transactions; sender ${formatNaira(senderBalance)}, recipient ${formatNaira(recipientBalance)}.`;
  return { senderBalance, recipientBalance, distinctTransactions, passed, summary };
}

function cellTitle(cell: Cell): string {
  switch (cell.state) {
    case 'waiting':
      return 'Waiting';
    case 'sent':
      return `Paid in ${cell.ms} ms`;
    case 'declined':
      return `Declined (insufficient funds) in ${cell.ms} ms`;
    case 'replayed':
      return `Original receipt returned in ${cell.ms} ms`;
    case 'failed':
      return `Failed: ${cell.code}`;
  }
}

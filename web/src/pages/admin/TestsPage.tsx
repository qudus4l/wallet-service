import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Detail, Note, PageHead } from '../../components/ui';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../../lib/api';
import { useApp } from '../../lib/app';
import { money } from '../../lib/format';

type TestKey = 'a' | 'b';
type CellState = 'waiting' | 'paid' | 'declined' | 'replayed';
interface Cell {
  state: CellState;
  title: string;
}
interface Outcome {
  pass: boolean;
  line: string;
  sender: number;
  recipient: number;
  times: string;
}
interface Run {
  cells: Cell[];
  phase: string | null;
  outcome: Outcome | null;
  error: string | null;
}

const SPEC = {
  a: { n: 25, fund: 1000 },
  b: { n: 10, fund: 500 },
} as const;
const PAYMENT = 100; // ₦1.00

/** Results survive leaving and returning to the page, like the design's testState. */
const saved: Partial<Record<TestKey, Run>> = {};

const randomSecret = () => crypto.randomUUID() + crypto.randomUUID();

/** Two throwaway users and a funded sender (3 auth calls: register ×2, login ×1). */
async function setUp(fund: number) {
  const tag = `live-test-${crypto.randomUUID().slice(0, 8)}`;
  const password = randomSecret();
  const sender = await api.register({
    email: `${tag}-sender@example.com`,
    password,
    fullName: 'Live Test Sender',
  });
  const recipient = await api.register({
    email: `${tag}-recipient@example.com`,
    password: randomSecret(),
    fullName: 'Live Test Recipient',
  });
  const token = (await api.login(sender.data.user.email, password)).data.accessToken;
  await api.admin.deposit(sender.data.wallets[0]!.id, fund, newIdempotencyKey(), 'Live test');
  return {
    token,
    senderWalletId: sender.data.wallets[0]!.id,
    recipientId: recipient.data.user.id,
    recipientWalletId: recipient.data.wallets[0]!.id,
  };
}

export function TestsPage() {
  const { testRunning } = useApp();
  const [runs, setRuns] = useState<Partial<Record<TestKey, Run>>>({ ...saved });
  const [running, setRunning] = useState(false);

  const update = (k: TestKey, next: (run: Run) => Run) =>
    setRuns((all) => {
      const run = next(all[k]!);
      saved[k] = run;
      return { ...all, [k]: run };
    });

  async function runTest(k: TestKey) {
    if (testRunning.current) return;
    testRunning.current = true;
    setRunning(true);
    const { n, fund } = SPEC[k];
    const initial: Run = {
      cells: Array.from({ length: n }, () => ({ state: 'waiting', title: 'Waiting' })),
      phase: 'Creating throwaway accounts…',
      outcome: null,
      error: null,
    };
    saved[k] = initial;
    setRuns((all) => ({ ...all, [k]: initial }));

    try {
      const ctx = await setUp(fund);
      update(k, (r) => ({ ...r, phase: 'Sending requests…' }));
      const sharedKey = newIdempotencyKey();
      const body = {
        sourceWalletId: ctx.senderWalletId,
        destinationWalletId: ctx.recipientWalletId,
        amount: PAYMENT,
      };
      const start = performance.now();
      const responses = await Promise.all(
        Array.from({ length: n }, async (_, i) => {
          let state: CellState;
          let code: number | string;
          let id: string | undefined;
          try {
            const res = await api.transfer(
              body,
              k === 'b' ? sharedKey : newIdempotencyKey(),
              ctx.token,
            );
            state = res.replayed ? 'replayed' : 'paid';
            code = res.status;
            id = res.data.id;
          } catch (error) {
            state = 'declined';
            code = error instanceof ApiError ? `${error.status} ${error.code}` : 'error';
          }
          const ms = Math.round(performance.now() - start);
          const title = `Request ${i + 1}: ${state}, ${code}, ${ms} ms`;
          update(k, (r) => ({
            ...r,
            cells: r.cells.map((c, j) => (j === i ? { state, title } : c)),
          }));
          return { state, code, id, ms };
        }),
      );

      const [senderWallets, recipientUser] = await Promise.all([
        api.wallets(ctx.token),
        api.admin.user(ctx.recipientId),
      ]);
      const sender = senderWallets.data[0]?.balance ?? 0;
      const recipient = recipientUser.data.wallets[0]?.balance ?? 0;
      const count = (s: CellState) => responses.filter((r) => r.state === s).length;
      const paid = count('paid');
      const replayed = count('replayed');
      const insufficient = responses.filter((r) => r.code === '422 INSUFFICIENT_FUNDS').length;
      const otherErrors = count('declined') - insufficient;
      const firstId = responses.find((r) => r.id)?.id;
      const identical = responses.filter((r) => r.id && r.id === firstId).length;
      const pass =
        k === 'a'
          ? paid === 10 && insufficient === 15 && sender === 0 && recipient === 1000
          : paid === 1 &&
            replayed === 9 &&
            responses.every((r) => r.code === 201 && r.id === firstId) &&
            sender === 400 &&
            recipient === 100;
      const extra = otherErrors ? ` · ${otherErrors} other errors` : '';
      const times = responses.map((r) => r.ms);
      update(k, (r) => ({
        ...r,
        phase: null,
        outcome: {
          pass,
          line:
            k === 'a'
              ? `${paid} paid · ${insufficient} declined (insufficient funds)${extra}`
              : `${paid} payment · ${replayed} replays · ${identical} identical references${extra}`,
          sender,
          recipient,
          times: `${Math.min(...times)}–${Math.max(...times)} ms`,
        },
      }));
    } catch (error) {
      update(k, (r) => ({ ...r, phase: null, error: errorMessage(error) }));
    } finally {
      testRunning.current = false;
      setRunning(false);
    }
  }

  return (
    <>
      <PageHead
        title="Live tests"
        sub="See how the service should handle simultaneous payment requests."
      />
      <div className="notice warning" style={{ marginBottom: 24 }}>
        <Icon name="info" />
        <span>
          <strong>Live test.</strong> Each run creates two throwaway accounts and sends real
          requests to the API. Your users are never touched.
        </span>
      </div>
      <div className="test-grid">
        <TestCard
          k="a"
          label="01 / BALANCE SAFETY"
          title="Prevent double spending"
          sub="25 payments of ₦1.00 compete for a ₦10.00 balance. Only 10 should succeed; the other 15 should be declined."
          balance="₦10.00"
          run={runs.a}
          running={running}
          onRun={runTest}
        />
        <TestCard
          k="b"
          label="02 / DUPLICATE SAFETY"
          title="Send once, even on retry"
          sub="The same ₦1.00 payment is submitted 10 times. The wallet should be charged once, with the same receipt returned each time."
          balance="₦5.00"
          run={runs.b}
          running={running}
          onRun={runTest}
        />
      </div>
    </>
  );
}

function TestCard({
  k,
  label,
  title,
  sub,
  balance,
  run,
  running,
  onRun,
}: {
  k: TestKey;
  label: string;
  title: string;
  sub: string;
  balance: string;
  run: Run | undefined;
  running: boolean;
  onRun: (k: TestKey) => void;
}) {
  return (
    <section className="card test-card">
      <div className="test-label">{label}</div>
      <h2>{title}</h2>
      <p>{sub}</p>
      <div className="test-facts">
        <div>
          <strong>{balance}</strong>
          <span>Starting balance</span>
        </div>
        <div>
          <strong>{SPEC[k].n}</strong>
          <span>Requests at once</span>
        </div>
      </div>
      <button
        className="btn primary"
        id={`test-button-${k}`}
        onClick={() => onRun(k)}
        disabled={running}
      >
        <Icon name="test" /> Run test
      </button>
      <div id={`test-output-${k}`} aria-live="polite">
        {run && (
          <>
            <div className="cells">
              {run.cells.map((c, i) => (
                <div
                  key={i}
                  className={c.state === 'waiting' ? 'cell' : `cell ${c.state}`}
                  id={`cell-${k}-${i}`}
                  title={c.title}
                  aria-label={c.state === 'waiting' ? undefined : c.title}
                >
                  {c.state === 'waiting'
                    ? String(i + 1).padStart(2, '0')
                    : c.state === 'paid'
                      ? '✓'
                      : c.state === 'declined'
                        ? '×'
                        : '↻'}
                </div>
              ))}
            </div>
            <div className="legend">
              <span>
                <i className="dot" /> Paid
              </span>
              <span>
                <i className="dot red" /> Declined
              </span>
              <span>
                <i className="dot blue" /> Replayed
              </span>
            </div>
            <div id={`test-result-${k}`} className="test-result">
              {run.phase ? (
                <p className="muted small">{run.phase}</p>
              ) : run.error ? (
                <Note kind="error">{run.error}</Note>
              ) : run.outcome ? (
                <>
                  <Note kind={run.outcome.pass ? 'success' : 'error'}>
                    <strong>{run.outcome.pass ? 'Passed' : 'Failed'}</strong>
                    <br />
                    {run.outcome.line}
                  </Note>
                  <dl style={{ margin: '10px 0 0' }}>
                    <Detail label="Sender balance">{money(run.outcome.sender)}</Detail>
                    <Detail label="Recipient balance">{money(run.outcome.recipient)}</Detail>
                    <Detail label="Response times">{run.outcome.times}</Detail>
                  </dl>
                  <p className="help">Live API run. Balances read back from the server.</p>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

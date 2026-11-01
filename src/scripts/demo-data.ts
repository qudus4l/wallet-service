/**
 * Creates the two public demo customers used by the web app's sign-in page ("Use customer")
 * and send form ("Demo recipient: bob@example.com"), with a short payment history.
 *
 * Everything goes through the public API, so balances, ledger and audit log stay consistent.
 * Every step uses a fixed idempotency key, so re-running (or resuming after a failure)
 * replays completed steps instead of repeating them.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… node dist/scripts/demo-data.js https://your-api.example.com
 */

const DEMO_PASSWORD = 'wallet-demo'; // public on purpose: shown on the sign-in page
const ADA = { email: 'ada@example.com', fullName: 'Ada Okafor', phone: '+2348012345678' };
const BOB = { email: 'bob@example.com', fullName: 'Bob Musa' };

type Step =
  | { kind: 'deposit'; to: 'ada' | 'bob'; amount: number; narration: string }
  | { kind: 'transfer'; from: 'ada' | 'bob'; amount: number; narration: string };

/** Ends at Ada ₦248,500.00 and Bob ₦82,500.00, matching the design. Amounts in kobo. */
const HISTORY: Step[] = [
  { kind: 'deposit', to: 'bob', amount: 8_100_000, narration: 'Opening balance' },
  { kind: 'deposit', to: 'ada', amount: 20_000_000, narration: 'Opening balance' },
  { kind: 'transfer', from: 'ada', amount: 800_000, narration: 'Groceries' },
  { kind: 'transfer', from: 'bob', amount: 3_000_000, narration: 'Shared expenses' },
  { kind: 'transfer', from: 'ada', amount: 1_250_000, narration: 'Weekend plans' },
  { kind: 'deposit', to: 'ada', amount: 5_000_000, narration: 'Wallet top-up' },
  { kind: 'transfer', from: 'ada', amount: 2_500_000, narration: 'November rent' },
  { kind: 'transfer', from: 'bob', amount: 2_000_000, narration: 'Project contribution' },
  { kind: 'transfer', from: 'ada', amount: 600_000, narration: 'Lunch & groceries' },
];

async function main(): Promise<void> {
  const base = process.argv[2]?.replace(/\/$/, '');
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!base || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Usage: ADMIN_EMAIL=… ADMIN_PASSWORD=… node dist/scripts/demo-data.js <base-url>',
    );
  }

  async function call<T>(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; key?: string; allow?: number[] } = {},
  ): Promise<{ status: number; body: T }> {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.key ? { 'Idempotency-Key': opts.key } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const body = (await res.json().catch(() => undefined)) as T;
    if (!res.ok && !opts.allow?.includes(res.status)) {
      throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(body)}`);
    }
    return { status: res.status, body };
  }
  const login = async (email: string, password: string) =>
    (await call<{ accessToken: string }>('POST', '/v1/auth/login', { body: { email, password } }))
      .body.accessToken;

  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const people: Record<'ada' | 'bob', { token: string; walletId: string }> = {} as never;
  for (const [name, person] of [
    ['ada', ADA],
    ['bob', BOB],
  ] as const) {
    const created = await call('POST', '/v1/auth/register', {
      body: { ...person, password: DEMO_PASSWORD },
      allow: [409],
    });
    console.log(`${person.email}: ${created.status === 409 ? 'already exists' : 'created'}`);
    const token = await login(person.email, DEMO_PASSWORD);
    const wallets = await call<{ id: string }[]>('GET', '/v1/wallets', { token });
    people[name] = { token, walletId: wallets.body[0]!.id };
  }

  for (const [i, step] of HISTORY.entries()) {
    const key = `demo-seed-v1-step-${i}`;
    const res =
      step.kind === 'deposit'
        ? await call('POST', `/v1/admin/wallets/${people[step.to].walletId}/deposits`, {
            token: admin,
            key,
            body: { amount: step.amount, narration: step.narration },
          })
        : await call('POST', '/v1/transfers', {
            token: people[step.from].token,
            key,
            body: {
              sourceWalletId: people[step.from].walletId,
              destinationWalletId: people[step.from === 'ada' ? 'bob' : 'ada'].walletId,
              amount: step.amount,
              narration: step.narration,
            },
          });
    console.log(`step ${i} (${step.narration}): ${res.status}`);
  }

  for (const name of ['ada', 'bob'] as const) {
    const wallets = await call<{ balance: number }[]>('GET', '/v1/wallets', {
      token: people[name].token,
    });
    console.log(`${name} balance: ${wallets.body[0]!.balance} kobo`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

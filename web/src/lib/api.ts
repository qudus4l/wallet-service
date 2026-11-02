/** Thin client for the wallet API. Same origin in production; proxied by Vite in development. */

export type Role = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BLOCKED';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}
export interface Wallet {
  id: string;
  currency: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}
export interface AdminUser extends User {
  wallets: Wallet[];
}
export interface Transaction {
  id: string;
  type: 'TRANSFER' | 'DEPOSIT';
  status: 'COMPLETED';
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number;
  currency: string;
  narration: string | null;
  createdAt: string;
}
export interface LedgerEntry {
  id: string;
  transactionId: string;
  type: 'TRANSFER' | 'DEPOSIT';
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  balanceAfter: number;
  counterpartyWalletId: string | null;
  narration: string | null;
  createdAt: string;
}
export interface Recipient {
  walletId: string;
  currency: string;
  accountName: string;
}
export type IdentityType = 'EMAIL' | 'PHONE';
export interface BlacklistEntry {
  id: string;
  type: IdentityType;
  value: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}
export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

/** An error from the API's envelope: `{ error: { code, message, details }, requestId }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { fields?: { field: string; errors: string[] }[] },
    readonly requestId?: string,
  ) {
    super(message);
  }

  /** The first validation message for a field, if any. */
  fieldError(field: string): string | undefined {
    return this.details?.fields?.find((f) => f.field === field)?.errors[0];
  }
}

/** UI copy for API errors. Branches on the code, never the message. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'Email or password is incorrect.';
    case 'ACCOUNT_BLOCKED':
      return 'This account is blocked.';
    case 'ACCOUNT_RESTRICTED':
      return 'This account can’t be used for that. Contact support.';
    case 'ACCOUNT_ALREADY_EXISTS':
      return 'An account with these details already exists.';
    case 'BLACKLIST_ENTRY_EXISTS':
      return 'Already on the blacklist.';
    case 'INSUFFICIENT_FUNDS':
      return 'Your balance is too low for this payment.';
    case 'RECIPIENT_UNAVAILABLE':
      return 'That account can’t receive money right now.';
    case 'AMOUNT_LIMIT_EXCEEDED':
      return 'The limit is ₦10,000,000.00 per payment.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a minute and try again.';
    case 'TRY_AGAIN':
      return 'The service is busy. Try again.';
    case 'NETWORK_ERROR':
      return 'Couldn’t reach the server. Check your connection and try again.';
    case 'TIMEOUT':
      return 'The server took too long to respond. Try again.';
    case 'NOT_FOUND':
      return 'Not found.';
    default:
      return error.requestId
        ? `Something went wrong. Error reference: ${error.requestId}`
        : 'Something went wrong. Try again.';
  }
}

const TOKEN_KEY = 'wallet.token';
const TIMEOUT_MS = 75_000;
/** After this long the free-plan server is probably cold-starting. */
const SLOW_MS = 3_000;

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token: string | null = readStoredToken();
let handlers: {
  unauthorized?: () => void;
  blocked?: () => void;
  slow?: (slow: boolean) => void;
} = {};
let slowCount = 0;

export const session = {
  get token() {
    return token;
  },
  set(value: string | null) {
    token = value;
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage unavailable (private mode): the token still lives in memory.
    }
  },
  /** Session-wide reactions: expired token, blocked account, server waking up. */
  on(next: typeof handlers) {
    handlers = next;
  },
};

export interface ApiResponse<T> {
  data: T;
  status: number;
  replayed: boolean;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  /** Use a specific token instead of the signed-in session (the live tests' throwaway users). */
  asToken?: string;
  query?: Record<string, string | number | undefined>;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  const bearer = options.asToken ?? token;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let markedSlow = false;
  const slowTimer = setTimeout(() => {
    markedSlow = true;
    if (slowCount++ === 0) handlers.slow?.(true);
  }, SLOW_MS);

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch {
    throw controller.signal.aborted
      ? new ApiError(0, 'TIMEOUT', 'The server took too long to respond.')
      : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.');
  } finally {
    clearTimeout(timeout);
    clearTimeout(slowTimer);
    if (markedSlow && --slowCount === 0) handlers.slow?.(false);
  }

  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!response.ok) {
    const envelope = json as
      | {
          error?: { code?: string; message?: string; details?: ApiError['details'] };
          requestId?: string;
        }
      | undefined;
    const error = new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN_ERROR',
      envelope?.error?.message ?? `Request failed with status ${response.status}`,
      envelope?.error?.details,
      envelope?.requestId,
    );
    const ownSession = !options.asToken && Boolean(token);
    if (ownSession && response.status === 401) handlers.unauthorized?.();
    if (ownSession && error.code === 'ACCOUNT_BLOCKED') handlers.blocked?.();
    throw error;
  }
  return {
    data: json as T,
    status: response.status,
    replayed: response.headers.get('Idempotent-Replayed') === 'true',
  };
}

/** Page sizes match the design: 6 activity rows, 5 admin rows, then "Load more". */
const ACTIVITY_PAGE = 6;
const ADMIN_PAGE = 5;

export const api = {
  register: (body: { email: string; password: string; fullName: string; phone?: string }) =>
    request<{ user: User; wallets: Wallet[] }>('/v1/auth/register', { method: 'POST', body }),
  login: (email: string, password: string) =>
    request<{ accessToken: string; expiresIn: number }>('/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => request<User>('/v1/users/me'),
  wallets: (asToken?: string) => request<Wallet[]>('/v1/wallets', { asToken }),
  history: (walletId: string, cursor?: string) =>
    request<Page<LedgerEntry>>(`/v1/wallets/${walletId}/transactions`, {
      query: { cursor, limit: ACTIVITY_PAGE },
    }),
  resolveRecipient: (email: string) =>
    request<Recipient>('/v1/wallets/resolve', { query: { email } }),
  transfer: (
    body: {
      sourceWalletId: string;
      destinationWalletId: string;
      amount: number;
      narration?: string;
    },
    idempotencyKey: string,
    asToken?: string,
  ) => request<Transaction>('/v1/transfers', { method: 'POST', body, idempotencyKey, asToken }),

  admin: {
    users: (email?: string, cursor?: string) =>
      request<Page<AdminUser>>('/v1/admin/users', { query: { email, cursor, limit: ADMIN_PAGE } }),
    user: (id: string) => request<AdminUser>(`/v1/admin/users/${id}`),
    block: (id: string, reason: string) =>
      request<AdminUser>(`/v1/admin/users/${id}/block`, { method: 'POST', body: { reason } }),
    unblock: (id: string, reason?: string) =>
      request<AdminUser>(`/v1/admin/users/${id}/unblock`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    deposit: (walletId: string, amount: number, idempotencyKey: string, narration?: string) =>
      request<Transaction>(`/v1/admin/wallets/${walletId}/deposits`, {
        method: 'POST',
        body: narration ? { amount, narration } : { amount },
        idempotencyKey,
      }),
    blacklist: (cursor?: string) =>
      request<Page<BlacklistEntry>>('/v1/admin/blacklist', {
        query: { cursor, limit: ADMIN_PAGE },
      }),
    addToBlacklist: (body: { type: IdentityType; value: string; reason: string }) =>
      request<BlacklistEntry>('/v1/admin/blacklist', { method: 'POST', body }),
    removeFromBlacklist: (id: string) =>
      request<void>(`/v1/admin/blacklist/${id}`, { method: 'DELETE' }),
    checkBlacklist: (type: IdentityType, value: string) =>
      request<{ listed: boolean; entry: BlacklistEntry | null }>('/v1/admin/blacklist/check', {
        query: { type, value },
      }),
    auditLogs: (cursor?: string) =>
      request<Page<AuditLog>>('/v1/admin/audit-logs', { query: { cursor, limit: ADMIN_PAGE } }),
  },
};

/** A fresh key per logical operation; reused verbatim when that operation is retried. */
export const newIdempotencyKey = (): string => crypto.randomUUID();

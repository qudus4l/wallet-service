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
  counterpartyWalletId: string;
  narration: string | null;
  createdAt: string;
}
export interface Recipient {
  walletId: string;
  currency: string;
  accountName: string;
}
export interface BlacklistEntry {
  id: string;
  type: 'EMAIL' | 'PHONE';
  value: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}
export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
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

const TOKEN_KEY = 'wallet.token';
let token: string | null = sessionStorage.getItem(TOKEN_KEY);
let onUnauthorized: (() => void) | null = null;

export const session = {
  get token() {
    return token;
  },
  set(value: string | null) {
    token = value;
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  },
  onUnauthorized(handler: () => void) {
    onUnauthorized = handler;
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
  /** Use a specific token instead of the signed-in session (e.g. the live demo's throwaway users). */
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

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : undefined;
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
    if (response.status === 401 && !options.asToken && token) onUnauthorized?.();
    throw error;
  }
  return {
    data: json as T,
    status: response.status,
    replayed: response.headers.get('Idempotent-Replayed') === 'true',
  };
}

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
      query: { cursor, limit: 20 },
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
      request<Page<AdminUser>>('/v1/admin/users', { query: { email, cursor, limit: 20 } }),
    user: (id: string) => request<AdminUser>(`/v1/admin/users/${id}`),
    block: (id: string, reason: string) =>
      request<AdminUser>(`/v1/admin/users/${id}/block`, { method: 'POST', body: { reason } }),
    unblock: (id: string) =>
      request<AdminUser>(`/v1/admin/users/${id}/unblock`, { method: 'POST', body: {} }),
    deposit: (walletId: string, amount: number, idempotencyKey: string, narration?: string) =>
      request<Transaction>(`/v1/admin/wallets/${walletId}/deposits`, {
        method: 'POST',
        body: narration ? { amount, narration } : { amount },
        idempotencyKey,
      }),
    blacklist: (cursor?: string) =>
      request<Page<BlacklistEntry>>('/v1/admin/blacklist', { query: { cursor, limit: 50 } }),
    addToBlacklist: (body: { type: 'EMAIL' | 'PHONE'; value: string; reason: string }) =>
      request<BlacklistEntry>('/v1/admin/blacklist', { method: 'POST', body }),
    removeFromBlacklist: (id: string) =>
      request<void>(`/v1/admin/blacklist/${id}`, { method: 'DELETE' }),
    checkBlacklist: (type: 'EMAIL' | 'PHONE', value: string) =>
      request<{ listed: boolean; entry: BlacklistEntry | null }>('/v1/admin/blacklist/check', {
        query: { type, value },
      }),
    auditLogs: (cursor?: string) =>
      request<Page<AuditLog>>('/v1/admin/audit-logs', { query: { cursor, limit: 50 } }),
  },
};

/** A fresh key per logical operation; reused verbatim when that operation is retried. */
export const newIdempotencyKey = () => crypto.randomUUID();

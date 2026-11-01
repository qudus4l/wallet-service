import { useQuery } from '@tanstack/react-query';
import { ErrorNote } from '../../components/ui';
import { api, type AuditLog } from '../../lib/api';
import { formatDate, formatNaira, shortId } from '../../lib/money';

const DESCRIBE: Record<string, (log: AuditLog) => string> = {
  USER_BLOCKED: () => 'Blocked a user',
  USER_UNBLOCKED: () => 'Unblocked a user',
  BLACKLIST_ADDED: (l) => `Blacklisted ${String(l.metadata.value ?? '')}`,
  BLACKLIST_REMOVED: (l) => `Removed ${String(l.metadata.value ?? '')} from the blacklist`,
  WALLET_DEPOSIT: (l) => `Funded a wallet with ${formatNaira(Number(l.metadata.amount ?? 0))}`,
};

export function ActivityTab() {
  const logs = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api.admin.auditLogs()).data,
  });
  return (
    <section>
      <p className="muted">Every admin action, newest first. Entries can’t be edited or deleted.</p>
      <ErrorNote error={logs.error} />
      {logs.data?.data.length === 0 && <p className="muted">No admin actions yet.</p>}
      <table className="passbook">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Action</th>
            <th scope="col">Target</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {logs.data?.data.map((log) => (
            <tr key={log.id}>
              <td className="passbook__date">{formatDate(log.createdAt)}</td>
              <td>{(DESCRIBE[log.action] ?? (() => log.action))(log)}</td>
              <td>
                <code>
                  {log.targetType.toLowerCase().replace('_', ' ')} {shortId(log.targetId)}
                </code>
              </td>
              <td>{log.reason ?? <span className="muted">None given</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

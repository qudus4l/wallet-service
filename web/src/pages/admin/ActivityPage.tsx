import { useInfiniteQuery } from '@tanstack/react-query';
import { Detail, Empty, Note, PageHead } from '../../components/ui';
import { api, type AuditLog, errorMessage } from '../../lib/api';
import { useApp } from '../../lib/app';
import { date, money, time } from '../../lib/format';

const logLabel = (l: AuditLog): string => {
  const value = String(l.metadata.value ?? '');
  switch (l.action) {
    case 'USER_BLOCKED':
      return 'Blocked a user';
    case 'USER_UNBLOCKED':
      return 'Unblocked a user';
    case 'WALLET_DEPOSIT':
      return 'Funded a wallet with ' + money(Number(l.metadata.amount ?? 0));
    case 'BLACKLIST_ADDED':
      return 'Blacklisted ' + value;
    default:
      return 'Removed ' + value + ' from the blacklist';
  }
};

const targetName = (l: AuditLog): string =>
  l.targetName ?? (typeof l.metadata.value === 'string' ? l.metadata.value : l.targetId);

export function ActivityPage() {
  const { openModal, closeModal } = useApp();
  const logs = useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: async ({ pageParam }) => (await api.admin.auditLogs(pageParam)).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const list = logs.data?.pages.flatMap((p) => p.data) ?? [];
  const total = logs.data?.pages.at(-1)?.total ?? list.length;

  const logDetails = (l: AuditLog) =>
    openModal(
      'Activity details',
      logLabel(l),
      <>
        <dl className="review-list">
          <Detail label="Date">{date(l.createdAt) + ' · ' + time(l.createdAt)}</Detail>
          <Detail label="Admin ID">
            <span className="mono">{l.actorId}</span>
          </Detail>
          <Detail label="Target type">{l.targetType}</Detail>
          <Detail label="Target ID">
            <span className="mono">{l.targetId}</span>
          </Detail>
          <Detail label="Reason">{l.reason || '—'}</Detail>
          <Detail label="Metadata">
            <span className="mono">{JSON.stringify(l.metadata)}</span>
          </Detail>
        </dl>
        <button className="btn full" onClick={closeModal}>
          Done
        </button>
      </>,
    );

  return (
    <>
      <PageHead title="Activity log" sub="A record of every admin action. Newest first." />
      <div className="card">
        {logs.error && !logs.data ? (
          <Note kind="error">{errorMessage(logs.error)}</Note>
        ) : !logs.data ? null : list.length ? (
          <>
            <div className="table-wrap">
              <table style={{ minWidth: 660 }}>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Target / Reason</th>
                    <th>Admin</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <button className="linkbtn row-name" onClick={() => logDetails(l)}>
                          {logLabel(l)}
                        </button>
                      </td>
                      <td>
                        {targetName(l)}
                        <div className="subline">{l.reason || 'No reason provided'}</div>
                      </td>
                      <td>{l.actorName ?? l.actorId}</td>
                      <td>
                        {date(l.createdAt)}
                        <div className="subline">{time(l.createdAt)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {list.length} of {total} actions
              </span>
              {logs.hasNextPage ? (
                <button
                  className="btn compact"
                  onClick={() => !logs.isFetchingNextPage && logs.fetchNextPage()}
                >
                  Load more
                </button>
              ) : (
                <span>All activity shown</span>
              )}
            </div>
          </>
        ) : (
          <Empty
            title="No admin activity yet"
            sub="Funding and access changes will appear here."
            icon="log"
          />
        )}
      </div>
    </>
  );
}

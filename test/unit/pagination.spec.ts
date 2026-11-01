import { toPage } from '../../src/common/pagination';

describe('toPage', () => {
  const rows = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];

  it('returns a cursor when an extra row exists', () => {
    expect(toPage(rows, 2, 7, (r) => r.id)).toEqual({
      data: ['c', 'b'],
      nextCursor: 'b',
      total: 7,
    });
  });

  it('returns no cursor on the last page', () => {
    expect(toPage(rows, 3, 3, (r) => r.id)).toEqual({
      data: ['c', 'b', 'a'],
      nextCursor: null,
      total: 3,
    });
  });
});

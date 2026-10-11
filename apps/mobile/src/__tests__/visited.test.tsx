import { render, screen, userEvent } from '@testing-library/react-native';

import { visitedIdsFromRows } from '@/features/visited/api';
import { VisitedButton } from '@/features/visited/visited-button';
import '@/lib/i18n';

/** What the visited query returns, whether there is a session, and what was asked to change. */
class MockVisited {
  static ids = new Set<string>();
  static signedIn = true;
  static changes: { attractionId: string; visited: boolean }[] = [];
}

jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ session: MockVisited.signedIn ? { user: { id: 'u1' } } : null }),
}));
jest.mock('@/features/visited/api', () => ({
  ...jest.requireActual('@/features/visited/api'),
  useVisitedIds: () => ({ isPending: false, data: MockVisited.ids }),
  useSetVisited: () => ({
    mutate: (change: { attractionId: string; visited: boolean }) =>
      MockVisited.changes.push(change),
    isPending: false,
  }),
}));

beforeEach(() => {
  MockVisited.ids = new Set();
  MockVisited.signedIn = true;
  MockVisited.changes = [];
});

describe('visitedIdsFromRows (D-085)', () => {
  test('collects the attraction ids into a set', () => {
    const rows = [
      { attraction_id: 'a1', user_id: 'u1', visited_at: '2026-10-12T10:00:00Z' },
      { attraction_id: 'a2', user_id: 'u1', visited_at: '2026-10-12T11:00:00Z' },
    ];
    expect(visitedIdsFromRows(rows)).toEqual(new Set(['a1', 'a2']));
  });

  test('no rows is an empty set', () => {
    expect(visitedIdsFromRows([]).size).toBe(0);
  });
});

describe('VisitedButton (D-085)', () => {
  test('offers to mark a new place as visited', async () => {
    render(<VisitedButton attractionId="a1" />);
    await userEvent.press(screen.getByRole('button', { name: "I've been here" }));
    expect(MockVisited.changes).toEqual([{ attractionId: 'a1', visited: true }]);
  });

  test('shows a visited place as visited and a tap undoes it', async () => {
    MockVisited.ids = new Set(['a1']);
    render(<VisitedButton attractionId="a1" />);
    expect(screen.getByText('Visited')).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId('toggle-visited'));
    expect(MockVisited.changes).toEqual([{ attractionId: 'a1', visited: false }]);
  });

  test('another place being visited does not mark this one', () => {
    MockVisited.ids = new Set(['a2']);
    render(<VisitedButton attractionId="a1" />);
    expect(screen.getByText("I've been here")).toBeOnTheScreen();
  });

  test('without a session there is nothing to mark, so no button', () => {
    MockVisited.signedIn = false;
    render(<VisitedButton attractionId="a1" />);
    expect(screen.queryByTestId('toggle-visited')).toBeNull();
  });
});

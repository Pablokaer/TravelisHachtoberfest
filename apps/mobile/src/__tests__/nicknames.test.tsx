// Nicknames (D-048): sign in with a nickname instead of the email, and the walk chat shows
// every author's @nickname — yours instead of "You" — falling back to the name without one.
import { render, screen } from '@testing-library/react-native';

import { signInWithLogin, isEmailLogin, NicknameLockedError } from '@/features/auth/api';
import { messageFromRow, type ChatMessage } from '@/features/chat/api';
import { WalkChat } from '@/features/chat/walk-chat';
import '@/lib/i18n';

/** The nickname sign-in backend: `login_email_for_nickname` and Supabase Auth's password grant. */
class MockLoginBackend {
  static accounts: Record<string, { email: string; password: string }> = {};
  static locked = new Set<string>();
  static signedInAs: string[] = [];

  static reset() {
    MockLoginBackend.accounts = { nina_walks: { email: 'nina@example.com', password: 'secret' } };
    MockLoginBackend.locked = new Set();
    MockLoginBackend.signedInAs = [];
  }

  static rpc = async (fn: string, args: { p_nickname: string; p_password: string }) => {
    if (fn !== 'login_email_for_nickname') throw new Error(`unexpected rpc ${fn}`);
    if (MockLoginBackend.locked.has(args.p_nickname)) {
      return { data: null, error: { code: 'P0429', message: 'too many failed sign-ins' } };
    }
    const account = MockLoginBackend.accounts[args.p_nickname];
    const ok = account && account.password === args.p_password;
    return { data: ok ? account.email : null, error: null };
  };

  static signInWithPassword = async ({ email }: { email: string; password: string }) => {
    MockLoginBackend.signedInAs.push(email);
    return { data: {}, error: null };
  };
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: never) => MockLoginBackend.rpc(fn, args),
    auth: { signInWithPassword: (c: never) => MockLoginBackend.signInWithPassword(c) },
    storage: {
      from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://s/${p}` } }) }),
    },
  },
  check: () => undefined,
  unwrap: (r: { data: unknown }) => r.data,
}));

/** The messages the chat hooks return. */
class MockChatMessages {
  static messages: ChatMessage[] = [];
}

jest.mock('@/features/chat/api', () => ({
  ...jest.requireActual('@/features/chat/api'),
  useWalkMessages: () => ({ isPending: false, isError: false, data: MockChatMessages.messages }),
  useSendWalkMessage: () => ({ isPending: false, error: null, mutate: jest.fn() }),
  useWalkChatLive: () => undefined,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Link: () => null }));

beforeEach(() => MockLoginBackend.reset());

describe('sign-in with a nickname', () => {
  test('an "@" means an email; anything else is a nickname', () => {
    expect(isEmailLogin('nina@example.com')).toBe(true);
    expect(isEmailLogin('nina_walks')).toBe(false);
  });

  test('a nickname and its password sign in with the account email', async () => {
    await signInWithLogin('Nina_Walks', 'secret');
    expect(MockLoginBackend.signedInAs).toEqual(['nina@example.com']);
  });

  test('an email signs in directly', async () => {
    await signInWithLogin('otto@example.com', 'x');
    expect(MockLoginBackend.signedInAs).toEqual(['otto@example.com']);
  });

  test('a wrong password or unknown nickname fails like a wrong email would', async () => {
    await expect(signInWithLogin('nina_walks', 'wrong')).rejects.toThrow(
      'Invalid login credentials',
    );
    await expect(signInWithLogin('nobody', 'secret')).rejects.toThrow('Invalid login credentials');
    expect(MockLoginBackend.signedInAs).toEqual([]);
  });

  test('a locked nickname says so', async () => {
    MockLoginBackend.locked.add('nina_walks');
    await expect(signInWithLogin('nina_walks', 'secret')).rejects.toBeInstanceOf(
      NicknameLockedError,
    );
  });
});

describe('nicknames in the walk chat', () => {
  const row = (over: Record<string, unknown>) =>
    messageFromRow({
      id: 'm1',
      body: 'Hi all',
      created_at: '2026-10-05T09:00:00Z',
      author_name: 'Nina',
      author_avatar_path: null,
      is_own: false,
      author_public_id: 'p1',
      author_nickname: 'nina_walks',
      ...over,
    });

  test('a message carries its author nickname', () => {
    expect(row({}).authorNickname).toBe('nina_walks');
    expect(row({ author_nickname: null }).authorNickname).toBeNull();
  });

  test('your messages show your @nickname instead of "You"; replies show theirs', () => {
    MockChatMessages.messages = [
      row({ id: 'm1', is_own: true }),
      row({ id: 'm2', author_name: 'Otto', author_nickname: 'otto', body: 'Hi Nina!' }),
    ];
    render(<WalkChat tripId="t1" />);
    expect(screen.getByTestId('chat-message-m1')).toHaveTextContent(/@nina_walks/);
    expect(screen.queryByText(/^You/)).toBeNull();
    expect(screen.getByTestId('chat-message-m2')).toHaveTextContent(/@otto/);
  });

  test('without a nickname the chat keeps the name (or "You")', () => {
    MockChatMessages.messages = [
      row({ id: 'm1', is_own: true, author_nickname: null }),
      row({ id: 'm2', author_name: 'Otto', author_nickname: null }),
    ];
    render(<WalkChat tripId="t1" />);
    expect(screen.getByTestId('chat-message-m1')).toHaveTextContent(/You/);
    expect(screen.getByTestId('chat-message-m2')).toHaveTextContent(/Otto/);
  });
});

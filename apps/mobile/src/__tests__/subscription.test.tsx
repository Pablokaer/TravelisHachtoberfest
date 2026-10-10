import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import PlansRoute from '@/app/plans';
import { planFromRow, startCheckout, type Subscription } from '@/features/subscription/api';
import { SubscriptionSection } from '@/features/subscription/subscription-section';
import { UpgradeButton } from '@/features/subscription/upgrade-button';
import '@/lib/i18n';
import { featuresWrapper } from '@/testing/features';
import {
  freePlanRow,
  freeSubscription as freeFixture,
  premiumPlanRow,
  premiumSubscription as premiumFixture,
} from '@/testing/subscription';

/** Plans as the `plans` table returns them, the caller's subscription, and how often it was read. */
class MockPlansServer {
  static planRows = [freePlanRow, premiumPlanRow];
  static subscription: Subscription;
  static subscriptionReads = 0;
}

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  const MockRedirect = ({ href }: { href: unknown }) => (
    <MockText testID="redirect">{JSON.stringify(href)}</MockText>
  );
  return { Stack: { Screen: () => null }, router: { push: jest.fn() }, Redirect: MockRedirect };
});
jest.mock('@/features/subscription/api', () => ({
  ...jest.requireActual('@/features/subscription/api'),
  usePlans: () => ({
    isPending: false,
    isError: false,
    data: MockPlansServer.planRows.map(
      jest.requireActual('@/features/subscription/api').planFromRow,
    ),
  }),
  useMySubscription: () => {
    MockPlansServer.subscriptionReads += 1;
    return { isPending: false, isError: false, data: MockPlansServer.subscription };
  },
}));

/** Paid plans are hidden for now (D-065); these tests describe them turned on. */
const withPaidPlans = { wrapper: featuresWrapper({ paidPlans: true }) };

const plans = MockPlansServer.planRows.map(planFromRow);
const freePlan = plans[0]!;
const premiumPlan = plans[1]!;

const freeSubscription = () => freeFixture(2);
const premiumSubscription = () => premiumFixture(9);

beforeEach(() => {
  MockPlansServer.subscription = freeSubscription();
  MockPlansServer.subscriptionReads = 0;
  jest.mocked(router.push).mockClear();
});

describe('plans and subscriptions (D-047)', () => {
  test('plans come from the database; Free has no limits any more (D-065)', () => {
    expect(freePlan).toEqual({
      id: 'free',
      priceCents: 0,
      currency: 'EUR',
      billingInterval: null,
      rules: { maxLists: null, maxItemsPerList: null, canDeleteLists: true },
    });
    expect(premiumPlan.rules).toEqual({
      maxLists: null,
      maxItemsPerList: null,
      canDeleteLists: true,
    });
  });

  test('a user without a subscription is on the Free plan', () => {
    const s = freeSubscription();
    expect(s.plan.id).toBe('free');
    expect(s.status).toBe('free');
    expect(s.validUntil).toBeNull();
    expect(s.listCount).toBe(2);
  });

  test('checkout is not connected yet: it says so instead of charging', async () => {
    await expect(startCheckout('premium')).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('while paid plans are hidden (D-065)', () => {
  test('no "Upgrade" in the top bar, and the plan is not even read', () => {
    render(<UpgradeButton />);
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
    expect(MockPlansServer.subscriptionReads).toBe(0);
  });

  test('no Settings → Subscription', () => {
    render(<SubscriptionSection />);
    expect(screen.queryByText('Subscription')).toBeNull();
    expect(screen.queryByText(/Current plan/)).toBeNull();
  });

  test('/plans sends the user home', () => {
    render(<PlansRoute />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('"/"');
    expect(screen.queryByTestId('plan-premium')).toBeNull();
  });
});

describe('PlansScreen', () => {
  test('shows Free and a highlighted Premium with their prices and what they include', () => {
    render(<PlansRoute />, withPaidPlans);
    const free = screen.getByTestId('plan-free');
    expect(free).toHaveTextContent(/€0/);
    expect(free).toHaveTextContent(/Unlimited lists/);
    const premium = screen.getByTestId('plan-premium');
    expect(premium).toHaveTextContent(/€5\.00 \/ month/);
    expect(premium).toHaveTextContent(/Unlimited lists/);
    expect(premium).toHaveTextContent(/Unlimited places per list/);
    expect(premium).toHaveTextContent(/Delete your lists/);
    expect(premium).toHaveTextContent(/Recommended/);
    expect(free).toHaveTextContent(/Current plan/);
  });

  test('"Upgrade to Premium" does not charge anything yet', async () => {
    render(<PlansRoute />, withPaidPlans);
    await userEvent.press(screen.getByRole('button', { name: 'Upgrade to Premium' }));
    expect(await screen.findByText(/Payments are coming soon/)).toBeOnTheScreen();
  });

  test('a Premium user sees Premium as the current plan and no upgrade', () => {
    MockPlansServer.subscription = premiumSubscription();
    render(<PlansRoute />, withPaidPlans);
    expect(screen.getByTestId('plan-premium')).toHaveTextContent(/Current plan/);
    expect(screen.queryByRole('button', { name: 'Upgrade to Premium' })).toBeNull();
  });
});

describe('Settings → Subscription', () => {
  test('Free: the current plan', () => {
    render(<SubscriptionSection />, withPaidPlans);
    expect(screen.getByText('Subscription')).toBeOnTheScreen();
    expect(screen.getByText('Current plan: Free')).toBeOnTheScreen();
    expect(screen.queryByText(/Valid until/)).toBeNull();
  });

  test('Premium: the plan, price, validity and Manage subscription', async () => {
    MockPlansServer.subscription = premiumSubscription();
    render(<SubscriptionSection />, withPaidPlans);
    expect(screen.getByText('Current plan: Premium')).toBeOnTheScreen();
    expect(screen.getByText('€5.00 / month')).toBeOnTheScreen();
    expect(screen.getByText(/^Valid until: /)).toHaveTextContent(/31/);
    await userEvent.press(screen.getByRole('button', { name: 'Manage subscription' }));
    expect(router.push).toHaveBeenCalledWith('/plans');
  });
});

describe('Upgrade in the top bar', () => {
  test('Free users get "Upgrade", which opens the plans', async () => {
    render(<UpgradeButton />, withPaidPlans);
    await userEvent.press(screen.getByRole('button', { name: 'Upgrade' }));
    expect(router.push).toHaveBeenCalledWith('/plans');
  });

  test('Premium users do not', () => {
    MockPlansServer.subscription = premiumSubscription();
    render(<UpgradeButton />, withPaidPlans);
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });
});

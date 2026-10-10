import { render, renderHook, screen, userEvent } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Badge, StatTile } from '@/components/card';
import { Chip } from '@/components/chip';
import { categoryIcon } from '@/components/icon';
import { ListRow, RowGroup } from '@/components/list-row';
import { useCentredOnPhone } from '@/components/phone-centring';
import { PageHeader, Section } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Sheet } from '@/components/sheet';
import { EmptyState, ErrorState } from '@/components/states';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { flagEmoji, initials } from '@/lib/format';
import { fontFamilyFor } from '@/theme/fonts';
import '@/lib/i18n';
import { layOutAsIPhone } from '@/testing/phone-width';

describe('format helpers', () => {
  test('flagEmoji maps ISO codes to regional indicators', () => {
    expect(flagEmoji('pt')).toBe('🇵🇹');
    expect(flagEmoji('GB')).toBe('🇬🇧');
  });

  test('initials takes up to two letters from a name or email', () => {
    expect(initials('Ana Traveller')).toBe('AT');
    expect(initials('ana.maria@example.com')).toBe('AM');
    expect(initials('')).toBe('');
  });
});

describe('theme', () => {
  test('fontFamilyFor maps weights to Inter families', () => {
    expect(fontFamilyFor(undefined)).toBe('Inter_400Regular');
    expect(fontFamilyFor('500')).toBe('Inter_500Medium');
    expect(fontFamilyFor('600')).toBe('Inter_600SemiBold');
    expect(fontFamilyFor('bold')).toBe('Inter_700Bold');
  });

  test('categoryIcon falls back to "other" for unknown categories', () => {
    expect(categoryIcon('museum')).toBe('museum');
    expect(categoryIcon('spaceport')).toBe('other');
  });

  test('Text resolves fontWeight to a font family and marks titles as headers', () => {
    render(
      <>
        <Text variant="title">Page</Text>
        <Text style={{ fontWeight: '600' }}>Bold body</Text>
      </>,
    );
    expect(screen.getByRole('header', { name: 'Page' })).toBeOnTheScreen();
    const body = screen.UNSAFE_getAllByType(RNText).find((n) => n.props.children === 'Bold body');
    expect(body?.props.style).toContainEqual({ fontFamily: 'Inter_600SemiBold' });
  });
});

describe('components', () => {
  test('Button fires onPress and is inert while loading', async () => {
    const onPress = jest.fn();
    const { rerender } = render(<Button label="Save" onPress={onPress} />);
    await userEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<Button label="Save" onPress={onPress} loading />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('IconButton exposes its accessibility label', async () => {
    const onPress = jest.fn();
    render(<IconButton icon="close" accessibilityLabel="Close" onPress={onPress} />);
    await userEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onPress).toHaveBeenCalled();
  });

  test('Chip reports its checked state', () => {
    render(<Chip label="Museums" selected onPress={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Museums' })).toBeChecked();
  });

  test('Segmented selects one option at a time', async () => {
    const onChange = jest.fn();
    render(
      <Segmented
        accessibilityLabel="View as"
        value="map"
        onChange={onChange}
        options={[
          { value: 'map', label: 'Map' },
          { value: 'list', label: 'List' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Map' })).toBeChecked();
    await userEvent.press(screen.getByRole('radio', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  test('ListRow in a RowGroup announces label and value; radio rows are checkable', () => {
    render(
      <RowGroup>
        <ListRow label="Home" value="Portugal" />
        <ListRow role="radio" label="English" selected onPress={jest.fn()} />
      </RowGroup>,
    );
    expect(screen.getByLabelText('Home, Portugal')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  });

  test('TextField shows the error instead of the hint', () => {
    const { rerender } = render(<TextField label="Email" hint="We never share it" />);
    expect(screen.getByText('We never share it')).toBeOnTheScreen();
    rerender(<TextField label="Email" hint="We never share it" error="validation.email" />);
    expect(screen.getByText('Enter a valid email address')).toBeOnTheScreen();
    expect(screen.queryByText('We never share it')).toBeNull();
  });

  test('StatTile and Badge render their content', () => {
    render(
      <>
        <StatTile icon="clock" label="Total" value="1 h" />
        <Badge label="UNESCO" />
      </>,
    );
    expect(screen.getByLabelText('Total: 1 h')).toBeOnTheScreen();
    expect(screen.getByText('UNESCO')).toBeOnTheScreen();
  });

  test('PageHeader and Section render titles as headers', () => {
    render(
      <>
        <PageHeader title="My Trips" subtitle="Saved walks" />
        <Section title="Stops" />
      </>,
    );
    expect(screen.getByRole('header', { name: 'My Trips' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Stops' })).toBeOnTheScreen();
  });

  test('EmptyState and ErrorState show their message and action', async () => {
    const onRetry = jest.fn();
    render(
      <>
        <EmptyState title="No trips yet" body="Build a route" />
        <ErrorState onRetry={onRetry} />
      </>,
    );
    expect(screen.getByRole('header', { name: 'No trips yet' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  test('Sheet shows a titled dialog with a close button', async () => {
    const onClose = jest.fn();
    render(
      <Sheet visible title="Choose a city" onClose={onClose}>
        <Text>Lisbon</Text>
      </Sheet>,
    );
    expect(screen.getByText('Lisbon')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

// iPhone audit (D-076): section titles are centred on phones, as PageHeader's are; tablets and
// desktop keep them at the start of the line.
describe('Section on a phone', () => {
  layOutAsIPhone();

  test('useCentredOnPhone is true at an iPhone width', () => {
    expect(renderHook(() => useCentredOnPhone()).result.current).toBe(true);
  });

  test('centres its title', () => {
    render(<Section title="Reviews" />);
    expect(screen.getByRole('header', { name: 'Reviews' })).toHaveStyle({ textAlign: 'center' });
  });

  test('stacks its action under the centred title', () => {
    render(<Section title="Before you go" action={<RNText>Choose your dates</RNText>} />);
    expect(screen.getByTestId('section-header')).toHaveStyle({
      flexDirection: 'column',
      alignItems: 'center',
    });
  });
});

describe('Section on a tablet', () => {
  test('useCentredOnPhone is false at a tablet width', () => {
    expect(renderHook(() => useCentredOnPhone()).result.current).toBe(false);
  });

  test('keeps its title at the start of the line, beside the action', () => {
    render(<Section title="Reviews" action={<RNText>Choose your dates</RNText>} />);
    expect(screen.getByRole('header', { name: 'Reviews' })).not.toHaveStyle({
      textAlign: 'center',
    });
    expect(screen.getByTestId('section-header')).toHaveStyle({ flexDirection: 'row' });
  });
});

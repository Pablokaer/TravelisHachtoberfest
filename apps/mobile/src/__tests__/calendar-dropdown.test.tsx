import { render, screen, userEvent } from '@testing-library/react-native';

import { CalendarDropdown } from '@/components/calendar-dropdown';
import '@/lib/i18n';

const TODAY = '2026-10-11';

describe('CalendarDropdown (D-081)', () => {
  test('shows the chosen date on a button and keeps the calendar closed', () => {
    render(<CalendarDropdown value="2026-12-05" today={TODAY} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /5 December 2026/ })).toBeOnTheScreen();
    expect(screen.queryByText('Mon')).toBeNull();
  });

  test('opens a month calendar on the chosen date and picks another day', async () => {
    const onChange = jest.fn();
    render(<CalendarDropdown value="2026-12-05" today={TODAY} onChange={onChange} />);
    await userEvent.press(screen.getByRole('button', { name: /5 December 2026/ }));
    expect(screen.getByText('December 2026')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '24 December 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-12-24');
  });

  test('moves between months', async () => {
    render(<CalendarDropdown value="2026-12-05" today={TODAY} onChange={jest.fn()} />);
    await userEvent.press(screen.getByRole('button', { name: /5 December 2026/ }));
    await userEvent.press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('January 2027')).toBeOnTheScreen();
  });

  test('days before today cannot be picked', async () => {
    const onChange = jest.fn();
    render(<CalendarDropdown value={null} today={TODAY} onChange={onChange} />);
    await userEvent.press(screen.getByRole('button', { name: 'Choose a date' }));
    expect(screen.getByText('October 2026')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: '3 October 2026' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: '20 October 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-10-20');
  });
});

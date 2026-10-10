// A date picked from a calendar that drops down under a button (D-081). Written here instead of
// using a native picker so it looks the same on the web, iOS and Android.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { addMonths, isoDate, monthGrid, parseIsoDate, type YearMonth } from '@/lib/calendar';
import { formatDate } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type Props = {
  /** The chosen day as YYYY-MM-DD, or null before one is chosen. */
  value: string | null;
  /** Today as YYYY-MM-DD: earlier days cannot be picked. Injected so tests do not depend on the clock. */
  today: string;
  onChange: (isoDate: string) => void;
};

const localeFor = (language: string): string => (language === 'pt' ? 'pt-PT' : 'en-GB');

/** Monday-first weekday labels in the UI language (2026-06-01 is a Monday). */
function weekdayLabels(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    formatDate(isoDate(2026, 6, 1 + i), locale, { dateStyle: undefined, weekday: 'short' }),
  );
}

function MonthHeader(props: { shown: YearMonth; onMove: (delta: number) => void }) {
  const { t, i18n } = useTranslation();
  const label = formatDate(
    isoDate(props.shown.year, props.shown.month, 1),
    localeFor(i18n.language),
    {
      dateStyle: undefined,
      month: 'long',
      year: 'numeric',
    },
  );
  return (
    <View style={styles.header}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={t('calendar.previousMonth')}
        onPress={() => props.onMove(-1)}
        style={styles.arrow}>
        <Text variant="heading">‹</Text>
      </Tappable>
      <Text variant="subtitle">{label}</Text>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={t('calendar.nextMonth')}
        onPress={() => props.onMove(1)}
        style={styles.arrow}>
        <Text variant="heading">›</Text>
      </Tappable>
    </View>
  );
}

function DayCell({
  day,
  locale,
  chosen,
  past,
  onPick,
}: {
  day: string | null;
  locale: string;
  chosen: boolean;
  past: boolean;
  onPick: (d: string) => void;
}) {
  const theme = useTheme();
  if (!day) return <View style={styles.cell} />;
  const label = formatDate(day, locale, { dateStyle: 'long' });
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen, disabled: past }}
      disabled={past}
      onPress={() => onPick(day)}
      style={[styles.cell, chosen && { backgroundColor: theme.primary }]}>
      <Text style={[{ color: chosen ? theme.onPrimary : theme.text }, past && styles.past]}>
        {Number(day.slice(8))}
      </Text>
    </Tappable>
  );
}

/**
 * @example <CalendarDropdown value={date} today="2026-10-11" onChange={setDate} />
 */
export function CalendarDropdown({ value, today, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.language);
  const [open, setOpen] = useState(false);
  const start = parseIsoDate(value ?? today);
  const [shown, setShown] = useState<YearMonth>({ year: start.year, month: start.month });
  const pick = (day: string) => {
    onChange(day);
    setOpen(false);
  };
  return (
    <View style={styles.box}>
      <Button
        variant="secondary"
        icon="calendar"
        label={value ? formatDate(value, locale, { dateStyle: 'long' }) : t('calendar.chooseDate')}
        onPress={() => setOpen((v) => !v)}
      />
      {open ? (
        <Card>
          <MonthHeader shown={shown} onMove={(delta) => setShown(addMonths(shown, delta))} />
          <View style={styles.week}>
            {weekdayLabels(locale).map((name) => (
              <Text key={name} variant="caption" secondary style={styles.cell}>
                {name}
              </Text>
            ))}
          </View>
          {monthGrid(shown.year, shown.month).map((week) => (
            <View key={week.join()} style={styles.week}>
              {week.map((day, i) => (
                <DayCell
                  key={day ?? `blank-${i}`}
                  day={day}
                  locale={locale}
                  chosen={day === value}
                  past={!!day && day < today}
                  onPick={pick}
                />
              ))}
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  week: { flexDirection: 'row' },
  // A fixed height: a square cell would be as tall as the wide column on a desktop page.
  cell: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    textAlign: 'center',
  },
  past: { opacity: 0.3 },
});

// The answer area of one question of the planner (D-081): options to tick, a calendar for the
// date, a place for the origin, and always a box to type an answer of one's own.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CalendarDropdown } from '@/components/calendar-dropdown';
import { Chip } from '@/components/chip';
import { ListRow, RowGroup } from '@/components/list-row';
import { TextField } from '@/components/text-field';
import type { City } from '@/features/destinations/api';
import { spacing } from '@/theme/colors';
import { OriginPicker } from './origin-picker';
import type { PlanAnswer, PlanQuestion } from './plan-flow';
import type { Origin } from './use-plan-wizard';

type Props = {
  question: PlanQuestion;
  answer: PlanAnswer | undefined;
  onAnswer: (answer: PlanAnswer) => void;
  origin: Origin | null;
  onOrigin: (origin: Origin) => void;
  cities: City[];
  /** Today as YYYY-MM-DD. */
  today: string;
};

const EMPTY: PlanAnswer = { values: [], other: '' };

function Options({ question, answer, onAnswer }: Pick<Props, 'question' | 'answer' | 'onAnswer'>) {
  const current = answer ?? EMPTY;
  if (question.kind === 'multi') {
    const toggle = (value: string) =>
      onAnswer({
        ...current,
        values: current.values.includes(value)
          ? current.values.filter((v) => v !== value)
          : [...current.values, value],
      });
    return (
      <View style={styles.chips}>
        {question.options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={current.values.includes(o.value)}
            onPress={() => toggle(o.value)}
          />
        ))}
      </View>
    );
  }
  return (
    <RowGroup>
      {question.options.map((o) => (
        <ListRow
          key={o.value}
          role="radio"
          label={o.label}
          selected={current.values[0] === o.value}
          onPress={() => onAnswer({ ...current, values: [o.value] })}
        />
      ))}
    </RowGroup>
  );
}

function OtherField({
  question,
  answer,
  onAnswer,
}: Pick<Props, 'question' | 'answer' | 'onAnswer'>) {
  const { t } = useTranslation();
  const current = answer ?? EMPTY;
  const label = question.id === 'distance' ? t('plan.distanceOther') : t('plan.other');
  return (
    <TextField
      label={question.kind === 'text' ? question.text : label}
      placeholder={t('plan.otherPlaceholder')}
      value={current.other}
      multiline={question.kind === 'text'}
      onChangeText={(other) => onAnswer({ ...current, other })}
      testID="plan-other"
    />
  );
}

/**
 * @example <PlanQuestionView question={q} answer={a} onAnswer={setAnswer} origin={o} … />
 */
export function PlanQuestionView(props: Props) {
  const { question, answer, onAnswer } = props;
  if (question.kind === 'origin') {
    return <OriginPicker origin={props.origin} cities={props.cities} onOrigin={props.onOrigin} />;
  }
  if (question.kind === 'date') {
    return (
      <CalendarDropdown
        value={answer?.values[0] ?? null}
        today={props.today}
        onChange={(day) => onAnswer({ values: [day], other: '' })}
      />
    );
  }
  return (
    <View style={styles.box}>
      {question.kind === 'text' ? null : (
        <Options question={question} answer={answer} onAnswer={onAnswer} />
      )}
      {question.allowOther || question.kind === 'text' ? (
        <OtherField question={question} answer={answer} onAnswer={onAnswer} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

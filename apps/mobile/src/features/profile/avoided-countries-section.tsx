// The countries the traveller never wants the trip planner to propose (D-082), shown in the
// profile where they can also be taken off. They are added while planning a trip.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/chip';
import { Section } from '@/components/screen';
import { Text } from '@/components/text';
import { spacing } from '@/theme/colors';

type Props = {
  /** The avoided countries, as ISO codes. */
  codes: readonly string[];
  /** A country's name in the language of the interface. */
  nameOf: (code: string) => string;
  onChange: (codes: string[]) => void;
};

/**
 * @example <AvoidedCountriesSection codes={p.avoidCountries} nameOf={name} onChange={save.mutate} />
 */
export function AvoidedCountriesSection({ codes, nameOf, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <Section title={t('profile.avoidTitle')}>
      {codes.length === 0 ? <Text secondary>{t('profile.avoidNone')}</Text> : null}
      <View style={styles.chips}>
        {codes.map((code) => (
          <Chip
            key={code}
            selected
            label={nameOf(code)}
            accessibilityLabel={t('profile.avoidRemove', { country: nameOf(code) })}
            onRemove={() => onChange(codes.filter((c) => c !== code))}
          />
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

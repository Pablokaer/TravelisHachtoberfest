import { SUPPORTED_LANGUAGES, UNITS, type ProfileForm } from '@wayfarer/shared';
import { Controller, type Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CountryPicker } from './country-picker';

import { Chip } from '@/components/chip';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { spacing } from '@/theme/colors';

type Props = { control: Control<ProfileForm> };

export function NameAndPreferencesFields({ control }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <Controller
        control={control}
        name="displayName"
        render={({ field, fieldState }) => (
          <TextField
            label={t('profile.displayName')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoComplete="name"
            testID="displayName"
          />
        )}
      />
      <Controller
        control={control}
        name="nickname"
        render={({ field, fieldState }) => (
          <TextField
            label={t('auth.nickname')}
            hint={t('auth.nicknameHint')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            testID="nickname"
          />
        )}
      />
      <Controller
        control={control}
        name="language"
        render={({ field }) => (
          <View style={styles.group}>
            <Text variant="label">{t('profile.language')}</Text>
            <View style={styles.row} accessibilityRole="radiogroup">
              {SUPPORTED_LANGUAGES.map((lng) => (
                <Chip
                  key={lng}
                  label={t(`profile.languageName.${lng}`)}
                  selected={field.value === lng}
                  onPress={() => {
                    field.onChange(lng);
                    void i18n.changeLanguage(lng);
                  }}
                />
              ))}
            </View>
          </View>
        )}
      />
      <Controller
        control={control}
        name="units"
        render={({ field }) => (
          <View style={styles.group}>
            <Text variant="label">{t('profile.units')}</Text>
            <View style={styles.row} accessibilityRole="radiogroup">
              {UNITS.map((u) => (
                <Chip
                  key={u}
                  label={t(`profile.unitsName.${u}`)}
                  selected={field.value === u}
                  onPress={() => field.onChange(u)}
                />
              ))}
            </View>
          </View>
        )}
      />
    </>
  );
}

export function NationalityFields({ control }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <Controller
        control={control}
        name="nationalities"
        render={({ field, fieldState }) => (
          <CountryPicker
            multiple
            label={t('profile.nationalities')}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message ?? fieldState.error?.root?.message}
            testID="nationalities"
          />
        )}
      />
      <Text variant="helper" secondary style={styles.hint}>
        {t('profile.nationalitiesHint')}
      </Text>
      <Controller
        control={control}
        name="homeCountry"
        render={({ field, fieldState }) => (
          <CountryPicker
            label={t('profile.homeCountry')}
            value={field.value ? [field.value] : []}
            onChange={(codes) => field.onChange(codes[0] ?? '')}
            error={fieldState.error?.message}
            testID="homeCountry"
          />
        )}
      />
      <Text variant="helper" secondary style={styles.hint}>
        {t('profile.homeCountryHint')}
      </Text>
    </>
  );
}

export function PassportFields({ control }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <Controller
        control={control}
        name="passportExpiry"
        render={({ field, fieldState }) => (
          <TextField
            label={t('profile.passportExpiry')}
            hint={t('profile.passportExpiryHint')}
            placeholder="YYYY-MM-DD"
            value={field.value ?? ''}
            onChangeText={(v) => field.onChange(v.trim() === '' ? null : v.trim())}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            testID="passportExpiry"
          />
        )}
      />
      <Text variant="helper" secondary style={styles.hint}>
        {t('profile.privacyNote')}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  // Pull hints up under the picker they describe.
  hint: { marginTop: -spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

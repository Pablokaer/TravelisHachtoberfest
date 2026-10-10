import type { ChecklistResponse, Units } from '@wayfarer/shared';
import * as WebBrowser from 'expo-web-browser';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { PlugIcon } from '@/features/checklist/plug-icon';
import { useCountries, countryName } from '@/features/profile/api';
import {
  formatDate,
  formatNumber,
  formatPrecipitation,
  formatTemperature,
  weatherBucket,
} from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

export type Tone = 'ok' | 'warning' | 'problem' | 'info';

const TONE_ICON: Record<Tone, IconName> = {
  ok: 'check',
  warning: 'error',
  problem: 'close',
  info: 'info',
};

export function SectionCard({
  title,
  tone,
  testID,
  children,
}: PropsWithChildren<{ title: string; tone: Tone; testID?: string }>) {
  const theme = useTheme();
  const shadows = useShadows();
  const { t } = useTranslation();
  const color = {
    ok: theme.success,
    warning: theme.warning,
    problem: theme.danger,
    info: theme.info,
  }[tone];
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border, boxShadow: shadows.card },
      ]}
      accessible={false}>
      <View style={styles.cardHeader}>
        <Text variant="heading" style={{ flex: 1 }}>
          {title}
        </Text>
        <View style={[styles.tone, { borderColor: color }]}>
          <Icon name={TONE_ICON[tone]} size={14} color={color} />
          <Text variant="helper" style={{ color, fontWeight: '600' }}>
            {t(`checklist.tone.${tone}`)}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function Unavailable() {
  const { t } = useTranslation();
  return <Text secondary>{t('checklist.unavailable')}</Text>;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text secondary style={{ flex: 1 }}>
        {label}
      </Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const open = (url: string) => void WebBrowser.openBrowserAsync(url);

export function VisaSection({ data }: { data: ChecklistResponse['visa'] }) {
  const { t, i18n } = useTranslation();
  const countries = useCountries();
  const lang = i18n.resolvedLanguage ?? 'en';
  const name = (code: string) =>
    countryName(
      countries.data?.find((c) => c.code === code),
      lang,
    ) || code;
  if (data.status !== 'ok') {
    return (
      <SectionCard title={t('checklist.visa.title')} tone="info" testID="section-visa">
        <Unavailable />
      </SectionCard>
    );
  }
  const { best } = data;
  const tone: Tone =
    best.requirement === 'no_admission' || best.requirement === 'visa_required'
      ? 'problem'
      : best.requirement === 'eta' ||
          best.requirement === 'e_visa' ||
          best.requirement === 'visa_on_arrival'
        ? 'warning'
        : 'ok';
  return (
    <SectionCard title={t('checklist.visa.title')} tone={tone} testID="section-visa">
      <Text style={{ fontWeight: '600' }}>
        {best.isCitizen ? t('checklist.visa.citizen') : t(`visa.${best.requirement}`)}
      </Text>
      {!best.isCitizen ? (
        <Text secondary>
          {t('checklist.visa.withPassport', { country: name(best.nationality) })}
          {best.maxStayDays ? ` · ${t('checklist.visa.maxStay', { days: best.maxStayDays })}` : ''}
        </Text>
      ) : null}
      <Text>{t(`checklist.visa.advice.${best.isCitizen ? 'citizen' : best.requirement}`)}</Text>
      {data.options.length > 1 ? (
        <View style={{ gap: 2 }}>
          {data.options.map((o) => (
            <Text key={o.nationality} variant="caption" secondary>
              {name(o.nationality)}: {t(`visa.${o.requirement}`)}
              {o.maxStayDays ? ` (${t('checklist.visa.maxStay', { days: o.maxStayDays })})` : ''}
            </Text>
          ))}
        </View>
      ) : null}
      <Text variant="caption" secondary>
        {t('checklist.visa.disclaimer')}
      </Text>
      <Button
        compact
        variant="ghost"
        label={t('checklist.source')}
        onPress={() => open(data.sourceUrl)}
      />
    </SectionCard>
  );
}

export function PassportSection({ data }: { data: ChecklistResponse['passport'] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  if (data.status !== 'ok') {
    return (
      <SectionCard title={t('checklist.passport.title')} tone="info" testID="section-passport">
        <Unavailable />
      </SectionCard>
    );
  }
  const tone: Tone = { ok: 'ok', warning: 'warning', problem: 'problem', unknown: 'info' }[
    data.validity
  ] as Tone;
  return (
    <SectionCard title={t('checklist.passport.title')} tone={tone} testID="section-passport">
      <Text>{t(`checklist.passport.rule.${data.rule}`)}</Text>
      <Line
        label={t('checklist.passport.validUntil')}
        value={formatDate(data.requiredUntil, lang)}
      />
      {data.passportExpiry ? (
        <Line
          label={t('checklist.passport.yourExpiry')}
          value={formatDate(data.passportExpiry, lang)}
        />
      ) : null}
      <Text style={{ fontWeight: '600' }}>{t(`checklist.passport.validity.${data.validity}`)}</Text>
    </SectionCard>
  );
}

export function PowerSection({ data }: { data: ChecklistResponse['power'] }) {
  const { t } = useTranslation();
  if (data.status !== 'ok') {
    return (
      <SectionCard title={t('checklist.power.title')} tone="info" testID="section-power">
        <Unavailable />
      </SectionCard>
    );
  }
  const tone: Tone =
    data.adapterNeeded || data.voltageDiffers
      ? 'warning'
      : data.adapterNeeded === false
        ? 'ok'
        : 'info';
  return (
    <SectionCard title={t('checklist.power.title')} tone={tone} testID="section-power">
      <PlugList label={t('checklist.power.plugs')} types={data.destinationPlugs} />
      <Line
        label={t('checklist.power.voltage')}
        value={
          [
            data.destinationVoltage ? `${data.destinationVoltage} V` : null,
            data.destinationFrequencyHz ? `${data.destinationFrequencyHz} Hz` : null,
          ]
            .filter(Boolean)
            .join(' · ') || '–'
        }
      />
      {data.homePlugs.length ? (
        <PlugList label={t('checklist.power.yourPlugs')} types={data.homePlugs} />
      ) : null}
      <Text style={{ fontWeight: '600' }}>
        {data.adapterNeeded == null
          ? t('checklist.power.adapterUnknown')
          : data.adapterNeeded
            ? t('checklist.power.adapterNeeded')
            : t('checklist.power.noAdapter')}
      </Text>
      {data.voltageDiffers ? <Text>{t('checklist.power.voltageWarning')}</Text> : null}
    </SectionCard>
  );
}

function PlugList({ label, types }: { label: string; types: string[] }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text secondary>{label}</Text>
      {types.length ? (
        <View style={styles.plugs}>
          {types.map((type) => {
            const name = t('checklist.power.type', { type });
            return (
              <View
                key={type}
                style={styles.plug}
                accessible
                accessibilityRole="image"
                accessibilityLabel={name}>
                <PlugIcon type={type} />
                <Text variant="caption" style={{ fontWeight: '600' }}>
                  {name}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.value}>–</Text>
      )}
    </View>
  );
}

export function WeatherSection({
  data,
  units,
}: {
  data: ChecklistResponse['weather'];
  units: Units;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  if (data.status !== 'ok') {
    return (
      <SectionCard title={t('checklist.weather.title')} tone="info" testID="section-weather">
        <Unavailable />
      </SectionCard>
    );
  }
  return (
    <SectionCard title={t('checklist.weather.title')} tone="info" testID="section-weather">
      {data.mode === 'forecast' ? (
        <View style={{ gap: spacing.xs }}>
          <Text secondary>{t('checklist.weather.forecast')}</Text>
          {data.days.map((d) => (
            <View key={d.date} style={styles.line}>
              <Text style={{ flex: 1 }}>
                {formatDate(d.date, lang, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  dateStyle: undefined,
                })}
              </Text>
              <Text secondary style={{ flex: 1 }}>
                {t(`weather.${weatherBucket(d.weatherCode)}`)}
              </Text>
              <Text style={styles.value}>
                {formatTemperature(d.tempMinC, units)} / {formatTemperature(d.tempMaxC, units)}
                {d.precipitationProbability != null
                  ? ` · ${Math.round(d.precipitationProbability)}%`
                  : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : data.climate ? (
        <View style={{ gap: spacing.xs }}>
          <Text secondary>
            {t('checklist.weather.climate', {
              month: formatDate(`2000-${String(data.climate.month).padStart(2, '0')}-15`, lang, {
                month: 'long',
                dateStyle: undefined,
              }),
              years: data.climate.years,
            })}
          </Text>
          <Line
            label={t('checklist.weather.avgHigh')}
            value={formatTemperature(data.climate.avgMaxC, units)}
          />
          <Line
            label={t('checklist.weather.avgLow')}
            value={formatTemperature(data.climate.avgMinC, units)}
          />
          <Line
            label={t('checklist.weather.rainPerDay')}
            value={formatPrecipitation(data.climate.avgPrecipitationMm, units)}
          />
          <Line
            label={t('checklist.weather.rainyDays')}
            value={formatNumber(data.climate.avgRainyDays, lang, 0)}
          />
        </View>
      ) : (
        <Unavailable />
      )}
      <Text variant="caption" secondary>
        {data.attribution}
      </Text>
    </SectionCard>
  );
}

export function MoneySection({ data }: { data: ChecklistResponse['money'] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  if (data.status !== 'ok') {
    return (
      <SectionCard title={t('checklist.money.title')} tone="info" testID="section-money">
        <Unavailable />
      </SectionCard>
    );
  }
  return (
    <SectionCard title={t('checklist.money.title')} tone="info" testID="section-money">
      <Line label={t('checklist.money.currency')} value={data.currency} />
      {data.homeCurrency && data.homeCurrency !== data.currency ? (
        data.rate != null ? (
          <Line
            label={t('checklist.money.rate')}
            value={`1 ${data.homeCurrency} = ${formatNumber(data.rate, lang, 4)} ${data.currency}`}
          />
        ) : (
          <Text secondary>{t('checklist.money.rateUnavailable')}</Text>
        )
      ) : data.homeCurrency ? (
        <Text>{t('checklist.money.sameCurrency')}</Text>
      ) : null}
      {data.rateDate || data.provider ? (
        <Text variant="caption" secondary>
          {t('checklist.money.indicative', {
            date: data.rateDate ?? '',
            provider: data.provider ?? '',
          })}
        </Text>
      ) : null}
    </SectionCard>
  );
}

export function SafetySection({ data }: { data: ChecklistResponse['safety'] }) {
  const { t } = useTranslation();
  if (data.status !== 'ok') {
    return (
      <SectionCard title={t('checklist.safety.title')} tone="info" testID="section-safety">
        <Unavailable />
      </SectionCard>
    );
  }
  const tone: Tone = data.level === 0 ? 'ok' : data.level === 1 ? 'warning' : 'problem';
  return (
    <SectionCard title={t('checklist.safety.title')} tone={tone} testID="section-safety">
      <Text style={{ fontWeight: '600' }}>
        {t(`checklist.safety.level.${data.level}` as 'checklist.safety.level.0')}
      </Text>
      {data.hasRegionalAdvisory ? <Text>{t('checklist.safety.regional')}</Text> : null}
      <Text variant="caption" secondary>
        {t('checklist.safety.source', { source: data.sourceName })}
      </Text>
      <View style={styles.buttons}>
        <Button
          compact
          variant="ghost"
          label={t('checklist.safety.readCanada')}
          onPress={() => open(data.sourceUrl)}
        />
        <Button
          compact
          variant="ghost"
          label={t('checklist.safety.readUk')}
          onPress={() => open(data.ukAdviceUrl)}
        />
      </View>
    </SectionCard>
  );
}

export function PracticalSection({ data }: { data: ChecklistResponse['practical'] }) {
  const { t } = useTranslation();
  if (data.status !== 'ok') {
    return (
      <SectionCard title={t('checklist.practical.title')} tone="info" testID="section-practical">
        <Unavailable />
      </SectionCard>
    );
  }
  const e = data.emergency;
  const languageNames = (() => {
    try {
      const dn = new Intl.DisplayNames([t('common.locale')], { type: 'language' });
      return data.languages.map((l) => dn.of(l) ?? l);
    } catch {
      return data.languages;
    }
  })();
  return (
    <SectionCard title={t('checklist.practical.title')} tone="info" testID="section-practical">
      {e.general ? <Line label={t('checklist.practical.emergency')} value={e.general} /> : null}
      {e.police ? <Line label={t('checklist.practical.police')} value={e.police} /> : null}
      {e.ambulance ? <Line label={t('checklist.practical.ambulance')} value={e.ambulance} /> : null}
      {e.fire ? <Line label={t('checklist.practical.fire')} value={e.fire} /> : null}
      {data.drivingSide ? (
        <Line
          label={t('checklist.practical.driving')}
          value={t(`checklist.practical.side.${data.drivingSide}`)}
        />
      ) : null}
      {data.callingCode ? (
        <Line label={t('checklist.practical.callingCode')} value={data.callingCode} />
      ) : null}
      {languageNames.length ? (
        <Line label={t('checklist.practical.languages')} value={languageNames.join(', ')} />
      ) : null}
      {data.timezone ? (
        <Line label={t('checklist.practical.timezone')} value={data.timezone} />
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg - 4,
    gap: spacing.md - 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  value: { fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  plugs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  plug: { alignItems: 'center', gap: spacing.xs },
});

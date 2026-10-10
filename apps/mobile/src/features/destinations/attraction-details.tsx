// The part of an attraction's page that only the full `attraction_details` row has: its story
// from Wikipedia (D-070) or else the short description, visit time and fee, opening hours, links — and its skeleton while that row loads (the header
// already shows from the cached city list, D-062).
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { AttractionDetail } from './api';
import { WikipediaTextBlock } from './wikipedia-texts';

import { StatTile } from '@/components/card';
import type { IconName } from '@/components/icon';
import { ListRow, RowGroup } from '@/components/list-row';
import { Section } from '@/components/screen';
import { Text } from '@/components/text';
import { preferredArticle, wikipediaTextsFor, wikipediaUrl } from '@/lib/wikipedia';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const open = (url: string) => void WebBrowser.openBrowserAsync(url);

type Link = { icon: IconName; label: string; url: string };

/** "Yes" / "No" for OSM's fee flag, else its free text (e.g. "€10"); null when unknown. */
function useFeeLabel(fee: string | null): string | null {
  const { t } = useTranslation();
  if (!fee) return null;
  if (fee === 'yes') return t('attraction.feeYes');
  return fee === 'no' ? t('attraction.feeNo') : fee;
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

/** The Wikipedia introduction and history; the one-line Wikidata description without them. */
function AttractionStory({ a }: { a: AttractionDetail }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const texts = wikipediaTextsFor(a, lang);
  if (texts.summary || texts.history) return <WikipediaTextBlock texts={texts} />;
  const description =
    lang === 'pt' ? (a.descriptionPt ?? a.descriptionEn) : (a.descriptionEn ?? a.descriptionPt);
  return description ? <Text style={styles.description}>{description}</Text> : null;
}

/**
 * The place's story and the Details section (visit time, fee, opening hours).
 * @example <AttractionAbout a={page.detail} />
 */
export function AttractionAbout({ a }: { a: AttractionDetail }) {
  const { t } = useTranslation();
  const fee = useFeeLabel(a.fee);
  return (
    <>
      <AttractionStory a={a} />
      <Divider />
      <Section title={t('attraction.details')}>
        <View style={styles.tiles}>
          <StatTile
            icon="clock"
            label={t('attraction.visitTime')}
            value={t('attraction.visitMinutes', { minutes: a.avgVisitMinutes })}
          />
          {fee ? <StatTile icon="ticket" label={t('attraction.fee')} value={fee} /> : null}
        </View>
        {/* Opening hours are free-form OSM strings, often too long for a tile. */}
        <RowGroup>
          <ListRow
            icon="calendar"
            label={t('attraction.openingHours')}
            value={a.openingHours ?? t('attraction.notAvailable')}
          />
        </RowGroup>
      </Section>
    </>
  );
}

/**
 * Website, Wikipedia article and photo source; nothing when the place has none.
 * @example <AttractionLinks a={page.detail} />
 */
export function AttractionLinks({ a }: { a: AttractionDetail }) {
  const { t, i18n } = useTranslation();
  const article = preferredArticle(i18n.resolvedLanguage ?? 'en', a.wikipediaEn, a.wikipediaPt);
  const articleUrl = article ? wikipediaUrl(article) : null;
  const links = [
    a.website && { icon: 'globe', label: t('attraction.website'), url: a.website },
    articleUrl && { icon: 'info', label: t('attraction.wikipedia'), url: articleUrl },
    a.imagePageUrl && { icon: 'photo', label: t('attraction.imageSource'), url: a.imagePageUrl },
  ].filter((link): link is Link => !!link);
  if (!links.length) return null;
  return (
    <Section title={t('attraction.links')}>
      <RowGroup>
        {links.map((link) => (
          <ListRow
            key={link.icon}
            icon={link.icon}
            role="link"
            external
            label={link.label}
            onPress={() => open(link.url)}
          />
        ))}
      </RowGroup>
    </Section>
  );
}

/**
 * Grey bars where the description and the details will be, while the full row loads.
 * @example {page.detail ? <AttractionAbout a={page.detail} /> : <AttractionDetailsSkeleton />}
 */
export function AttractionDetailsSkeleton() {
  const { t } = useTranslation();
  const theme = useTheme();
  const bar = (width: `${number}%`, height = 16) => (
    <View style={[styles.bar, { width, height, backgroundColor: theme.surfaceMuted }]} />
  );
  return (
    <View
      testID="attraction-details-loading"
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      style={styles.skeleton}>
      {bar('100%')}
      {bar('92%')}
      {bar('64%')}
      <Divider />
      {bar('40%', 24)}
      {bar('100%', 72)}
    </View>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: 17, lineHeight: 27 },
  divider: { height: StyleSheet.hairlineWidth },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md - 4 },
  skeleton: { gap: spacing.md - 4 },
  bar: { borderRadius: radius.sm },
});

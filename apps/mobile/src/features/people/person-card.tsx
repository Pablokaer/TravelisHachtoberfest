// One notable person on the city page (D-071): portrait (or initials) with its Commons credit,
// name, life years, Wikidata's one-line description and how they are tied to the city. The card
// opens the person's Wikipedia article.
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { NotablePerson } from './api';
import { connectionKey, lifeYears } from './format';

import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/card';
import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { preferredArticle, wikipediaUrl } from '@/lib/wikipedia';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

export const PERSON_CARD_WIDTH = 220;

function usePersonTexts(p: NotablePerson) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const pt = lang === 'pt';
  return {
    name: (pt && p.namePt) || p.nameEn,
    description: pt ? (p.descriptionPt ?? p.descriptionEn) : (p.descriptionEn ?? p.descriptionPt),
    years: lifeYears(p, t),
    article: preferredArticle(lang, p.wikipediaEn, p.wikipediaPt),
  };
}

function PhotoCredit({ p }: { p: NotablePerson }) {
  const { t } = useTranslation();
  if (!p.imageUrl) return null;
  return (
    <Text variant="helper" secondary numberOfLines={1} style={styles.credit}>
      {t('people.photoCredit', {
        author: p.imageAuthor ?? t('attraction.unknownAuthor'),
        license: p.imageLicense ?? '',
      })}
    </Text>
  );
}

/**
 * @example <PersonCard person={pessoa} />
 */
export function PersonCard({ person }: { person: NotablePerson }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { name, description, years, article } = usePersonTexts(person);
  const centred = useCentredOnPhone();
  const textStyle = centred && centring.text;
  const open = article ? () => void WebBrowser.openBrowserAsync(wikipediaUrl(article)) : undefined;
  return (
    <Tappable
      testID={`person-${person.wikidataId}`}
      onPress={open}
      disabled={!open}
      accessibilityRole={open ? 'link' : undefined}
      accessibilityLabel={[name, years, description].filter(Boolean).join(', ')}
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        centred && styles.centredCard,
      ]}>
      <View style={styles.portrait}>
        <Avatar name={name} uri={person.imageUrl} size={88} />
        <PhotoCredit p={person} />
      </View>
      <View style={[styles.texts, centred && styles.centredTexts]}>
        <Text variant="subtitle" numberOfLines={2} style={textStyle}>
          {name}
        </Text>
        {years ? (
          <Text variant="caption" style={textStyle}>
            {years}
          </Text>
        ) : null}
        {description ? (
          <Text variant="helper" secondary numberOfLines={3} style={textStyle}>
            {description}
          </Text>
        ) : null}
      </View>
      <Badge
        label={t(connectionKey(person))}
        testID="person-connection"
        style={centred && centring.self}
      />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: PERSON_CARD_WIDTH,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  // The portrait and its credit sit centred above the texts (left-aligned on tablets).
  portrait: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  credit: { textAlign: 'center' },
  texts: { gap: spacing.xxs, flex: 1 },
  // Phones (D-076): every element of the card on the centre line.
  centredCard: { alignItems: 'center' },
  centredTexts: { alignSelf: 'stretch' },
});

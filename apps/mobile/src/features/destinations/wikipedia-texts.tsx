// An article's introduction and History excerpt with the CC BY-SA attribution and a link to the
// full article (D-070): the city page "About" and the attraction page share it.
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Text } from '@/components/text';
import type { WikipediaTexts } from '@/lib/wikipedia';
import { spacing } from '@/theme/colors';

/**
 * Nothing when there is no text; the link only when the article is known.
 * @example <WikipediaTextBlock texts={wikipediaTextsFor(place, lang)} />
 */
export function WikipediaTextBlock({ texts }: { texts: WikipediaTexts }) {
  const { t } = useTranslation();
  const centred = useCentredOnPhone();
  if (!texts.summary && !texts.history) return null;
  return (
    <View style={styles.block}>
      {texts.summary ? <Paragraphs text={texts.summary} /> : null}
      {texts.history ? (
        <View style={styles.history}>
          <Text variant="subtitle" accessibilityRole="header" style={centred && centring.text}>
            {t('wikipedia.history')}
          </Text>
          <Paragraphs text={texts.history} />
        </View>
      ) : null}
      <WikipediaSource url={texts.sourceUrl} />
    </View>
  );
}

/** The pipeline keeps one paragraph per line; spaced apart they read as paragraphs. */
function Paragraphs({ text }: { text: string }) {
  return (
    <View style={styles.paragraphs}>
      {text.split('\n').map((paragraph, i) => (
        <Text key={i} style={styles.body}>
          {paragraph}
        </Text>
      ))}
    </View>
  );
}

function WikipediaSource({ url }: { url: string | null }) {
  const { t } = useTranslation();
  const centred = useCentredOnPhone();
  return (
    <View testID="wikipedia-source" style={[styles.source, centred && centring.row]}>
      <Text variant="helper" secondary style={centred && centring.text}>
        {t('wikipedia.source')}
      </Text>
      {url ? (
        <Button
          compact
          variant="ghost"
          icon="external"
          label={t('wikipedia.readFull')}
          accessibilityRole="link"
          onPress={() => void WebBrowser.openBrowserAsync(url)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  history: { gap: spacing.sm },
  paragraphs: { gap: spacing.md - 4 },
  body: { fontSize: 17, lineHeight: 27 },
  source: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});

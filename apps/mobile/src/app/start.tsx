import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageHeader, Screen } from '@/components/screen';
import { useStartChoice } from '@/features/start/choice-store';
import { StartOption } from '@/features/start/start-option';
import { ExpoLocationSource } from '@/features/suggested/location';
import { usePlaceStore } from '@/features/suggested/place-store';
import { spacing } from '@/theme/colors';

/**
 * The first question (D-079): explore the traveller's own city (their location, then the routes
 * that start near them) or a city elsewhere in the world. Asked once; the side bar keeps both.
 */
export default function StartScreen() {
  const { t } = useTranslation();
  const choose = useStartChoice((state) => state.choose);

  const exploreMyCity = () => {
    choose('home');
    // Not awaited: the routes tab shows "locating" while the position is read.
    void usePlaceStore.getState().locate(new ExpoLocationSource(), true);
    router.replace('/suggested');
  };
  const exploreTheWorld = () => {
    choose('world');
    router.replace('/');
  };

  return (
    <Screen centered>
      <PageHeader title={t('start.title')} subtitle={t('start.subtitle')} />
      <View style={styles.options}>
        <StartOption
          icon="pin"
          title={t('start.home')}
          body={t('start.homeText')}
          onPress={exploreMyCity}
          testID="start-home"
        />
        <StartOption
          icon="globe"
          title={t('start.world')}
          body={t('start.worldText')}
          onPress={exploreTheWorld}
          testID="start-world"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ options: { gap: spacing.md } });

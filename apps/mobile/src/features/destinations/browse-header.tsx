import { router } from 'expo-router';
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BrandMark } from '@/components/app-menu';
import { Tappable } from '@/components/tappable';
import { spacing } from '@/theme/colors';
import { useBreakpoint, useShadows, useTheme } from '@/theme/use-theme';

/**
 * Logo and action slots of the single-row header. Both get the same width so the search group
 * sits on the page's centre line; wide enough for "Before you go" / "Antes de partir".
 */
const SIDE_MIN_WIDTH = 168;
const LEAD_WIDTH = 220;
/** The search group (optional lead + search) stays compact and centred (D-024). */
const SEARCH_GROUP_MAX_WIDTH = 640;
/** Below these the search placeholder ("Pesquisar locais em …") would be cut off. */
const SEARCH_GROUP_MIN_WIDTH = { withLead: 580, searchOnly: 340 } as const;

/**
 * Content width from which logo, search group and action share one row.
 * @example inlineHeaderMinWidth(true) // 948 (city page: city pill + search)
 */
export function inlineHeaderMinWidth(hasLead: boolean): number {
  const group = SEARCH_GROUP_MIN_WIDTH[hasLead ? 'withLead' : 'searchOnly'];
  return 2 * SIDE_MIN_WIDTH + 2 * spacing.md + group;
}

type Props = PropsWithChildren<{
  /** The search field (owns its query and any dropdown). */
  search: ReactNode;
  /** Shown before the search (the city pill on a city page). */
  lead?: ReactNode;
  /** Right-hand action (e.g. "Before you go"). */
  action?: ReactNode;
  /** Page container (max width + gutter) shared with the grid below. */
  container: ViewStyle;
  gutter: number;
}>;

type Slots = { lead?: ReactNode; search: ReactNode; action?: ReactNode };

/**
 * Header of the browse pages (Home and city): [logo] [lead + search] [action], then `children`
 * (the category tabs on a city page). When the content is wide enough the first three share one
 * row; narrower screens put the search group on a second row; phones keep the lead (or the
 * search) next to the logo mark. The logo leads back to the Home.
 * @example <BrowseHeader search={<SearchField … />} container={inner} gutter={gutter} />
 */
export function BrowseHeader({ children, ...props }: Props) {
  const theme = useTheme();
  const shadows = useShadows();
  const [contentWidth, setContentWidth] = useState(0);
  const inline = contentWidth >= inlineHeaderMinWidth(props.lead != null);
  return (
    <View
      style={[
        styles.header,
        // Category tabs sit on the bottom border; without them the rows need their own margin.
        children == null && styles.headerAlone,
        { backgroundColor: theme.surface, borderColor: theme.border, boxShadow: shadows.card },
      ]}>
      <View
        style={[styles.container, props.container]}
        testID="browse-header-container"
        onLayout={(e) => setContentWidth(e.nativeEvent.layout.width - 2 * props.gutter)}>
        <HeaderRows {...props} inline={inline} />
      </View>
      {children}
    </View>
  );
}

function HeaderRows({ inline, ...slots }: Slots & { inline: boolean }) {
  const { isTablet } = useBreakpoint();
  if (!isTablet) return <PhoneRows {...slots} />;
  return inline ? <InlineRow {...slots} /> : <StackedRows {...slots} />;
}

/** The logo; pressing it goes back to the Home (the list of destinations). */
function HomeLink({ withName }: { withName?: boolean }) {
  const { t } = useTranslation();
  return (
    <Tappable
      accessibilityRole="link"
      accessibilityLabel={t('home.goHome')}
      onPress={() => router.navigate('/')}
      pressScale={0.96}
      testID="home-link">
      <BrandMark withName={withName} />
    </Tappable>
  );
}

function InlineRow({ lead, search, action }: Slots) {
  return (
    <View style={styles.row} testID="browse-header-inline">
      <View style={styles.side}>
        <HomeLink withName />
      </View>
      <SearchGroup lead={lead} search={search} />
      <View style={[styles.side, styles.end]}>{action}</View>
    </View>
  );
}

function StackedRows({ lead, search, action }: Slots) {
  return (
    <>
      <View style={[styles.row, styles.spread]} testID="browse-header-stacked">
        <HomeLink withName />
        {action}
      </View>
      <SearchGroup lead={lead} search={search} />
    </>
  );
}

function PhoneRows({ lead, search, action }: Slots) {
  if (lead == null)
    return (
      <View style={[styles.row, styles.searchRow]}>
        <HomeLink />
        <View style={styles.searchFill}>{search}</View>
        {action}
      </View>
    );
  return (
    <>
      <View style={styles.row}>
        <HomeLink />
        <View style={styles.leadFill}>{lead}</View>
        {action}
      </View>
      <View style={styles.searchRow}>{search}</View>
    </>
  );
}

/** Optional lead (city pill) and the search side by side, centred in the header. */
function SearchGroup({ lead, search }: Slots) {
  return (
    <View style={[styles.row, styles.group]}>
      {lead != null ? <View style={styles.lead}>{lead}</View> : null}
      <View style={styles.searchFill}>{search}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  headerAlone: { paddingBottom: spacing.md },
  // Above the content below (category tabs) so a search dropdown opens over it.
  container: { width: '100%', alignSelf: 'center', gap: spacing.md, zIndex: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  spread: { justifyContent: 'space-between' },
  // Equal-width sides keep the search group centred on the page, not between logo and action.
  side: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
    minWidth: SIDE_MIN_WIDTH,
    flexDirection: 'row',
  },
  end: { justifyContent: 'flex-end' },
  // In the single row, maxWidth caps the basis and the sides share what is left.
  group: {
    flexShrink: 1,
    maxWidth: SEARCH_GROUP_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.sm,
  },
  lead: { width: LEAD_WIDTH, flexDirection: 'row' },
  searchRow: { zIndex: 10 },
  // The lead (city pill) grows along a row; the search field stretches across a column.
  leadFill: { flex: 1, flexDirection: 'row' },
  searchFill: { flex: 1 },
});

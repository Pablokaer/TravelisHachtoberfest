// The app's icon set (D-059): SF Symbols on iOS, Material Symbols on Android and web. Shared by
// the native Icon (expo-symbols) and the web one (the app's own cut of the Material Symbols font).
import type { SymbolViewProps } from 'expo-symbols';

/** Font family of the web icon font: Material Symbols cut down to the icons below. */
export const WEB_ICON_FONT = 'MaterialSymbolsApp';

type SymbolName = Exclude<SymbolViewProps['name'], string>;

/** Each icon's name per platform; `web` is a Material Symbols name. */
export const ICONS = {
  add: { ios: 'plus', android: 'add', web: 'add' },
  arrowDown: { ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' },
  arrowForward: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  arrowUp: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  bookmark: { ios: 'bookmark', android: 'bookmark_add', web: 'bookmark_add' },
  bookmarked: { ios: 'bookmark.fill', android: 'bookmark_added', web: 'bookmark_added' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  checklist: { ios: 'checklist', android: 'checklist', web: 'checklist' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  directions: {
    ios: 'arrow.triangle.turn.up.right.diamond',
    android: 'directions',
    web: 'directions',
  },
  dragHandle: { ios: 'line.3.horizontal', android: 'drag_indicator', web: 'drag_indicator' },
  error: { ios: 'exclamationmark.circle', android: 'error', web: 'error' },
  external: { ios: 'arrow.up.right.square', android: 'open_in_new', web: 'open_in_new' },
  flag: { ios: 'flag', android: 'flag', web: 'flag' },
  flight: { ios: 'airplane', android: 'flight', web: 'flight' },
  globe: { ios: 'globe', android: 'language', web: 'language' },
  grid: { ios: 'square.grid.2x2', android: 'apps', web: 'apps' },
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' },
  home: { ios: 'house', android: 'home', web: 'home' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  key: { ios: 'key', android: 'key', web: 'key' },
  list: { ios: 'list.bullet', android: 'list', web: 'list' },
  lock: { ios: 'lock', android: 'lock', web: 'lock' },
  logout: {
    ios: 'rectangle.portrait.and.arrow.right',
    android: 'logout',
    web: 'logout',
  },
  merge: { ios: 'arrow.triangle.merge', android: 'merge', web: 'merge' },
  luggage: { ios: 'suitcase', android: 'luggage', web: 'luggage' },
  mail: { ios: 'envelope', android: 'mail', web: 'mail' },
  map: { ios: 'map', android: 'map', web: 'map' },
  menu: { ios: 'line.3.horizontal', android: 'menu', web: 'menu' },
  passport: { ios: 'person.text.rectangle', android: 'badge', web: 'badge' },
  person: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  photo: { ios: 'photo', android: 'image', web: 'image' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  route: {
    ios: 'point.topleft.down.to.point.bottomright.curvepath',
    android: 'route',
    web: 'route',
  },
  ruler: { ios: 'ruler', android: 'straighten', web: 'straighten' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  split: { ios: 'scissors', android: 'content_cut', web: 'content_cut' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  ticket: { ios: 'ticket', android: 'confirmation_number', web: 'confirmation_number' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  verified: { ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' },
  walk: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  // Attraction categories
  museum: { ios: 'building.columns', android: 'museum', web: 'museum' },
  monument: { ios: 'flag.2.crossed', android: 'flag', web: 'flag' },
  church: { ios: 'bell', android: 'church', web: 'church' },
  castle: { ios: 'shield', android: 'castle', web: 'castle' },
  viewpoint: { ios: 'binoculars', android: 'landscape', web: 'landscape' },
  landmark: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  park: { ios: 'leaf', android: 'park', web: 'park' },
  nature: { ios: 'mountain.2', android: 'forest', web: 'forest' },
  palace: { ios: 'crown', android: 'fort', web: 'fort' },
  other: { ios: 'ellipsis.circle', android: 'more_horiz', web: 'more_horiz' },
} satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;

export function categoryIcon(category: string): IconName {
  return category in ICONS ? (category as IconName) : 'other';
}

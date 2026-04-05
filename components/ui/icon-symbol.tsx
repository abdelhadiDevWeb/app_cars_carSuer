// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'house': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'car.fill': 'directions-car',
  'car': 'directions-car',
  'car.side.fill': 'directions-car',
  'magnifyingglass': 'search',
  'magnifyingglass.circle.fill': 'search',
  'magnifyingglass.circle': 'search',
  'message.fill': 'message',
  'message': 'message',
  'person.fill': 'person',
  'person': 'person',
  'person.circle.fill': 'account-circle',
  'person.badge.plus.fill': 'person-add',
  'sparkles': 'auto-awesome',
  'checkmark.circle.fill': 'check-circle',
  'checkmark.seal.fill': 'verified',
  'shield.fill': 'security',
  'shield': 'security',
  'arrow.right': 'arrow-forward',
  'qrcode.viewfinder': 'qr-code-scanner',
  'questionmark.circle': 'help-outline',
  'questionmark.circle.fill': 'help',
  'chevron.up': 'keyboard-arrow-up',
  'chevron.down': 'keyboard-arrow-down',
  'info.circle.fill': 'info',
  'arrow.right.square.fill': 'logout',
  'bell.fill': 'notifications',
  'bell.slash.fill': 'notifications-off',
  'xmark.circle.fill': 'cancel',
  'xmark': 'close',
  'plus': 'add',
  'plus.circle.fill': 'add-circle',
  'tag.fill': 'local-offer',
  'speedometer': 'speed',
  'calendar': 'event',
  'calendar.fill': 'event',
  'paintbrush.fill': 'format-color-fill',
  'gearshape.fill': 'settings',
  'doc.text.fill': 'description',
  'doc.fill': 'description',
  'photo': 'image',
  'exclamationmark.triangle.fill': 'warning',
  'phone.fill': 'phone',
  'envelope.fill': 'email',
  'camera.fill': 'camera-alt',
  'star.fill': 'star',
  'pencil': 'edit',
  'lock.fill': 'lock',
  'slider.horizontal.3': 'tune',
  'clock.fill': 'schedule',
  'mappin.fill': 'location-on',
  'mappin': 'location-on',
  'wrench.fill': 'build',
  'wrench': 'build',
  'fuel': 'local-gas-station',
  'photo.fill': 'image',
  'star': 'star-border',
  'arrow.up.right': 'open-in-new',
  // Language / globe
  'globe': 'public',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const iconName = MAPPING[name];
  if (!iconName) {
    console.warn(`Icon "${name}" not found in mapping, using "help" as fallback`);
    return <MaterialIcons color={color} size={size} name="help" style={style} />;
  }
  return <MaterialIcons color={color} size={size} name={iconName} style={style} />;
}

import { Image, ImageStyle, StyleProp, View, ViewStyle } from 'react-native';

import { APP_LOGO } from '@/constants/branding';
import { getAppLogoSize, scale, type AppLogoVariant } from '@/utils/responsive';

type AppLogoProps = {
  /** Preset sizing for common screens (overrides raw `size` when set). */
  variant?: AppLogoVariant;
  size?: number;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

/** CarSure logo — centered, responsive across all screen sizes. */
export function AppLogo({
  variant,
  size,
  style,
  containerStyle,
}: AppLogoProps) {
  const resolvedSize =
    size ?? (variant ? getAppLogoSize(variant) : scale(88));

  return (
    <View
      style={[
        {
          width: resolvedSize,
          height: resolvedSize,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
        },
        containerStyle,
      ]}
    >
      <Image
        source={APP_LOGO}
        style={[{ width: resolvedSize, height: resolvedSize }, style]}
        resizeMode="contain"
        accessibilityLabel="CarSure"
      />
    </View>
  );
}

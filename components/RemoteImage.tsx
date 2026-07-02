import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { scale } from '@/utils/responsive';

type RemoteImageProps = Omit<ImageProps, 'source'> & {
  uri: string | null | undefined;
  /** Original full-size URL if the optimized `uri` fails (e.g. media API not deployed). */
  fallbackUri?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  showLoading?: boolean;
  priority?: 'low' | 'normal' | 'high';
};

export function RemoteImage({
  uri,
  fallbackUri,
  style,
  containerStyle,
  showLoading = true,
  priority = 'normal',
  contentFit = 'cover',
  transition = 150,
  ...rest
}: RemoteImageProps) {
  const [activeUri, setActiveUri] = useState(uri);
  const [loading, setLoading] = useState(Boolean(uri));
  const [failed, setFailed] = useState(false);
  const triedFallbackRef = useRef(false);

  useEffect(() => {
    setActiveUri(uri);
    setLoading(Boolean(uri));
    setFailed(false);
    triedFallbackRef.current = false;
  }, [uri]);

  if (!activeUri) {
    return (
      <View style={[styles.fallback, style, containerStyle]}>
        <IconSymbol name="photo" size={scale(28)} color="#94a3b8" />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style, containerStyle]}>
      <Image
        {...rest}
        source={{ uri: activeUri }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        transition={transition}
        cachePolicy="memory-disk"
        priority={priority}
        recyclingKey={activeUri}
        onLoadStart={() => {
          setLoading(true);
          setFailed(false);
        }}
        onLoad={() => setLoading(false)}
        onDisplay={() => setLoading(false)}
        onError={() => {
          if (fallbackUri && activeUri !== fallbackUri && !triedFallbackRef.current) {
            triedFallbackRef.current = true;
            setActiveUri(fallbackUri);
            setLoading(true);
            setFailed(false);
            return;
          }
          setLoading(false);
          setFailed(true);
        }}
      />
      {showLoading && loading && !failed ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="small" color="#0d9488" />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.overlay}>
          <IconSymbol name="photo" size={scale(24)} color="#94a3b8" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  fallback: {
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.72)',
  },
});

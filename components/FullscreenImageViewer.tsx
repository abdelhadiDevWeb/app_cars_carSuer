import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { scale } from '@/utils/responsive';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type FullscreenImageViewerState = {
  visible: boolean;
  uris: string[];
  initialIndex: number;
};

export function useFullscreenImageViewer() {
  const [viewer, setViewer] = useState<FullscreenImageViewerState>({
    visible: false,
    uris: [],
    initialIndex: 0,
  });

  const openViewer = useCallback((uris: string[], initialIndex = 0) => {
    const list = uris.filter((u) => typeof u === 'string' && u.trim() !== '');
    if (list.length === 0) return;
    const index = Math.max(0, Math.min(initialIndex, list.length - 1));
    setViewer({ visible: true, uris: list, initialIndex: index });
  }, []);

  const closeViewer = useCallback(() => {
    setViewer((prev) => ({ ...prev, visible: false }));
  }, []);

  return { viewer, openViewer, closeViewer };
}

type FullscreenImageViewerProps = {
  visible: boolean;
  uris: string[];
  initialIndex?: number;
  onClose: () => void;
};

export function FullscreenImageViewer({
  visible,
  uris,
  initialIndex = 0,
  onClose,
}: FullscreenImageViewerProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<string>>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (!visible) return;
    const index = Math.max(0, Math.min(initialIndex, Math.max(uris.length - 1, 0)));
    setCurrentIndex(index);
    if (uris.length > 1) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index, animated: false });
      });
    }
  }, [visible, initialIndex, uris]);

  if (!visible || uris.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={uris}
          keyExtractor={(uri, index) => `${uri}-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          initialScrollIndex={uris.length > 1 ? Math.min(initialIndex, uris.length - 1) : undefined}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setCurrentIndex(index);
          }}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 100);
          }}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <RemoteImage
                uri={item}
                style={styles.image}
                contentFit="contain"
                priority="high"
                transition={120}
              />
            </View>
          )}
        />

        <TouchableOpacity
          onPress={onClose}
          style={[styles.closeButton, { top: insets.top + scale(8) }]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <IconSymbol name="xmark" size={scale(22)} color="#ffffff" />
        </TouchableOpacity>

        {uris.length > 1 && (
          <View style={[styles.counter, { bottom: insets.bottom + scale(16) }]}>
            <ThemedText style={styles.counterText}>
              {currentIndex + 1} / {uris.length}
            </ThemedText>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  closeButton: {
    position: 'absolute',
    right: scale(16),
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: scale(6),
    borderRadius: scale(16),
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  counterText: {
    color: '#ffffff',
    fontSize: scale(14),
    fontWeight: '700',
  },
});

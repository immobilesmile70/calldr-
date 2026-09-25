import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { colors, radii, fontSize } from '@/theme/tokens';
import { hapticWheelTick } from '@/lib/callSounds';

interface TimeWheelPickerProps {
  value: number; // in minutes
  onChange: (minutes: number) => void;
  options?: number[];
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const REPEAT_FACTOR = 9; // Repeats array for seamless infinite looping

// Default curated durations from 1 to 60 minutes
const DEFAULT_DURATIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
];

export function TimeWheelPicker({
  value,
  onChange,
  options = DEFAULT_DURATIONS,
}: TimeWheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const isScrollingRef = useRef(false);
  const lastIndexRef = useRef<number>(-1);
  const webContainerRef = useRef<HTMLDivElement | null>(null);

  const baseCount = options.length;
  // Multiplied items for infinite loop illusion
  const items = useMemo(() => {
    const list: { val: number; originalIndex: number }[] = [];
    for (let r = 0; r < REPEAT_FACTOR; r++) {
      options.forEach((val, idx) => {
        list.push({ val, originalIndex: idx });
      });
    }
    return list;
  }, [options]);

  const middleRepeatOffset = Math.floor(REPEAT_FACTOR / 2) * baseCount;

  // Find position for a given value
  const getIndexForValue = useCallback(
    (v: number): number => {
      const idx = options.indexOf(v);
      return idx >= 0 ? middleRepeatOffset + idx : middleRepeatOffset;
    },
    [options, middleRepeatOffset],
  );

  // Initial scroll position
  useEffect(() => {
    const targetIdx = getIndexForValue(value);
    lastIndexRef.current = targetIdx;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: targetIdx * ITEM_HEIGHT,
        animated: false,
      });
    }, 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle scroll ending
  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      const index = Math.round(offsetY / ITEM_HEIGHT);

      if (index >= 0 && index < items.length) {
        const item = items[index];
        if (item && item.val !== value) {
          onChange(item.val);
          hapticWheelTick();
        }

        // Loop normalization: if scrolled too far near either boundary, jump back to center block
        const minSafeIndex = baseCount * 2;
        const maxSafeIndex = baseCount * (REPEAT_FACTOR - 2);

        if (item && (index < minSafeIndex || index > maxSafeIndex)) {
          const normalizedTarget = middleRepeatOffset + item.originalIndex;
          scrollRef.current?.scrollTo({
            y: normalizedTarget * ITEM_HEIGHT,
            animated: false,
          });
        }
      }
      isScrollingRef.current = false;
    },
    [items, value, onChange, baseCount, middleRepeatOffset],
  );

  // Wheel step (for desktop scroll wheel)
  const stepBy = useCallback(
    (delta: number) => {
      const currentIndex = lastIndexRef.current >= 0 ? lastIndexRef.current : getIndexForValue(value);
      let targetIndex = currentIndex + delta;
      if (targetIndex < 0) targetIndex = 0;
      if (targetIndex >= items.length) targetIndex = items.length - 1;

      lastIndexRef.current = targetIndex;
      const targetItem = items[targetIndex];
      if (targetItem) {
        onChange(targetItem.val);
        hapticWheelTick();
      }

      scrollRef.current?.scrollTo({
        y: targetIndex * ITEM_HEIGHT,
        animated: true,
      });
    },
    [getIndexForValue, value, items, onChange],
  );

  // Web mouse wheel listener
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const el = webContainerRef.current;
    if (!el) return;

    let wheelTimeout: ReturnType<typeof setTimeout> | null = null;
    let accumulatedDelta = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      accumulatedDelta += e.deltaY;

      if (wheelTimeout) clearTimeout(wheelTimeout);
      wheelTimeout = setTimeout(() => {
        const steps = Math.sign(accumulatedDelta);
        if (steps !== 0) {
          stepBy(steps);
        }
        accumulatedDelta = 0;
      }, 40);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelTimeout) clearTimeout(wheelTimeout);
    };
  }, [stepBy]);

  return (
    <View
      style={styles.container}
      ref={webContainerRef as any}
      accessibilityRole="adjustable"
      accessibilityLabel={`Call duration: ${value} minutes`}
    >
      {/* Central selection lens pill */}
      <View style={styles.centerLens} pointerEvents="none">
        <View style={styles.lensHighlight} />
      </View>

      {/* Top and bottom gradient fades */}
      <View style={styles.topFade} pointerEvents="none" />
      <View style={styles.bottomFade} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        contentContainerStyle={{
          paddingVertical: ITEM_HEIGHT * 2, // 2 items padding above & below to center first/last
        }}
      >
        {items.map((item, idx) => {
          const isSelected = item.val === value;
          return (
            <TouchableOpacity
              key={`${idx}_${item.val}`}
              style={styles.item}
              onPress={() => {
                lastIndexRef.current = idx;
                onChange(item.val);
                hapticWheelTick();
                scrollRef.current?.scrollTo({
                  y: idx * ITEM_HEIGHT,
                  animated: true,
                });
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.itemText,
                  isSelected && styles.itemTextSelected,
                ]}
              >
                {item.val} min
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: CONTAINER_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 8,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  centerLens: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 12,
    right: 12,
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    zIndex: 1,
  },
  lensHighlight: {
    width: '100%',
    height: '100%',
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: fontSize.md,
    color: colors.muted,
    fontWeight: '500',
    letterSpacing: -0.2,
    opacity: 0.55,
  },
  itemTextSelected: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    opacity: 1,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 1.5,
    backgroundColor: colors.surface,
    opacity: 0.85,
    zIndex: 2,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 1.5,
    backgroundColor: colors.surface,
    opacity: 0.85,
    zIndex: 2,
  },
});

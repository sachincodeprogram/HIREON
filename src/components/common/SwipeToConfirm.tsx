import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, ActivityIndicator, LayoutChangeEvent } from 'react-native';
import { COLORS } from '../../constants/api';
import { RADIUS } from '../../constants/theme';

const THUMB_SIZE = 52;
const TRACK_PADDING = 4;
// Kitna doori tak swipe karne par confirm maana jaaye (track ka % — poore
// end tak ghaseetna zaroori nahi, accidental confirm se bachne ke liye kam nahi).
const CONFIRM_THRESHOLD = 0.78;

interface Props {
  label: string;
  confirmingLabel?: string;
  icon?: string;
  color?: string;
  disabled?: boolean;
  /** Async — throw/reject se thumb wapas 0 par spring ho jaata hai (retry ke liye). */
  onConfirm: () => Promise<void> | void;
}

// Native gesture library ke bina (koi naya native dependency nahi) — pure
// PanResponder + Animated se banaya gaya "slide to confirm" button. COD
// delivery me cash-received confirm karne ke liye — accidental tap se
// commission cut na ho, isliye deliberate swipe gesture chahiye.
const SwipeToConfirm: React.FC<Props> = ({
  label, confirmingLabel = 'Confirming…', icon = '💵', color = COLORS.success, disabled, onConfirm,
}) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const dragX = useRef(0);

  const maxDrag = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);

  // PanResponder sirf EK baar banta hai (useRef) — uske callbacks pehli render ka
  // closure pakad lete. Pehli render par trackWidth = 0 (onLayout baad me aata
  // hai) → maxDrag = 0 → thumb hilta hi nahi tha aur confirm kabhi nahi hota tha.
  // Isliye har badalti value ref me rakho, callbacks hamesha latest padhenge.
  const maxDragRef = useRef(maxDrag);
  maxDragRef.current = maxDrag;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const blockedRef = useRef(false);
  blockedRef.current = !!disabled || confirming || done;
  const busyRef = useRef(false); // double-release se double confirm na ho

  const springTo = (toValue: number) => {
    dragX.current = toValue;
    Animated.spring(translateX, { toValue, useNativeDriver: false, bounciness: 4 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !blockedRef.current,
      onStartShouldSetPanResponderCapture: () => !blockedRef.current,
      onMoveShouldSetPanResponder: () => !blockedRef.current,
      onMoveShouldSetPanResponderCapture: () => !blockedRef.current,
      // Parent ScrollView gesture beech me na chheene — warna swipe adhoora reh jaata.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(Math.max(gesture.dx, 0), maxDragRef.current);
        dragX.current = next;
        translateX.setValue(next);
      },
      onPanResponderRelease: async () => {
        const max = maxDragRef.current;
        if (max <= 0 || busyRef.current) { springTo(0); return; }
        const progress = dragX.current / max;
        if (progress >= CONFIRM_THRESHOLD) {
          busyRef.current = true;
          springTo(max);
          setConfirming(true);
          try {
            await onConfirmRef.current();
            setDone(true);
          } catch {
            // OTP/verify fail ho gaya — thumb wapas bhejo, dobara try kar sake.
            setConfirming(false);
            springTo(0);
          } finally {
            busyRef.current = false;
          }
        } else {
          springTo(0);
        }
      },
      // Kisi aur ne gesture le liya (system/OS) — thumb wapas.
      onPanResponderTerminate: () => {
        if (!busyRef.current) springTo(0);
      },
    }),
  ).current;

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  const labelOpacity = translateX.interpolate({
    inputRange: [0, Math.max(maxDrag * 0.6, 1)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const fillWidth = Animated.add(translateX, new Animated.Value(THUMB_SIZE + TRACK_PADDING));

  return (
    <View
      style={[styles.track, { borderColor: color + '55', backgroundColor: color + '14' }, (disabled || done) && styles.trackDisabled]}
      onLayout={onTrackLayout}>
      <Animated.View style={[styles.fill, { width: fillWidth, backgroundColor: color + '26' }]} />
      <Animated.Text style={[styles.label, { color, opacity: labelOpacity }]} numberOfLines={1}>
        {confirming ? confirmingLabel : done ? 'Confirmed ✓' : label}
      </Animated.Text>
      <Animated.View
        {...(disabled || done ? {} : panResponder.panHandlers)}
        style={[
          styles.thumb,
          { backgroundColor: color, transform: [{ translateX }] },
        ]}>
        {confirming
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.thumbIcon}>{done ? '✓' : icon}</Text>}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: THUMB_SIZE + TRACK_PADDING * 2,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  trackDisabled: { opacity: 0.6 },
  fill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    borderRadius: RADIUS.pill,
  },
  label: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  thumb: {
    position: 'absolute', left: TRACK_PADDING, top: TRACK_PADDING,
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  thumbIcon: { fontSize: 22 },
});

export default SwipeToConfirm;

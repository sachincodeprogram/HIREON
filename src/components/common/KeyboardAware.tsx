import React, {
  createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import {
  Keyboard, KeyboardEvent, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, ScrollViewProps,
  StyleProp, StyleSheet, TextInput, View, ViewStyle,
} from 'react-native';

// ── Keyboard ke peeche input kabhi na chhupe ─────────────────────────────────
// App targetSdk 36 par hai — Android 15+ par edge-to-edge zabardasti lagta hai, to
// AndroidManifest ka `adjustResize` window ko chhota NAHI karta aur keyboard seedha
// OTP/naam/address box ke upar aa jaata hai. Purane phones par adjustResize chalta hai.
// Ye helpers dono haalat me sahi kaam karte hain: keyboard ki asli position (screenY)
// se naapte hain ki kitna hissa dhaka hai — window resize ho chuki ho to overlap 0.
//
//  • KeyboardAwareScrollView — form/screen jo scroll hoti hai. Keyboard khulte hi
//    (aur doosre box par jaate hi) focused box + uske neeche ka button upar le aata hai.
//  • KeyboardSafeView — fixed layout (map + neeche card, chat composer). Jitna dhaka
//    utna neeche se padding deta hai, taaki neeche wala hissa keyboard ke upar aa jaaye.
//  • useKeyboard — keyboard khula hai ya nahi + height (jaise map chhota karne ke liye).

interface KeyboardState { visible: boolean; height: number; top: number }

const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
const HIDDEN: KeyboardState = { visible: false, height: 0, top: Number.MAX_SAFE_INTEGER };

export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>(HIDDEN);
  useEffect(() => {
    const show = Keyboard.addListener(SHOW, (e: KeyboardEvent) => {
      setState({ visible: true, height: e.endCoordinates.height, top: e.endCoordinates.screenY });
    });
    const hide = Keyboard.addListener(HIDE, () => setState(HIDDEN));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return state;
}

// Jo box abhi focused hai uski window position (null = koi focused nahi)
const measureFocused = (): Promise<{ y: number; height: number } | null> =>
  new Promise(resolve => {
    const input = TextInput.State.currentlyFocusedInput() as unknown as
      { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
    if (!input?.measureInWindow) { resolve(null); return; }
    input.measureInWindow((_x, y, _w, height) => resolve({ y, height }));
  });

interface KeyboardAwareCtx {
  /** Focused box ko keyboard ke upar dikhao. `below` = box ke neeche aur kitna dikhe (jaise Verify button). */
  revealFocused: (below?: number) => void;
}
const Ctx = createContext<KeyboardAwareCtx | null>(null);

/** Input/OTP components onFocus par isse bulaate hain — scroll view na ho to kuch nahi karta. */
export const useKeyboardAware = () => useContext(Ctx);

type AwareProps = ScrollViewProps & {
  /** Focused box ke neeche kitni jagah hamesha dikhe (default 24). OTP ke saath button dikhana ho to bada rakho. */
  extraOffset?: number;
};

export const KeyboardAwareScrollView = forwardRef<ScrollView, AwareProps>(
  ({ extraOffset = 24, contentContainerStyle, onScroll, onTouchEnd, children, ...rest }, ref) => {
    const scrollRef = useRef<ScrollView>(null);
    useImperativeHandle(ref, () => scrollRef.current as ScrollView);
    const kb = useKeyboard();
    const kbRef = useRef(kb);
    kbRef.current = kb;
    const offsetY = useRef(0);
    const belowRef = useRef(extraOffset);

    const revealFocused = useCallback((below?: number) => {
      if (below !== undefined) belowRef.current = below;
      // Padding render hone + keyboard animation ke baad naapo
      setTimeout(async () => {
        const k = kbRef.current;
        if (!k.visible) return;
        const box = await measureFocused();
        if (!box) return;
        const need = belowRef.current;
        const overlap = box.y + box.height + need - k.top;
        if (overlap > 0) {
          scrollRef.current?.scrollTo({ y: offsetY.current + overlap, animated: true });
        } else if (box.y < 0) {
          // Box upar screen se bahar chala gaya ho (bahut lamba scroll) — wapas lao
          scrollRef.current?.scrollTo({ y: Math.max(offsetY.current + box.y - 16, 0), animated: true });
        }
      }, Platform.OS === 'ios' ? 50 : 80);
    }, []);

    // Keyboard ScrollView ka kitna hissa dhakta hai — utni extra scroll jagah chahiye.
    // Window resize ho chuki ho (purane Android / iOS ke bina) to overlap ~0 aata hai.
    const [overlap, setOverlap] = useState(0);
    useEffect(() => {
      if (!kb.visible) { setOverlap(0); belowRef.current = extraOffset; return; }
      const node = scrollRef.current as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
      if (!node?.measureInWindow) { setOverlap(kb.height); return; }
      node.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(0, Math.round(y + h - kb.top))));
    }, [kb.visible, kb.top, kb.height, extraOffset]);

    // Padding lagne ke baad focused box dikhao (pehla focus)
    useEffect(() => {
      if (kb.visible) revealFocused();
    }, [kb.visible, overlap, revealFocused]);

    // Keyboard khula ho aur user doosre (plain TextInput) box par tap kare — use bhi dikhao
    const handleTouchEnd = useCallback((e: Parameters<NonNullable<ScrollViewProps['onTouchEnd']>>[0]) => {
      if (kbRef.current.visible) revealFocused();
      onTouchEnd?.(e);
    }, [onTouchEnd, revealFocused]);

    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetY.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    }, [onScroll]);

    // Keyboard jitna, utni extra scroll jagah — tabhi neeche wale box upar aa paate hain
    const basePad = (StyleSheet.flatten(contentContainerStyle)?.paddingBottom as number | undefined) ?? 0;
    const ctx = useMemo(() => ({ revealFocused }), [revealFocused]);

    return (
      <Ctx.Provider value={ctx}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          scrollEventThrottle={16}
          {...rest}
          onScroll={handleScroll}
          onTouchEnd={handleTouchEnd}
          contentContainerStyle={[contentContainerStyle, overlap > 0 && { paddingBottom: basePad + overlap }]}>
          {children}
        </ScrollView>
      </Ctx.Provider>
    );
  },
);
KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';

/** Fixed layout ke liye: neeche ka hissa (button/card/composer) keyboard ke upar uthata hai. */
export const KeyboardSafeView = ({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) => {
  const viewRef = useRef<View>(null);
  const kb = useKeyboard();
  const [pad, setPad] = useState(0);

  useEffect(() => {
    if (!kb.visible) { setPad(0); return; }
    // Apni asli window position naapo — window resize ho chuki ho to overlap 0 aata hai
    viewRef.current?.measureInWindow((_x, y, _w, h) => setPad(Math.max(0, Math.round(y + h - kb.top))));
  }, [kb.visible, kb.top]);

  return (
    <View ref={viewRef} style={[style, pad > 0 && { paddingBottom: pad }]}>
      {children}
    </View>
  );
};

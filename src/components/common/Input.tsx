import React, { useState, forwardRef, useRef, useImperativeHandle } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable, KeyboardTypeOptions, ViewStyle } from 'react-native';
import { COLORS } from '../../constants/api';
import { RADIUS } from '../../constants/theme';

interface Props {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  style?: ViewStyle;
  editable?: boolean;
  autoFocus?: boolean;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
}

const Input = forwardRef<TextInput, Props>(({
  label, value, onChangeText, placeholder, keyboardType, secureTextEntry,
  multiline, numberOfLines, style, editable = true, autoFocus, leftIcon,
  rightIcon, onRightIconPress,
}, ref) => {
  const [focused, setFocused] = useState(false);
  // Internal ref so the wrapper Pressable can focus the field on tap.
  const innerRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => innerRef.current as TextInput);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      {/* Pressable wrapper: tapping anywhere (icon/padding) focuses the input.
          Android release me wrapped TextInput kabhi-kabhi tap se focus nahi
          leta — programmatic focus() reliably kaam karta hai, isliye onPress
          se hi focus karte hain. */}
      <Pressable
        onPress={() => innerRef.current?.focus()}
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          !editable && styles.inputWrapDisabled,
          multiline && styles.inputWrapMulti,
        ]}>
        {leftIcon ? <Text style={styles.leftIcon}>{leftIcon}</Text> : null}
        <TextInput
          ref={innerRef}
          style={[styles.input, multiline && styles.multiline, !editable && styles.disabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textLight}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          numberOfLines={numberOfLines}
          editable={editable}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {rightIcon && onRightIconPress ? (
          <Pressable
            onPress={onRightIconPress}
            hitSlop={10}
            style={({ pressed }) => [styles.rightBtn, pressed && styles.rightBtnPressed]}>
            <Text style={styles.rightIcon}>{rightIcon}</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
});

Input.displayName = 'Input';

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  inputWrapDisabled: {
    backgroundColor: COLORS.surface2,
    borderColor: COLORS.border,
  },
  inputWrapMulti: {
    alignItems: 'flex-start',
    paddingTop: 4,
  },
  leftIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  rightBtn: {
    marginLeft: 8,
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primaryBg,
  },
  rightBtnPressed: { opacity: 0.6 },
  rightIcon: { fontSize: 17 },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.text,
  },
  multiline: {
    height: 84,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  disabled: {
    color: COLORS.textMuted,
  },
});

export default Input;

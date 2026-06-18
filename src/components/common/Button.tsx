import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle, View } from 'react-native';
import { COLORS } from '../../constants/api';
import { RADIUS, glow } from '../../constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'danger' | 'success' | 'ghost';
  size?: 'md' | 'lg';
  style?: ViewStyle;
  icon?: string;
}

const Button: React.FC<Props> = ({
  title, onPress, loading, disabled, variant = 'primary', size = 'md', style, icon,
}) => {
  const isDisabled = loading || disabled;

  const getTextColor = () => {
    if (variant === 'outline') return COLORS.primary;
    if (variant === 'ghost')   return COLORS.text;
    return '#FFFFFF';
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.lg,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}>
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.inner}>
          {icon ? <Text style={[styles.icon, { color: getTextColor() }]}>{icon}</Text> : null}
          <Text
            style={[styles.label, size === 'lg' && styles.labelLg, { color: getTextColor() }]}
            numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  lg: {
    paddingVertical: 17,
    minHeight: 58,
    borderRadius: RADIUS.xl,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primary: {
    backgroundColor: COLORS.primary,
    ...glow(COLORS.primary, 0.32),
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  danger: {
    backgroundColor: COLORS.error,
    ...glow(COLORS.error, 0.26),
  },
  success: {
    backgroundColor: COLORS.success,
    ...glow(COLORS.success, 0.26),
  },
  ghost: {
    backgroundColor: COLORS.surface2,
  },
  disabled: { opacity: 0.45 },
  // subtle press feedback — dip + shrink
  pressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  label: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  labelLg: {
    fontSize: 16.5,
  },
  icon: {
    fontSize: 16,
  },
});

export default Button;

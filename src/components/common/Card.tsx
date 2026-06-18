import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../../constants/api';
import { RADIUS, ELEVATION } from '../../constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: string;
  onPress?: () => void;
}

const Card: React.FC<Props> = ({ children, style, accent, onPress }) => {
  const content = (pressed?: boolean) => (
    <View
      style={[
        styles.card,
        accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
        pressed && styles.pressed,
        style,
      ]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress}>
        {({ pressed }) => content(pressed)}
      </Pressable>
    );
  }
  return content();
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...ELEVATION.card,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    borderColor: COLORS.borderDark,
  },
});

export default Card;

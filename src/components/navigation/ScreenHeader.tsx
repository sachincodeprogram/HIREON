import React from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/api';

interface Props {
  title: string;
  subtitle?: string;
  canGoBack?: boolean;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  variant?: 'primary' | 'white';
}

const ScreenHeader: React.FC<Props> = ({ title, subtitle, canGoBack, onBack, rightElement, variant = 'primary' }) => {
  const insets = useSafeAreaInsets();
  const isPrimary = variant === 'primary';
  const bg  = isPrimary ? COLORS.primary : COLORS.surface;
  const fg  = isPrimary ? '#FFFFFF' : COLORS.text;
  const fgM = isPrimary ? 'rgba(255,255,255,0.7)' : COLORS.textMuted;

  return (
    <>
      <StatusBar backgroundColor={bg} barStyle={isPrimary ? 'light-content' : 'dark-content'} />
      <View style={[
        styles.container,
        isPrimary && styles.containerPrimary,
        { backgroundColor: bg, paddingTop: insets.top + 8 },
      ]}>
        <View style={styles.row}>
          {canGoBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={[styles.backArrow, { color: fg }]}>‹</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.side} />
          )}

          <View style={styles.center}>
            <Text style={[styles.title, { color: fg }]} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: fgM }]}>{subtitle}</Text> : null}
          </View>

          <View style={styles.side}>{rightElement ?? null}</View>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  containerPrimary: {
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  backArrow: {
    fontSize: 28, fontWeight: '300', lineHeight: 30,
  },
  center: {
    flex: 1,
  },
  side: {
    width: 44,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
});

export default ScreenHeader;

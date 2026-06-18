import React from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/api';

interface NavbarProps {
  showBack?: boolean;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  title?: string;
  light?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ showBack, onBack, rightElement, title, light }) => {
  const bg = light ? COLORS.surface : COLORS.primary;
  const fg = light ? COLORS.text : '#FFFFFF';

  return (
    <>
      <StatusBar backgroundColor={bg} barStyle={light ? 'dark-content' : 'light-content'} />
      <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: bg }]}>
        <View style={[styles.container, { backgroundColor: bg }]}>
          <View style={styles.side}>
            {showBack && (
              <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
                <Text style={[styles.backArrow, { color: fg }]}>‹</Text>
              </TouchableOpacity>
            )}
          </View>

          {title ? (
            <Text style={[styles.pageTitle, { color: fg }]}>{title}</Text>
          ) : (
            <View style={styles.brand}>
              <View style={[styles.iconBox, { backgroundColor: light ? COLORS.primary : '#FFFFFF' }]}>
                <Text style={[styles.iconText, { color: light ? '#FFFFFF' : COLORS.primary }]}>H</Text>
              </View>
              <Text style={[styles.brandName, { color: fg }]}>HIREON</Text>
            </View>
          )}

          <View style={styles.side}>{rightElement ?? null}</View>
        </View>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {},
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  side: {
    width: 48,
    alignItems: 'center',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -1,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  pageTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  backBtn: {
    padding: 4,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  backArrow: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
});

export default Navbar;

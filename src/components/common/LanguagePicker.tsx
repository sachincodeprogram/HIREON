import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/api';
import { ELEVATION } from '../../constants/theme';
import { LANGUAGES, LanguageCode, useTranslation } from '../../i18n';

// Har language ka script badge — "A" English, "अ" Hindi.
const BADGE: Record<LanguageCode, string> = { en: 'A', hi: 'अ' };

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  accent?: string;
}

/** Bottom sheet jisme user app ki language chunta hai. Select karte hi apply. */
export const LanguageSheet: React.FC<SheetProps> = ({ visible, onClose, accent = COLORS.primary }) => {
  const { language, setLanguage, t } = useTranslation();
  const insets = useSafeAreaInsets();

  const choose = (code: LanguageCode) => {
    if (code !== language) setLanguage(code);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('language.title')}</Text>
        <Text style={styles.subtitle}>{t('language.subtitle')}</Text>

        {LANGUAGES.map(lang => {
          const active = lang.code === language;
          return (
            <TouchableOpacity
              key={lang.code}
              activeOpacity={0.8}
              onPress={() => choose(lang.code)}
              style={[styles.option, active && { borderColor: accent, backgroundColor: accent + '0D' }]}>
              <View style={[styles.badge, { backgroundColor: active ? accent : COLORS.background }]}>
                <Text style={[styles.badgeText, { color: active ? '#fff' : COLORS.textMuted }]}>{BADGE[lang.code]}</Text>
              </View>
              <View style={styles.optionInfo}>
                <Text style={[styles.optionName, active && { color: accent }]}>{lang.nativeName}</Text>
                <Text style={styles.optionSample} numberOfLines={1}>
                  {lang.nativeName !== lang.name ? `${lang.name} · ` : ''}{lang.sample}
                </Text>
              </View>
              <View style={[styles.radio, active && { borderColor: accent }]}>
                {active && <View style={[styles.radioDot, { backgroundColor: accent }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
};

interface RowProps {
  accent?: string;
  bg?:     string;
}

/** Profile screen ka "App Language" row — tap par LanguageSheet khulta hai. */
export const LanguageSettingRow: React.FC<RowProps> = ({ accent = COLORS.primary, bg = COLORS.primaryBg }) => {
  const { language, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0];

  return (
    <>
      <TouchableOpacity activeOpacity={0.8} onPress={() => setOpen(true)} style={styles.row}>
        <View style={[styles.rowIcon, { backgroundColor: bg }]}>
          <Text style={[styles.rowIconText, { color: accent }]}>{BADGE[current.code]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{t('language.rowTitle')}</Text>
          <Text style={styles.rowSub}>{t('language.rowSub')}</Text>
        </View>
        <Text style={[styles.rowValue, { color: accent }]}>{current.nativeName}</Text>
        <Text style={styles.rowArrow}>›</Text>
      </TouchableOpacity>
      <LanguageSheet visible={open} onClose={() => setOpen(false)} accent={accent} />
    </>
  );
};

/** Login jaise screens ke header ke liye chhota pill button. */
export const LanguagePill: React.FC<{ accent?: string }> = ({ accent = COLORS.primary }) => {
  const { language } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0];

  return (
    <>
      <TouchableOpacity activeOpacity={0.8} onPress={() => setOpen(true)} style={styles.pill} hitSlop={8}>
        <Text style={styles.pillBadge}>{BADGE[current.code]}</Text>
        <Text style={styles.pillText}>{current.nativeName}</Text>
        <Text style={styles.pillCaret}>▾</Text>
      </TouchableOpacity>
      <LanguageSheet visible={open} onClose={() => setOpen(false)} accent={accent} />
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10,
    ...ELEVATION.lg,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, marginBottom: 18,
  },
  title:    { fontSize: 20, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 4, marginBottom: 18 },

  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16,
    padding: 14, marginBottom: 12,
  },
  badge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText:    { fontSize: 20, fontWeight: '800' },
  optionInfo:   { flex: 1 },
  optionName:   { fontSize: 16, fontWeight: '800', color: COLORS.text },
  optionSample: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: 6 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowIconText: { fontSize: 20, fontWeight: '800' },
  rowTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  rowSub:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  rowValue: { fontSize: 13, fontWeight: '700' },
  rowArrow: { fontSize: 26, color: COLORS.textLight, fontWeight: '300' },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  pillBadge: { fontSize: 13, fontWeight: '800', color: '#fff' },
  pillText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  pillCaret: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
});

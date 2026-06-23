import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, StatusBar, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '../../navigation/types';
import { COLORS } from '../../constants/api';
import Input  from '../../components/common/Input';
import Button from '../../components/common/Button';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Signup'>;
  route:      RouteProp<AuthStackParamList, 'Signup'>;
};

const SignupScreen: React.FC<Props> = ({ navigation, route }) => {
  const { phone } = route.params;
  const [name, setName] = useState('');
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (__DEV__) setName('Test User');
    // Android release me `autoFocus` reliably kaam nahi karta (keyboard nahi
    // aata, input stuck ho jaata). Mount ke baad delay se focus karo —
    // LoginScreen wala same proven pattern.
    const t = setTimeout(() => nameRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const handleNext = () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter your full name to continue.');
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert('Invalid Name', 'Name must be at least 2 characters.');
      return;
    }
    navigation.navigate('RoleSelect', { name: name.trim(), phone });
  };

  return (
    <View style={styles.root}>
      <StatusBar backgroundColor={COLORS.primary} barStyle="light-content" />

      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <View style={styles.iconCircle}>
              <Text style={styles.waveEmoji}>👋</Text>
            </View>
            <Text style={styles.headerTitle}>Almost there!</Text>
            <Text style={styles.headerSub}>One last step to set up your account</Text>
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrap}>
        <ScrollView
          contentContainerStyle={styles.sheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Verified phone pill */}
          <View style={styles.verifiedRow}>
            <View style={styles.verifiedDot} />
            <View style={styles.verifiedText}>
              <Text style={styles.verifiedLabel}>Verified Mobile</Text>
              <Text style={styles.verifiedPhone}>{phone || 'Google Account'}</Text>
            </View>
            <Text style={styles.checkmark}>✓</Text>
          </View>

          <Text style={styles.inputSectionTitle}>Your Name</Text>
          <Input
            ref={nameRef}
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            leftIcon="👤"
          />

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Your name will be shown to riders and customers during deliveries.
            </Text>
          </View>

          <Button title="Continue" onPress={handleNext} style={styles.btn} />

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: COLORS.primary },

  header: { backgroundColor: COLORS.primary },
  headerContent: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  waveEmoji:   { fontSize: 36 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 6 },
  headerSub:   { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },

  sheetWrap: { flex: 1 },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingBottom: 40, flexGrow: 1,
  },

  verifiedRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.successBg,
    borderRadius: 14, padding: 16, marginBottom: 28,
    borderWidth: 1, borderColor: COLORS.success + '30',
    gap: 12,
  },
  verifiedDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.success },
  verifiedText:  { flex: 1 },
  verifiedLabel: { fontSize: 11, color: COLORS.success, fontWeight: '600', marginBottom: 2 },
  verifiedPhone: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  checkmark:     { fontSize: 18, color: COLORS.success, fontWeight: '700' },

  inputSectionTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.textMuted,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
  },

  infoBox: {
    backgroundColor: COLORS.secondaryBg, borderRadius: 12, padding: 14, marginTop: 4, marginBottom: 28,
  },
  infoText: { fontSize: 13, color: COLORS.secondary, lineHeight: 18 },

  btn: { marginTop: 'auto' as any },
});

export default SignupScreen;

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/auth';
import { ApiError } from '../../src/api/client';
import { theme } from '../../src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!emailOrPhone.trim() || !password) {
      Alert.alert('Missing details', 'Please enter your phone/email and password.');
      return;
    }
    setBusy(true);
    try {
      const result = await login(emailOrPhone.trim(), password);
      if (result === 'challenge') {
        router.replace('/(auth)/verify-otp');
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Login failed. Please try again.';
      Alert.alert('Login failed', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.brand}>RaghuMayaShop</Text>
      <Text style={styles.tagline}>Your shop, in your pocket.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Phone or Email</Text>
        <TextInput
          style={styles.input}
          value={emailOrPhone}
          onChangeText={setEmailOrPhone}
          placeholder="owner@demo.shop"
          placeholderTextColor={theme.colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={theme.colors.muted}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={submit}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign In'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: theme.spacing.xl },
  brand: { fontSize: 32, fontWeight: '800', color: theme.colors.primary, textAlign: 'center' },
  tagline: { fontSize: 14, color: theme.colors.subtext, textAlign: 'center', marginTop: 6, marginBottom: theme.spacing.xl },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.xl, borderWidth: 1, borderColor: theme.colors.border },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: theme.colors.text },
  button: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingVertical: 14, alignItems: 'center', marginTop: theme.spacing.xl },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

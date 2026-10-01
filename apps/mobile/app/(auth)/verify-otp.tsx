import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/auth';
import { ApiError } from '../../src/api/client';
import { theme } from '../../src/theme';

const METHODS = ['AUTHENTICATOR', 'SMS', 'EMAIL', 'BACKUP_CODE'];

export default function VerifyOtpScreen() {
  const router = useRouter();
  const verify2FA = useAuthStore((s) => s.verify2FA);
  const pendingChallenge = useAuthStore((s) => s.pendingChallenge);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState('AUTHENTICATOR');
  const [busy, setBusy] = useState(false);

  const available = pendingChallenge?.methods?.length
    ? pendingChallenge.methods
    : METHODS;

  const submit = async () => {
    if (!code.trim()) {
      Alert.alert('Missing code', 'Please enter the verification code.');
      return;
    }
    setBusy(true);
    try {
      await verify2FA(code.trim(), method);
      router.replace('/(tabs)/dashboard');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Verification failed. Please try again.';
      Alert.alert('Verification failed', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Two-factor verification</Text>
      <Text style={styles.subtitle}>
        Your account needs a second step. Enter the code from your chosen method.
      </Text>

      <Text style={styles.label}>Method</Text>
      <View style={styles.methodRow}>
        {available.map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.methodChip, method === m && styles.methodChipActive]}
            onPress={() => setMethod(m)}
          >
            <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
              {m.replace(/_/g, ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Code</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        placeholderTextColor={theme.colors.muted}
        keyboardType="number-pad"
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy}
      >
        <Text style={styles.buttonText}>{busy ? 'Verifying…' : 'Verify & Sign In'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.xl, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: theme.colors.subtext, textAlign: 'center', marginTop: 8, marginBottom: theme.spacing.xl },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 12, fontSize: 20, letterSpacing: 4, textAlign: 'center', color: theme.colors.text },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.card },
  methodChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  methodText: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  methodTextActive: { color: '#fff' },
  button: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingVertical: 14, alignItems: 'center', marginTop: theme.spacing.xl },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

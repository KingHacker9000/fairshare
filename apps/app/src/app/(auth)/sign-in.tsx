import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, Card, Field, Heading, Screen, ui } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function SignInScreen() {
  const { user, signIn, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Redirect href="/(tabs)" />;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await signIn(email, password);
      else await register({ email, password, displayName, defaultCurrency: currency.toUpperCase() });
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not continue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ paddingTop: 28, gap: 8 }}>
          <Text style={{ fontSize: 44 }}>🤝</Text>
          <Heading eyebrow="Shared money, minus the awkwardness">FairShare</Heading>
          <Text style={ui.muted}>Track every bill, settle cleanly, and keep the receipts.</Text>
        </View>
        <Card>
          <View style={[ui.row, { gap: 8, flexWrap: 'wrap' }]}>
            <Button title="Sign in" variant={mode === 'login' ? 'primary' : 'secondary'} onPress={() => setMode('login')} />
            <Button title="Create account" variant={mode === 'register' ? 'primary' : 'secondary'} onPress={() => setMode('register')} />
          </View>
          {mode === 'register' ? <Field label="Your name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'register' ? <Field label="Default currency" value={currency} onChangeText={setCurrency} maxLength={3} autoCapitalize="characters" /> : null}
          {error ? <Text style={{ color: colors.danger, fontWeight: '700' }}>{error}</Text> : null}
          <Button title={busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'} disabled={busy} onPress={submit} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

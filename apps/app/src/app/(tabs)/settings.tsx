import React, { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Heading, Screen, ui } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { syncNow } from '@/lib/offline';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [syncMessage, setSyncMessage] = useState('');
  return <Screen>
    <Heading eyebrow="Account & data">Settings</Heading>
    <Card><Text style={ui.title}>{user?.displayName}</Text><Text style={ui.muted}>{user?.email}</Text><Text style={ui.muted}>Default currency: {user?.defaultCurrency}</Text></Card>
    <Card><Text style={ui.title}>Offline sync</Text><Text style={ui.muted}>Queued expenses automatically upload when your tablet reconnects.</Text><Button title="Sync now" variant="secondary" onPress={() => { void syncNow().then((result) => setSyncMessage(`Pushed ${result.pushed}, pulled ${result.pulled}`)).catch((error) => setSyncMessage(error.message)); }} />{syncMessage ? <Text style={ui.muted}>{syncMessage}</Text> : null}</Card>
    <Card><Text style={ui.title}>Included premium-grade tools</Text><Text style={ui.muted}>Unlimited entries · advanced splits · receipt OCR · currency conversion · recurring expenses · search · charts · exports · debt simplification.</Text></Card>
    <Button title="Sign out" variant="danger" onPress={() => { void signOut().then(() => router.replace('/(auth)/sign-in')); }} />
  </Screen>;
}

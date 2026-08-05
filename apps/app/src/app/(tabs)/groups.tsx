import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { formatMoney, type GroupBalance } from '@fairshare/shared';
import { Button, Card, EmptyState, Field, Heading, Loading, Screen, ui } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

type Group = { id: string; name: string; type: string; currency: string; members: unknown[]; balance?: GroupBalance; balances?: GroupBalance[] };

export default function GroupsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(user?.defaultCurrency ?? 'USD');
  const [type, setType] = useState<'trip' | 'home' | 'couple' | 'other'>('trip');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setGroups(await api<Group[]>('/groups')); } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { void load(); }, []));

  const create = async () => {
    setBusy(true);
    try {
      const group = await api<Group>('/groups', { method: 'POST', body: JSON.stringify({ name, currency: currency.toUpperCase(), type, simplifyDebts: true }) });
      setName('');
      setShowCreate(false);
      await load();
      router.push({ pathname: '/groups/[id]', params: { id: group.id } });
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <View style={ui.between}><Heading eyebrow="Everyone, one ledger">Groups</Heading><Button title={showCreate ? 'Cancel' : 'New group'} variant="secondary" onPress={() => setShowCreate((value) => !value)} /></View>
      {showCreate ? <Card>
        <Field label="Group name" value={name} onChangeText={setName} placeholder="Bali trip" />
        <Text style={ui.muted}>Group type</Text>
        <View style={[ui.row, { gap: 8, flexWrap: 'wrap' }]}>{(['trip', 'home', 'couple', 'other'] as const).map((value) => <Pressable key={value} onPress={() => setType(value)} style={[ui.chip, type === value && { backgroundColor: colors.primary }]}><Text style={{ color: type === value ? '#fff' : colors.ink, fontWeight: '700', textTransform: 'capitalize' }}>{value}</Text></Pressable>)}</View>
        <Field label="Default currency" value={currency} onChangeText={setCurrency} maxLength={3} autoCapitalize="characters" />
        <Button title={busy ? 'Creating…' : 'Create group'} disabled={busy || !name.trim()} onPress={create} />
      </Card> : null}
      {loading ? <Loading /> : groups.length === 0 ? <EmptyState title="Start your first group" body="Use groups for trips, homes, couples, events, or any recurring circle of people." /> : groups.map((group) => {
        const positions = (group.balances ?? (group.balance ? [group.balance] : [])).map((balance) => ({ currency: balance.currency, amount: balance.netByUser[user?.id ?? ''] ?? 0 })).filter((item) => item.amount !== 0);
        return <Pressable key={group.id} onPress={() => router.push({ pathname: '/groups/[id]', params: { id: group.id } })}><Card><View style={ui.between}><View style={{ gap: 3 }}><Text style={ui.title}>{group.name}</Text><Text style={ui.muted}>{group.members.length} people · {group.type}</Text></View><View style={{ alignItems: 'flex-end', gap: 3 }}>{positions.length ? positions.slice(0, 3).map((item) => <Text key={item.currency} style={item.amount >= 0 ? ui.positive : ui.negative}>{formatMoney(Math.abs(item.amount), item.currency)}</Text>) : <Text style={ui.positive}>Settled</Text>}</View></View></Card></Pressable>;
      })}
    </Screen>
  );
}

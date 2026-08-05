import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { formatMoney, type GroupBalance } from '@fairshare/shared';
import { Card, EmptyState, Heading, Loading, Screen, ui } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

type Group = { id: string; name: string; currency: string; members: unknown[]; balance: GroupBalance; balances: GroupBalance[]; updatedAt: string };

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setGroups(await api<Group[]>('/groups')); } finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { void load(); }, []));

  const totals = groups.reduce((acc, group) => {
    for (const balance of group.balances ?? [group.balance]) {
      const value = balance.netByUser[user?.id ?? ''] ?? 0;
      acc[balance.currency] = (acc[balance.currency] ?? 0) + value;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <Screen scroll={false}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />} contentContainerStyle={{ gap: 16, paddingBottom: 30 }}>
        <Heading eyebrow={`Welcome back, ${user?.displayName ?? ''}`}>Your shared money</Heading>
        <Card>
          <Text style={ui.muted}>Across all groups</Text>
          {Object.keys(totals).length ? Object.entries(totals).map(([currency, amount]) => (
            <View key={currency} style={ui.between}>
              <Text style={ui.body}>{currency}</Text>
              <Text style={amount >= 0 ? ui.positive : ui.negative}>{amount >= 0 ? 'you are owed ' : 'you owe '}{formatMoney(Math.abs(amount), currency)}</Text>
            </View>
          )) : <Text style={ui.title}>All settled up</Text>}
        </Card>
        <View style={ui.between}><Text style={ui.title}>Recent groups</Text><Pressable onPress={() => router.push('/(tabs)/groups')}><Text style={{ color: colors.primaryDark, fontWeight: '800' }}>View all</Text></Pressable></View>
        {loading ? <Loading /> : groups.length === 0 ? <EmptyState title="No groups yet" body="Create a trip, household, couple, or friends group to start splitting expenses." /> : groups.slice(0, 5).map((group) => {
          const positions = (group.balances ?? [group.balance]).map((balance) => ({ currency: balance.currency, amount: balance.netByUser[user?.id ?? ''] ?? 0 })).filter((item) => item.amount !== 0);
          return <Pressable key={group.id} onPress={() => router.push({ pathname: '/groups/[id]', params: { id: group.id } })}><Card><View style={ui.between}><View style={{ gap: 4, flex: 1 }}><Text style={ui.title}>{group.name}</Text><Text style={ui.muted}>{group.members.length} members · default {group.currency}</Text></View><View style={{ alignItems: 'flex-end', gap: 3 }}>{positions.length ? positions.slice(0, 3).map((item) => <Text key={item.currency} style={item.amount >= 0 ? ui.positive : ui.negative}>{formatMoney(Math.abs(item.amount), item.currency)}</Text>) : <Text style={ui.positive}>Settled</Text>}</View></View></Card></Pressable>;
        })}
      </ScrollView>
    </Screen>
  );
}

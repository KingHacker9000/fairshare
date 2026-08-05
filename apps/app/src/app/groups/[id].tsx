import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { formatMoney, type ExpenseShareInput, type GroupBalance, type SplitMethod } from '@fairshare/shared';
import { Button, Card, EmptyState, Field, Heading, Loading, Screen, ui } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

type Member = { id: string; displayName: string; email: string; role: string };
type Group = {
  id: string;
  name: string;
  type: string;
  currency: string;
  simplifyDebts: boolean;
  defaultSplitMethod: 'equal' | 'percentage' | 'shares';
  defaultShares: ExpenseShareInput[];
  members: Member[];
  balance: GroupBalance;
  balances: GroupBalance[];
};
type Expense = {
  id: string;
  description: string;
  category: string;
  amountMinor: number;
  currency: string;
  paidByName: string;
  incurredAt: string;
  originalAmountMinor?: number | null;
  originalCurrency?: string | null;
  shares: Array<{ userId: string; displayName: string; owedMinor: number }>;
};
type StatRow = { currency: string; amountMinor: number; count: number };
type Stats = {
  category: Array<StatRow & { category: string }>;
  monthly: Array<StatRow & { month: string }>;
};

function widthFor(value: number, max: number): `${number}%` {
  return `${Math.max(4, Math.round((value / Math.max(1, max)) * 100))}%`;
}

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<Stats>({ category: [], monthly: [] });
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [message, setMessage] = useState('');
  const [defaultMethod, setDefaultMethod] = useState<'equal' | 'percentage' | 'shares'>('equal');
  const [defaultValues, setDefaultValues] = useState<Record<string, string>>({});
  const [savingDefault, setSavingDefault] = useState(false);
  const [converting, setConverting] = useState(false);

  const applyDefaultState = (value: Group) => {
    setDefaultMethod(value.defaultSplitMethod ?? 'equal');
    const stored = new Map((value.defaultShares ?? []).map((share) => [share.userId, share.value]));
    setDefaultValues(Object.fromEntries(value.members.map((member) => [member.id, stored.get(member.id)?.toString() ?? ''])));
  };

  const load = async () => {
    if (!id) return;
    try {
      const [groupResult, expenseResult, statResult] = await Promise.all([
        api<Group>(`/groups/${id}`),
        api<Expense[]>(`/groups/${id}/expenses`),
        api<Stats>(`/groups/${id}/stats`),
      ]);
      setGroup(groupResult);
      applyDefaultState(groupResult);
      setExpenses(expenseResult);
      setStats(statResult);
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { void load(); }, [id]));

  if (loading || !group) return <Screen><Loading /></Screen>;

  const settle = async (edge: GroupBalance['settlements'][number], currency: string) => {
    await api(`/groups/${group.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ ...edge, currency, paidAt: new Date().toISOString() }),
    });
    setMessage('Payment recorded');
    await load();
  };

  const invite = async () => {
    const result = await api<{ invited?: boolean; message?: string }>(`/groups/${group.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail }),
    });
    setMessage(result.message ?? 'Member added');
    setInviteEmail('');
    await load();
  };

  const changeDefaultMethod = (method: 'equal' | 'percentage' | 'shares') => {
    setDefaultMethod(method);
    if (method === 'equal') setDefaultValues({});
    else if (method === 'shares') setDefaultValues(Object.fromEntries(group.members.map((member) => [member.id, '1'])));
    else {
      const base = Math.floor(10000 / group.members.length) / 100;
      setDefaultValues(Object.fromEntries(group.members.map((member, index) => [member.id, String(index === group.members.length - 1 ? 100 - base * (group.members.length - 1) : base)])));
    }
  };

  const saveDefault = async () => {
    setSavingDefault(true);
    try {
      const updated = await api<Group>(`/groups/${group.id}/default-split`, {
        method: 'PUT',
        body: JSON.stringify({
          method: defaultMethod,
          shares: group.members.map((member) => ({
            userId: member.id,
            included: true,
            value: defaultMethod === 'equal' ? undefined : Number(defaultValues[member.id] || 0),
          })),
        }),
      });
      setGroup((current) => current ? { ...current, ...updated } : current);
      setMessage('Default split saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save default split');
    } finally {
      setSavingDefault(false);
    }
  };

  const convertAll = () => {
    Alert.alert(
      'Convert all balances?',
      `Every expense and payment will be converted to ${group.currency} using current market rates. Original amounts remain stored for audit.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert',
          onPress: () => {
            setConverting(true);
            void api(`/groups/${group.id}/convert`, { method: 'POST', body: JSON.stringify({ targetCurrency: group.currency }) })
              .then(() => { setMessage(`Converted to ${group.currency}`); return load(); })
              .catch((error) => setMessage(error instanceof Error ? error.message : 'Conversion failed'))
              .finally(() => setConverting(false));
          },
        },
      ],
    );
  };

  const categoryMax = Object.fromEntries(group.balances.map((balance) => [balance.currency, Math.max(1, ...stats.category.filter((row) => row.currency === balance.currency).map((row) => Number(row.amountMinor)))]));
  const monthMax = Object.fromEntries(group.balances.map((balance) => [balance.currency, Math.max(1, ...stats.monthly.filter((row) => row.currency === balance.currency).map((row) => Number(row.amountMinor)))]));

  return <Screen>
    <Heading eyebrow={`${group.type} · default ${group.currency}`}>{group.name}</Heading>

    <Card>
      <Text style={ui.title}>Your balances</Text>
      {group.balances.map((balance) => {
        const amount = balance.netByUser[user?.id ?? ''] ?? 0;
        return <View key={balance.currency} style={ui.between}>
          <Text style={ui.body}>{balance.currency}</Text>
          <Text style={amount >= 0 ? ui.positive : ui.negative}>{amount >= 0 ? 'owed to you ' : 'you owe '}{formatMoney(Math.abs(amount), balance.currency)}</Text>
        </View>;
      })}
      <Button title="Add expense" onPress={() => router.push({ pathname: '/expenses/new', params: { groupId: group.id } })} />
      {group.balances.some((balance) => balance.currency !== group.currency && Object.values(balance.netByUser).some(Boolean)) ? <Button title={converting ? 'Converting…' : `Convert all to ${group.currency}`} variant="secondary" disabled={converting} onPress={convertAll} /> : null}
    </Card>

    <Card>
      <Text style={ui.title}>Suggested settlements</Text>
      {group.balances.every((balance) => balance.settlements.length === 0) ? <Text style={ui.muted}>Everyone is settled up.</Text> : group.balances.flatMap((balance) => balance.settlements.map((edge, index) => {
        const from = group.members.find((member) => member.id === edge.fromUserId)?.displayName ?? 'Member';
        const to = group.members.find((member) => member.id === edge.toUserId)?.displayName ?? 'Member';
        const canRecord = edge.fromUserId === user?.id || edge.toUserId === user?.id;
        return <View key={`${balance.currency}-${edge.fromUserId}-${edge.toUserId}-${index}`} style={[ui.between, { gap: 10 }]}>
          <Text style={[ui.body, { flex: 1 }]}>{from} pays {to} {formatMoney(edge.amountMinor, balance.currency)}</Text>
          {canRecord ? <Pressable onPress={() => { void settle(edge, balance.currency); }} style={ui.chip}><Text style={{ color: colors.primaryDark, fontWeight: '800' }}>Record</Text></Pressable> : null}
        </View>;
      }))}
    </Card>

    <Card>
      <Text style={ui.title}>Saved default split</Text>
      <Text style={ui.muted}>New expenses start with this split, and can still be changed individually.</Text>
      <View style={[ui.row, { gap: 8, flexWrap: 'wrap' }]}>{(['equal', 'percentage', 'shares'] as const).map((method) => <Pressable key={method} onPress={() => changeDefaultMethod(method)} style={[ui.chip, defaultMethod === method && { backgroundColor: colors.primary }]}><Text style={{ color: defaultMethod === method ? '#fff' : colors.ink, fontWeight: '700', textTransform: 'capitalize' }}>{method}</Text></Pressable>)}</View>
      {defaultMethod !== 'equal' ? group.members.map((member) => <Field key={member.id} label={`${member.displayName} (${defaultMethod === 'percentage' ? '%' : 'shares'})`} value={defaultValues[member.id] ?? ''} onChangeText={(value) => setDefaultValues((current) => ({ ...current, [member.id]: value }))} keyboardType="decimal-pad" />) : null}
      <Button title={savingDefault ? 'Saving…' : 'Save default split'} variant="secondary" disabled={savingDefault} onPress={() => { void saveDefault(); }} />
    </Card>

    <Card>
      <Text style={ui.title}>Members</Text>
      {group.members.map((member) => <View key={member.id} style={ui.between}><View><Text style={ui.body}>{member.displayName}</Text><Text style={ui.muted}>{member.email}</Text></View><Text style={ui.muted}>{member.role}</Text></View>)}
      <Field label="Add or invite by email" value={inviteEmail} onChangeText={setInviteEmail} autoCapitalize="none" keyboardType="email-address" />
      <Button title="Add member" variant="secondary" disabled={!inviteEmail.includes('@')} onPress={() => { void invite(); }} />
      {message ? <Text style={ui.muted}>{message}</Text> : null}
    </Card>

    <Card>
      <Text style={ui.title}>Spending by category</Text>
      {stats.category.length === 0 ? <Text style={ui.muted}>No spending yet.</Text> : stats.category.slice(0, 12).map((row) => <View key={`${row.currency}-${row.category}`} style={{ gap: 5 }}>
        <View style={ui.between}><Text style={[ui.body, { textTransform: 'capitalize' }]}>{row.category}</Text><Text style={ui.body}>{formatMoney(Number(row.amountMinor), row.currency)}</Text></View>
        <View style={{ height: 9, backgroundColor: colors.primarySoft, borderRadius: 99 }}><View style={{ width: widthFor(Number(row.amountMinor), categoryMax[row.currency] ?? 1), height: 9, backgroundColor: colors.primary, borderRadius: 99 }} /></View>
      </View>)}
    </Card>

    <Card>
      <Text style={ui.title}>Spending over time</Text>
      {stats.monthly.length === 0 ? <Text style={ui.muted}>No monthly trend yet.</Text> : stats.monthly.slice(-12).map((row) => <View key={`${row.currency}-${row.month}`} style={{ gap: 5 }}>
        <View style={ui.between}><Text style={ui.body}>{row.month}</Text><Text style={ui.body}>{formatMoney(Number(row.amountMinor), row.currency)}</Text></View>
        <View style={{ height: 9, backgroundColor: colors.primarySoft, borderRadius: 99 }}><View style={{ width: widthFor(Number(row.amountMinor), monthMax[row.currency] ?? 1), height: 9, backgroundColor: colors.primaryDark, borderRadius: 99 }} /></View>
      </View>)}
    </Card>

    <View style={ui.between}><Text style={ui.title}>Expenses</Text><Text style={ui.muted}>{expenses.length} total</Text></View>
    {expenses.length === 0 ? <EmptyState title="Nothing here yet" body="Add the first expense. Every cent will be assigned deterministically." /> : expenses.map((expense) => <Card key={expense.id}>
      <View style={ui.between}><View style={{ flex: 1, gap: 3 }}><Text style={ui.title}>{expense.description}</Text><Text style={ui.muted}>{expense.paidByName} paid · {expense.category} · {new Date(expense.incurredAt).toLocaleDateString()}</Text></View><Text style={ui.body}>{formatMoney(expense.amountMinor, expense.currency)}</Text></View>
      {expense.originalAmountMinor && expense.originalCurrency ? <Text style={ui.muted}>Originally {formatMoney(expense.originalAmountMinor, expense.originalCurrency)}</Text> : null}
      <View style={{ gap: 4 }}>{expense.shares.map((share) => <Text key={share.userId} style={ui.muted}>{share.displayName}: {formatMoney(share.owedMinor, expense.currency)}</Text>)}</View>
    </Card>)}
  </Screen>;
}

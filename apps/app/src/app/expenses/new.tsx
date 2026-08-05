import React, { useMemo, useState, useEffect } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  calculateExpenseShares,
  formatMoney,
  parseDecimalToMinor,
  type ExpenseShareInput,
  type ReceiptScanResult,
  type SplitMethod,
} from '@fairshare/shared';
import { Button, Card, Field, Heading, Loading, Screen, ui } from '@/components/ui';
import { ApiError, api, uploadReceipt } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { enqueueMutation } from '@/lib/offline';
import { colors } from '@/lib/theme';

type Member = { id: string; displayName: string; email: string };
type Group = {
  id: string;
  name: string;
  currency: string;
  members: Member[];
  defaultSplitMethod?: 'equal' | 'percentage' | 'shares';
  defaultShares?: ExpenseShareInput[];
};
type Values = Record<string, string>;
type ItemAssignments = Record<number, string[]>;

type OriginalConversion = {
  amountMinor: number;
  currency: string;
  rate: number;
} | null;

function defaultValues(method: SplitMethod, members: Member[], stored: ExpenseShareInput[] = []): Values {
  const byUser = new Map(stored.map((share) => [share.userId, share.value]));
  if (stored.length) return Object.fromEntries(members.map((member) => [member.id, byUser.get(member.id)?.toString() ?? '']));
  if (method === 'shares') return Object.fromEntries(members.map((member) => [member.id, '1']));
  if (method === 'percentage' && members.length) {
    const base = Math.floor(10000 / members.length) / 100;
    return Object.fromEntries(members.map((member, index) => [member.id, String(index === members.length - 1 ? 100 - base * (members.length - 1) : base)]));
  }
  return {};
}

export default function NewExpenseScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseCurrency, setExpenseCurrency] = useState('USD');
  const [incurredDate, setIncurredDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('general');
  const [notes, setNotes] = useState('');
  const [paidBy, setPaidBy] = useState(user?.id ?? '');
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [values, setValues] = useState<Values>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [converting, setConverting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptScanResult | null>(null);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignments>({});
  const [originalConversion, setOriginalConversion] = useState<OriginalConversion>(null);
  const [recurring, setRecurring] = useState(false);
  const [cadence, setCadence] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [mutationId] = useState(() => `expense_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!groupId) return;
    void api<Group>(`/groups/${groupId}`).then((result) => {
      const initialMethod = result.defaultSplitMethod ?? 'equal';
      const stored = result.defaultShares ?? [];
      setGroup(result);
      setExpenseCurrency(result.currency);
      setPaidBy((current) => current || user?.id || result.members[0]?.id || '');
      setMethod(initialMethod);
      setIncluded(Object.fromEntries(result.members.map((member) => [member.id, stored.length ? stored.some((share) => share.userId === member.id && share.included !== false) : true])));
      setValues(defaultValues(initialMethod, result.members, stored));
    }).catch((error) => Alert.alert('Could not load group', error instanceof Error ? error.message : 'Unknown error'));
  }, [groupId, user?.id]);

  const amountMinor = useMemo(() => {
    try { return parseDecimalToMinor(amount); } catch { return 0; }
  }, [amount]);

  const shareInput = useMemo(() => group?.members.map((member) => ({
    userId: member.id,
    included: included[member.id] !== false,
    value: method === 'exact' || method === 'adjustment'
      ? (() => { try { return parseDecimalToMinor(values[member.id] ?? '0'); } catch { return 0; } })()
      : Number(values[member.id] || 0),
  })) ?? [], [group, included, method, values]);

  const preview = useMemo(() => {
    if (!amountMinor || !shareInput.length) return null;
    try { return calculateExpenseShares(amountMinor, method, shareInput); } catch { return null; }
  }, [amountMinor, method, shareInput]);

  if (!group) return <Screen><Loading /></Screen>;

  const changeMethod = (nextMethod: SplitMethod) => {
    setMethod(nextMethod);
    setValues(defaultValues(nextMethod, group.members));
  };

  const pickReceipt = async (camera: boolean) => {
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setScanning(true);
    try {
      const asset = result.assets[0];
      const scanned = await uploadReceipt(asset.uri, asset.fileName ?? 'receipt.jpg', asset.mimeType ?? 'image/jpeg') as ReceiptScanResult;
      setReceipt(scanned);
      if (scanned.totalMinor) setAmount((scanned.totalMinor / 100).toFixed(2));
      if (scanned.currency) setExpenseCurrency(scanned.currency.toUpperCase());
      if (scanned.purchasedAt) setIncurredDate(scanned.purchasedAt.slice(0, 10));
      if (scanned.merchant) setDescription(scanned.merchant);
      if (scanned.items?.length) {
        const allMembers = group.members.map((member) => member.id);
        setItemAssignments(Object.fromEntries(scanned.items.map((_, index) => [index, allMembers])));
        setNotes(scanned.items.map((item) => `${item.quantity}× ${item.description}: ${(item.totalMinor / 100).toFixed(2)}`).join('\n'));
      }
    } catch (error) {
      Alert.alert('Receipt scan failed', error instanceof Error ? error.message : 'Could not scan receipt');
    } finally {
      setScanning(false);
    }
  };

  const toggleItemMember = (itemIndex: number, userId: string) => {
    setItemAssignments((current) => {
      const assigned = new Set(current[itemIndex] ?? []);
      if (assigned.has(userId)) assigned.delete(userId);
      else assigned.add(userId);
      return { ...current, [itemIndex]: [...assigned] };
    });
  };

  const useItemizedSplit = () => {
    if (!receipt?.items.length || !amountMinor) return;
    const totals: Record<string, number> = Object.fromEntries(group.members.map((member) => [member.id, 0]));
    let itemTotal = 0;
    for (const [index, item] of receipt.items.entries()) {
      const assigned = itemAssignments[index] ?? [];
      if (!assigned.length) return Alert.alert('Assign every item', `Choose at least one person for “${item.description}”.`);
      itemTotal += item.totalMinor;
      const split = calculateExpenseShares(item.totalMinor, 'equal', assigned.map((userId) => ({ userId })));
      for (const [userId, value] of Object.entries(split)) totals[userId] = (totals[userId] ?? 0) + value;
    }
    const extras = amountMinor - itemTotal;
    if (extras < 0) return Alert.alert('Receipt mismatch', 'The scanned line items exceed the receipt total. Correct the amount or item values first.');
    if (extras > 0) {
      const participants = group.members.filter((member) => Object.values(itemAssignments).some((assigned) => assigned.includes(member.id)));
      const extraSplit = calculateExpenseShares(extras, 'equal', participants.map((member) => ({ userId: member.id })));
      for (const [userId, value] of Object.entries(extraSplit)) totals[userId] = (totals[userId] ?? 0) + value;
    }
    setIncluded(Object.fromEntries(group.members.map((member) => [member.id, totals[member.id]! > 0])));
    setValues(Object.fromEntries(group.members.map((member) => [member.id, (totals[member.id]! / 100).toFixed(2)])));
    setMethod('exact');
  };

  const convertToGroupCurrency = async () => {
    if (!amountMinor || expenseCurrency.toUpperCase() === group.currency.toUpperCase()) return;
    setConverting(true);
    try {
      const fx = await api<{ rates: Record<string, number> }>(`/fx/latest?base=${encodeURIComponent(expenseCurrency)}&symbols=${encodeURIComponent(group.currency)}`);
      const rate = fx.rates?.[group.currency.toUpperCase()];
      if (!rate) throw new Error(`No rate returned for ${expenseCurrency}/${group.currency}`);
      const convertedAmount = Math.max(1, Math.round(amountMinor * rate));
      setOriginalConversion({ amountMinor, currency: expenseCurrency.toUpperCase(), rate });
      setAmount((convertedAmount / 100).toFixed(2));
      setExpenseCurrency(group.currency.toUpperCase());
      if (receipt) {
        const scale = (value?: number) => value === undefined ? undefined : Math.max(0, Math.round(value * rate));
        setReceipt({
          ...receipt,
          currency: group.currency.toUpperCase(),
          subtotalMinor: scale(receipt.subtotalMinor),
          taxMinor: scale(receipt.taxMinor),
          tipMinor: scale(receipt.tipMinor),
          totalMinor: convertedAmount,
          items: receipt.items.map((item) => ({ ...item, unitPriceMinor: scale(item.unitPriceMinor)!, totalMinor: scale(item.totalMinor)! })),
        });
      }
      if (method === 'exact' && preview) {
        const convertedShares = calculateExpenseShares(convertedAmount, 'shares', Object.entries(preview).map(([userId, value]) => ({ userId, value })));
        setValues(Object.fromEntries(Object.entries(convertedShares).map(([userId, value]) => [userId, (value / 100).toFixed(2)])));
      }
    } catch (error) {
      Alert.alert('Conversion failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setConverting(false);
    }
  };

  const save = async () => {
    if (!preview) return Alert.alert('Check split', 'The split values must add up correctly.');
    const date = new Date(`${incurredDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return Alert.alert('Check date', 'Use a date in YYYY-MM-DD format.');
    const payload = {
      description,
      category,
      amountMinor,
      currency: expenseCurrency.toUpperCase(),
      paidByUserId: paidBy,
      incurredAt: date.toISOString(),
      splitMethod: method,
      shares: shareInput,
      notes: notes || undefined,
      receiptItems: receipt?.items.map((item, index) => ({ ...item, assignedUserIds: itemAssignments[index] ?? [] })),
      originalAmountMinor: originalConversion?.amountMinor,
      originalCurrency: originalConversion?.currency,
      conversionRate: originalConversion?.rate,
      idempotencyKey: mutationId,
    };
    setBusy(true);
    try {
      const network = await NetInfo.fetch();
      if (network.isConnected) {
        try {
          await api(`/groups/${group.id}/expenses`, { method: 'POST', body: JSON.stringify(payload) });
        } catch (error) {
          if (error instanceof ApiError) throw error;
          await enqueueMutation({ id: mutationId, kind: 'createExpense', groupId: group.id, payload });
        }
      } else {
        await enqueueMutation({ id: mutationId, kind: 'createExpense', groupId: group.id, payload });
      }
      if (recurring && network.isConnected) {
        const next = new Date(date);
        if (cadence === 'weekly') next.setDate(next.getDate() + 7);
        else if (cadence === 'yearly') next.setFullYear(next.getFullYear() + 1);
        else next.setMonth(next.getMonth() + 1);
        await api('/recurring', { method: 'POST', body: JSON.stringify({ groupId: group.id, cadence, nextRunAt: next.toISOString(), template: payload }) });
      }
      router.back();
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return <Screen>
    <Heading eyebrow={group.name}>New expense</Heading>
    <Card>
      <View style={[ui.row, { gap: 8, flexWrap: 'wrap' }]}>
        <Button title={scanning ? 'Scanning…' : 'Scan receipt'} variant="secondary" disabled={scanning} onPress={() => { void pickReceipt(true); }} />
        <Button title="Choose photo" variant="secondary" disabled={scanning} onPress={() => { void pickReceipt(false); }} />
      </View>
      {receipt ? <Text style={ui.muted}>Receipt confidence: {Math.round((receipt.confidence ?? 0) * 100)}% · {receipt.items.length} items</Text> : null}
      <Field label="Description" value={description} onChangeText={setDescription} placeholder="Dinner" />
      <View style={[ui.row, { gap: 10, alignItems: 'flex-end' }]}>
        <View style={{ flex: 1 }}><Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" /></View>
        <View style={{ width: 94 }}><Field label="Currency" value={expenseCurrency} onChangeText={(value) => { setExpenseCurrency(value.toUpperCase()); setOriginalConversion(null); }} maxLength={3} autoCapitalize="characters" /></View>
      </View>
      {expenseCurrency.toUpperCase() !== group.currency.toUpperCase() && amountMinor > 0 ? <Button title={converting ? 'Converting…' : `Convert to ${group.currency}`} variant="secondary" disabled={converting} onPress={() => { void convertToGroupCurrency(); }} /> : null}
      {originalConversion ? <Text style={ui.muted}>Originally {formatMoney(originalConversion.amountMinor, originalConversion.currency)} · rate {originalConversion.rate.toFixed(6)}</Text> : null}
      <Field label="Date (YYYY-MM-DD)" value={incurredDate} onChangeText={setIncurredDate} autoCapitalize="none" />
      <Field label="Category" value={category} onChangeText={setCategory} placeholder="food" />
      <Field label="Notes / receipt items" value={notes} onChangeText={setNotes} multiline />
    </Card>

    {receipt?.items.length ? <Card>
      <Text style={ui.title}>Assign receipt items</Text>
      <Text style={ui.muted}>Tap everyone who shared each item. Tax, tip, and rounding are distributed across participants.</Text>
      {receipt.items.map((item, index) => <View key={`${item.description}-${index}`} style={{ gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border, paddingTop: index ? 10 : 0 }}>
        <View style={ui.between}><Text style={[ui.body, { flex: 1 }]}>{item.quantity}× {item.description}</Text><Text style={ui.body}>{formatMoney(item.totalMinor, expenseCurrency)}</Text></View>
        <View style={[ui.row, { gap: 7, flexWrap: 'wrap' }]}>{group.members.map((member) => {
          const active = (itemAssignments[index] ?? []).includes(member.id);
          return <Pressable key={member.id} onPress={() => toggleItemMember(index, member.id)} style={[ui.chip, active && { backgroundColor: colors.primary }]}><Text style={{ color: active ? '#fff' : colors.ink, fontWeight: '700' }}>{member.displayName}</Text></Pressable>;
        })}</View>
      </View>)}
      <Button title="Apply itemized split" variant="secondary" onPress={useItemizedSplit} />
    </Card> : null}

    <Card>
      <Text style={ui.title}>Who paid?</Text>
      <View style={[ui.row, { gap: 8, flexWrap: 'wrap' }]}>{group.members.map((member) => <Pressable key={member.id} onPress={() => setPaidBy(member.id)} style={[ui.chip, paidBy === member.id && { backgroundColor: colors.primary }]}><Text style={{ color: paidBy === member.id ? '#fff' : colors.ink, fontWeight: '700' }}>{member.displayName}</Text></Pressable>)}</View>
    </Card>

    <Card>
      <Text style={ui.title}>How should it be split?</Text>
      <View style={[ui.row, { gap: 8, flexWrap: 'wrap' }]}>{(['equal', 'percentage', 'shares', 'exact'] as SplitMethod[]).map((value) => <Pressable key={value} onPress={() => changeMethod(value)} style={[ui.chip, method === value && { backgroundColor: colors.primary }]}><Text style={{ color: method === value ? '#fff' : colors.ink, fontWeight: '700', textTransform: 'capitalize' }}>{value}</Text></Pressable>)}</View>
      {group.members.map((member) => {
        const active = included[member.id] !== false;
        return <View key={member.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
          <View style={ui.between}>
            <Pressable onPress={() => setIncluded((current) => ({ ...current, [member.id]: !active }))}><Text style={[ui.body, !active && { color: colors.muted }]}>{active ? '✓' : '○'} {member.displayName}</Text></Pressable>
            {preview && active ? <Text style={ui.muted}>{formatMoney(preview[member.id] ?? 0, expenseCurrency)}</Text> : null}
          </View>
          {active && method !== 'equal' ? <Field label={method === 'percentage' ? 'Percent' : method === 'shares' ? 'Shares' : `Exact amount (${expenseCurrency})`} value={values[member.id] ?? ''} onChangeText={(value) => setValues((current) => ({ ...current, [member.id]: value }))} keyboardType="decimal-pad" /> : null}
        </View>;
      })}
      {!preview && amountMinor > 0 ? <Text style={{ color: colors.danger, fontWeight: '700' }}>The current split is invalid.</Text> : null}
    </Card>

    <Card>
      <View style={ui.between}><View style={{ flex: 1, gap: 3 }}><Text style={ui.title}>Make recurring</Text><Text style={ui.muted}>Automatically add this expense again.</Text></View><Button title={recurring ? 'On' : 'Off'} variant="secondary" onPress={() => setRecurring((value) => !value)} /></View>
      {recurring ? <View style={[ui.row, { gap: 8, flexWrap: 'wrap' }]}>{(['weekly', 'monthly', 'yearly'] as const).map((value) => <Pressable key={value} onPress={() => setCadence(value)} style={[ui.chip, cadence === value && { backgroundColor: colors.primary }]}><Text style={{ color: cadence === value ? '#fff' : colors.ink, fontWeight: '700' }}>{value}</Text></Pressable>)}</View> : null}
    </Card>

    <Button title={busy ? 'Saving…' : 'Save expense'} disabled={busy || !description.trim() || !preview || expenseCurrency.length !== 3} onPress={() => { void save(); }} />
  </Screen>;
}

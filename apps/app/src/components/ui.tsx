import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '@/lib/theme';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const body = <View style={styles.screenInner}>{children}</View>;
  return <SafeAreaView style={styles.safe}>{scroll ? <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}</SafeAreaView>;
}

export function Heading({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) {
  return <View style={{ gap: 4 }}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.heading}>{children}</Text></View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', disabled = false }: { title: string; onPress(): void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && { opacity: 0.82 }, disabled && { opacity: 0.5 }]}><Text style={[styles.buttonText, variant !== 'primary' && { color: variant === 'danger' ? colors.danger : colors.ink }]}>{title}</Text></Pressable>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 7 }}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} /></View>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <Card style={{ alignItems: 'center', paddingVertical: 32 }}><Text style={{ fontSize: 32 }}>🧾</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.mutedCenter}>{body}</Text></Card>;
}

export function Loading() {
  return <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
}

export const ui = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.ink },
  muted: { fontSize: 14, color: colors.muted },
  positive: { color: colors.positive, fontWeight: '700' },
  negative: { color: colors.negative, fontWeight: '700' },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: colors.primarySoft },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1 },
  screenInner: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 18, gap: 16 },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12, color: colors.primaryDark, fontWeight: '800' },
  heading: { color: colors.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.7 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: { backgroundColor: colors.primarySoft },
  button_danger: { backgroundColor: '#FCE9E9' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  label: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: '#fff', color: colors.ink, paddingHorizontal: 13, fontSize: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  mutedCenter: { color: colors.muted, textAlign: 'center', maxWidth: 440, lineHeight: 20 },
});

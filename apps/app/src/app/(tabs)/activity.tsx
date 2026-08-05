import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { formatMoney } from '@fairshare/shared';
import { Button, Card, EmptyState, Field, Heading, Screen, ui } from '@/components/ui';
import { api } from '@/lib/api';

type SearchResult = { id: string; groupId: string; groupName: string; description: string; category: string; amountMinor: number; currency: string; incurredAt: string };

export default function ActivityScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (query.trim().length < 2) return;
    setResults(await api<SearchResult[]>(`/search?q=${encodeURIComponent(query.trim())}`));
    setSearched(true);
  };

  return <Screen>
    <Heading eyebrow="Find any expense">Search & activity</Heading>
    <Card><Field label="Search descriptions, notes, or categories" value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="Hotel, groceries, taxi…" returnKeyType="search" /><Button title="Search" onPress={search} /></Card>
    {searched && results.length === 0 ? <EmptyState title="Nothing found" body="Try a merchant, expense description, note, or category." /> : results.map((item) => <Card key={item.id}><View style={ui.between}><View style={{ flex: 1, gap: 3 }}><Text style={ui.title}>{item.description}</Text><Text style={ui.muted}>{item.groupName} · {item.category} · {new Date(item.incurredAt).toLocaleDateString()}</Text></View><Text style={ui.body}>{formatMoney(item.amountMinor, item.currency)}</Text></View></Card>)}
  </Screen>;
}

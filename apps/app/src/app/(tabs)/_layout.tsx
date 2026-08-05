import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

const Icon = ({ symbol, color }: { symbol: string; color: string }) => <Text style={{ fontSize: 19, color }}>{symbol}</Text>;

export default function TabLayout() {
  const { user, loading } = useAuth();
  if (!loading && !user) return <Redirect href="/(auth)/sign-in" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primaryDark, tabBarInactiveTintColor: colors.muted, tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Icon symbol="⌂" color={color} /> }} />
      <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: ({ color }) => <Icon symbol="◎" color={color} /> }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: ({ color }) => <Icon symbol="≡" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Icon symbol="⚙" color={color} /> }} />
    </Tabs>
  );
}

import React from 'react';
import { Redirect } from 'expo-router';
import { Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <Screen><Loading /></Screen>;
  return <Redirect href={user ? '/(tabs)' : '/(auth)/sign-in'} />;
}

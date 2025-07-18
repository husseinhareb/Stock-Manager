// app/(tabs)/_layout.tsx
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function TabLayout() {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  return (
    <Tabs
      initialRouteName="china"
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: theme.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarStyle: { backgroundColor: theme.card },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.text,
      }}
    >
      <Tabs.Screen
        name="china"
        options={{
          title: 'China',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <FontAwesome name="archive" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="brazil"
        options={{
          title: 'Brazil',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <FontAwesome name="cubes" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="client"
        options={{
          title: 'Client',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <FontAwesome name="user-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <FontAwesome name="map" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

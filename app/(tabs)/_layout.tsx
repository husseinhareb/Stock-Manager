// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: { position: 'absolute' },
          default: {},
        }),
      }}>
      <Tabs.Screen
        name="china"
        options={{
          title: 'China Stock',
          tabBarIcon: ({ color }) => <IconSymbol name="cube.fill" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="brazil"
        options={{
          title: 'Brazil Stock',
          tabBarIcon: ({ color }) => <IconSymbol name="cube" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Brazil Map',
          tabBarIcon: ({ color }) => <IconSymbol name="map.fill" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}

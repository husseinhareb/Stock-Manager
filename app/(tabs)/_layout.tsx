// app/(tabs)/_layout.tsx
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from '@hooks/useColorScheme';
import { Colors } from '@constants/Colors';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const theme = Colors[scheme];

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
        options={{ title: t('screens.china'), tabBarIcon: ({ color, size }) => <FontAwesome name="archive" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="brazil"
        options={{ title: t('screens.brazil'), tabBarIcon: ({ color, size }) => <FontAwesome name="cubes" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="client"
        options={{ title: t('screens.client'), tabBarIcon: ({ color, size }) => <FontAwesome name="user-circle" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: t('screens.map'), tabBarIcon: ({ color, size }) => <FontAwesome name="map" size={size} color={color} /> }}
      />
    </Tabs>
  );
}

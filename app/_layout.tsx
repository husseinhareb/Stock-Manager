// app/_layout.tsx
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { Drawer } from 'expo-router/drawer';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function RootLayout() {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <Drawer
      initialRouteName="(tabs)"
      screenOptions={{
        headerShown: true,                // show header so the hamburger appears
        headerTitleAlign: 'center',
        drawerStyle: { width: 240 },
        drawerActiveTintColor: theme.primary,
        drawerInactiveTintColor: theme.text,
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          title: 'Home',
          drawerIcon: ({ color, size }) => (
            <FontAwesome name="home" size={size} color={color} />
          ),
        }}
      />
      {/* You can add more drawer screens here */}
      <Drawer.Screen
        name="settings"
        options={{
          title: 'Settings',
          drawerIcon: ({ color, size }) => (
            <FontAwesome name="cog" size={size} color={color} />
          ),
        }}
      />
    </Drawer>
  );
}

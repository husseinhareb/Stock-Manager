// app/_layout.tsx
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { Drawer } from 'expo-router/drawer';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  return (
    <Drawer
      initialRouteName="(tabs)"
      screenOptions={{
        headerShown: true,                 // show header for hamburger
        headerStyle: { backgroundColor: theme.primary },
        headerTintColor: '#fff',           // icon/text in header
        headerTitleStyle: { fontWeight: 'bold' },
        drawerStyle: { backgroundColor: theme.card },
        drawerActiveTintColor: theme.accent,
        drawerInactiveTintColor: theme.text,
        drawerLabelStyle: { fontSize: 16 },
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

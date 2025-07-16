// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="china"
        options={{
          title: 'China',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="archive" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="brazil"
        options={{
          title: 'Brazil',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="cubes" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="shopping-cart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="map" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

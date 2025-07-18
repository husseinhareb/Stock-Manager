// app/(tabs)/_layout.tsx
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="china"
      screenOptions={{ headerShown: false }}
    >
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
        name="client"
        options={{
          title: 'Client',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="user-circle" size={size} color={color} />
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

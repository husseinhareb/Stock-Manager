// app/settings.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? 'light'];

  const [notifications, setNotifications] = useState(false);
  const [darkMode, setDarkMode] = useState(scheme === 'dark');

  const toggleNotifications = (val: boolean) => {
    setNotifications(val);
    // TODO: wire up real notification settings
  };

  const toggleDarkMode = (val: boolean) => {
    setDarkMode(val);
    // TODO: persist this to your theme context or store
  };

  const signOut = () => {
    Alert.alert('Sign Out', 'You have been signed out.');
    // TODO: hook into your auth / navigation
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* CONTENT */}
      <View style={styles.content}>
        {/* Notifications */}
        <View style={[styles.row, { borderColor: theme.border }]}>
          <MaterialIcons name="notifications" size={24} color={theme.accent} style={styles.icon} />
          <Text style={[styles.label, { color: theme.text }]}>Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={toggleNotifications}
            trackColor={{ true: theme.accent, false: theme.border }}
            thumbColor={notifications ? theme.primary : theme.text}
          />
        </View>

        {/* Dark Mode */}
        <View style={[styles.row, { borderColor: theme.border }]}>
          <MaterialIcons name="brightness-6" size={24} color={theme.accent} style={styles.icon} />
          <Text style={[styles.label, { color: theme.text }]}>Dark Mode</Text>
          <Switch
            value={darkMode}
            onValueChange={toggleDarkMode}
            trackColor={{ true: theme.accent, false: theme.border }}
            thumbColor={darkMode ? theme.primary : theme.text}
          />
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          onPress={signOut}
          style={[styles.row, { borderColor: theme.border }]}
        >
          <MaterialIcons name="logout" size={24} color={theme.accent} style={styles.icon} />
          <Text style={[styles.label, { color: theme.text }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 16,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  icon: {
    marginRight: 16,
  },
  label: {
    flex: 1,
    fontSize: 16,
  },
});

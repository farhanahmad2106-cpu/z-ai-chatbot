import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const BACKEND_URL = 'http://10.0.2.2:8765'; // LAN emulator endpoint

interface Summary {
  total_conversations: number;
  total_messages: number;
  active_flags: number;
  system_status: string;
}

interface FeatureFlag {
  id: string;
  flag_key: string;
  is_enabled: boolean;
  description: string | null;
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const handleAuthorize = async () => {
    if (!apiKey.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/admin/summary`, {
        headers: { 'X-Admin-Key': apiKey.trim() }
      });
      if (res.ok) {
        setIsAuthorized(true);
        loadData(apiKey.trim());
      } else {
        Alert.alert('Access Denied', 'Invalid Admin API Key.');
      }
    } catch (e) {
      Alert.alert('Connection Failed', 'Local secure FastAPI server is unreachable.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadData = async (key: string) => {
    try {
      const sumRes = await fetch(`${BACKEND_URL}/api/v1/admin/summary`, {
        headers: { 'X-Admin-Key': key }
      });
      if (sumRes.ok) setSummary(await sumRes.json());

      const flagRes = await fetch(`${BACKEND_URL}/api/v1/admin/feature-flags`, {
        headers: { 'X-Admin-Key': key }
      });
      if (flagRes.ok) setFlags(await flagRes.json());

      const logRes = await fetch(`${BACKEND_URL}/api/v1/admin/diagnostics/logs`, {
        headers: { 'X-Admin-Key': key }
      });
      if (logRes.ok) setLogs(await logRes.json());
    } catch (e) {}
  };

  const handleToggle = async (flagKey: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/admin/feature-flags/${flagKey}/toggle`, {
        method: 'POST',
        headers: { 'X-Admin-Key': apiKey }
      });
      if (res.ok) {
        loadData(apiKey);
      }
    } catch (e) {
      Alert.alert('Error', 'Toggling failed.');
    }
  };

  if (!isAuthorized) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar style="light" />
        <View style={styles.loginCard}>
          <Text style={styles.logo}>Z-AI ADMIN PORTAL</Text>
          <Text style={styles.logoSub}>Authorize access to local systems metrics</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Enter X-Admin-Key..."
            placeholderTextColor="#6b7280"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
          />

          <TouchableOpacity style={styles.btn} onPress={handleAuthorize} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.btnText}>ACCESS DASHBOARD</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Z-AI MOBILE ADMIN</Text>
        <TouchableOpacity style={styles.lockBtn} onPress={() => setIsAuthorized(false)}>
          <Text style={styles.lockBtnText}>LOCK</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Core telemetry */}
        <View style={styles.grid}>
          <View style={styles.gridCard}>
            <Text style={styles.gridLabel}>SYSTEM STATUS</Text>
            <Text style={[styles.gridVal, { color: '#10b981' }]}>{summary?.system_status || 'ONLINE'}</Text>
          </View>
          <View style={styles.gridCard}>
            <Text style={styles.gridLabel}>CONVERSATIONS</Text>
            <Text style={styles.gridVal}>{summary?.total_conversations ?? 0}</Text>
          </View>
          <View style={styles.gridCard}>
            <Text style={styles.gridLabel}>MESSAGE TURNS</Text>
            <Text style={styles.gridVal}>{summary?.total_messages ?? 0}</Text>
          </View>
          <View style={styles.gridCard}>
            <Text style={styles.gridLabel}>ACTIVE FLAGS</Text>
            <Text style={styles.gridVal}>{summary?.active_flags ?? 0}</Text>
          </View>
        </View>

        {/* Feature Flags */}
        <Text style={styles.secHeader}>REMOTE FEATURE FLAGS</Text>
        {flags.map((flag) => (
          <View key={flag.id} style={styles.flagCard}>
            <View style={styles.flagInfo}>
              <Text style={styles.flagKey}>{flag.flag_key}</Text>
              <Text style={styles.flagDesc}>{flag.description || 'No description provided.'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: flag.is_enabled ? '#ef4444' : '#10b981' }]}
              onPress={() => handleToggle(flag.flag_key)}
            >
              <Text style={styles.toggleBtnText}>{flag.is_enabled ? 'DISABLE' : 'ENABLE'}</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Diagnostics logs */}
        <Text style={styles.secHeader}>SERVER DIAGNOSTICS WARNINGS</Text>
        {logs.map((log, idx) => (
          <View key={idx} style={styles.logCard}>
            <Text style={styles.logMeta}>[{log.level}] - {log.timestamp.split('T')[1]}</Text>
            <Text style={styles.logMsg}>{log.message}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1,
    backgroundColor: '#030303',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loginCard: {
    width: '100%',
    backgroundColor: '#0a0a0c',
    borderWidth: 1.5,
    borderColor: '#1f2025',
    padding: 24,
    gap: 16,
  },
  logo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 1,
  },
  logoSub: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    height: 42,
    borderWidth: 1.5,
    borderColor: '#1f2025',
    backgroundColor: '#030303',
    paddingHorizontal: 12,
    color: '#ffffff',
    fontSize: 13.5,
  },
  btn: {
    height: 42,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12.5,
  },
  safe: {
    flex: 1,
    backgroundColor: '#030303',
  },
  header: {
    height: 56,
    borderBottomWidth: 1.5,
    borderColor: '#1f2025',
    backgroundColor: '#0a0a0c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  lockBtn: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  lockBtnText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#0a0a0c',
    borderWidth: 1.5,
    borderColor: '#1f2025',
    padding: 14,
    gap: 8,
  },
  gridLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#9ca3af',
  },
  gridVal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  secHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#9ca3af',
    letterSpacing: 1,
    marginTop: 8,
  },
  flagCard: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0c',
    borderWidth: 1.5,
    borderColor: '#1f2025',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flagInfo: {
    flex: 1,
    paddingRight: 12,
  },
  flagKey: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  flagDesc: {
    fontSize: 11.5,
    color: '#9ca3af',
    marginTop: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  logCard: {
    backgroundColor: '#0a0a0c',
    borderWidth: 1.5,
    borderColor: '#1f2025',
    padding: 12,
    gap: 4,
  },
  logMeta: {
    fontSize: 10.5,
    color: '#9ca3af',
    fontFamily: 'System',
    fontWeight: '600',
  },
  logMsg: {
    fontSize: 12,
    color: '#ffffff',
    lineHeight: 16,
  }
});

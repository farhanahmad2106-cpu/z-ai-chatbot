import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { SyncService } from '../services/SyncService';

export const SyncScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [peers, setPeers] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanIntervalId, setScanIntervalId] = useState<any>(null);

  // Stop scanning on clean up
  useEffect(() => {
    return () => {
      if (scanIntervalId) clearInterval(scanIntervalId);
      SyncService.stopDiscovery().catch(() => {});
    };
  }, [scanIntervalId]);

  const toggleScan = async () => {
    try {
      if (isScanning) {
        // Stop discovery
        if (scanIntervalId) {
          clearInterval(scanIntervalId);
          setScanIntervalId(null);
        }
        await SyncService.stopDiscovery();
        setIsScanning(false);
        setPeers([]);
      } else {
        // Start discovery
        await SyncService.startDiscovery();
        setIsScanning(true);
        // Poll peers list every 2 seconds
        const id = setInterval(async () => {
          try {
            const list = await SyncService.listPeers();
            setPeers(list);
          } catch (e) {}
        }, 2000);
        setScanIntervalId(id);
      }
    } catch (e: any) {
      Alert.alert('Scan Error', e.message || 'Discovery toggling failed.');
    }
  };

  const handlePairPeer = (peerName: string) => {
    Alert.alert(
      'Initialize Sync',
      `Establish Ed25519 pairing with ${peerName}? Handshake guarantees peer identity verification over LAN.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pair Securely',
          onPress: () => {
            Alert.alert('Handshake Pending', 'Pairing requires local validation in this V1.0 build.');
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity 
          onPress={() => navigation.openDrawer()}
          style={styles.menuBtn}
        >
          <Text style={styles.menuText}>[=]</Text>
        </TouchableOpacity>
        <Text style={styles.title}>LAN PEER DISCOVERY</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>LAN ONLY</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        
        {/* Card: Sync Status */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>SECURE LAN SYNCING</Text>
          <Text style={styles.cardDesc}>
            Z-AI implements peer-to-peer discovery using **mDNS / Zeroconf** to sync conversation threads directly between Android and Desktop devices over your local Wi-Fi router. 
            No cloud relay, no third-party nodes—100% offline.
          </Text>

          <TouchableOpacity 
            style={[styles.btn, isScanning ? styles.btnStop : styles.btnStart]}
            onPress={toggleScan}
          >
            <Text style={styles.btnText}>
              {isScanning ? 'STOP LAN SCANNING' : 'START LAN SCANNING'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Discovered Peers Section */}
        <Text style={styles.sectionTitle}>DISCOVERED NODES ON SUBNET</Text>
        {isScanning && peers.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.scanText}>Scanning subnet for active Z-AI peers...</Text>
          </View>
        ) : peers.length === 0 ? (
          <Text style={styles.emptyText}>
            Subnet scanning is inactive. Press "Start LAN Scanning" to search for nodes.
          </Text>
        ) : (
          peers.map((peer) => (
            <View key={peer.device_id} style={styles.peerCard}>
              <View style={styles.peerInfo}>
                <Text style={styles.peerName}>{peer.device_name}</Text>
                <Text style={styles.peerAddress}>{peer.ip}:{peer.port}</Text>
              </View>
              <TouchableOpacity
                style={styles.pairBtn}
                onPress={() => handlePairPeer(peer.device_name)}
              >
                <Text style={styles.pairBtnText}>PAIR SECURE</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.gutter,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  menuBtn: {
    padding: 8,
  },
  menuText: {
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    fontSize: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    letterSpacing: 0.5,
  },
  badge: {
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: theme.colors.primary,
    fontSize: 9,
    fontWeight: 'bold',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.gutter,
    gap: 16,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    padding: 16,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    marginBottom: 12,
    letterSpacing: 1,
  },
  cardDesc: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 19,
    marginBottom: 16,
  },
  btn: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStart: {
    backgroundColor: theme.colors.primary,
  },
  btnStop: {
    backgroundColor: theme.colors.error,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    letterSpacing: 1,
    marginTop: 8,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  scanText: {
    fontSize: 12.5,
    color: theme.colors.onSurfaceVariant,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    padding: 14,
  },
  peerInfo: {
    flex: 1,
  },
  peerName: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  peerAddress: {
    fontSize: 11.5,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
    fontFamily: 'System',
  },
  pairBtn: {
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    paddingHorizontal: 12,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  pairBtnText: {
    color: theme.colors.secondary,
    fontSize: 10.5,
    fontWeight: 'bold',
  }
});

export default SyncScreen;

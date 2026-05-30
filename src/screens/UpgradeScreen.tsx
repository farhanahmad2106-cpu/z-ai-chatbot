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

export const UpgradeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [licenseExpire, setLicenseExpire] = useState<string | null>(null);

  const fetchLicenseStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8765/api/v1/billing/status', {
        headers: {
          'Authorization': `Bearer ${useChatStoreStateToken()}` // Fetches token from state
        }
      });
      // Fallback fallback if state is complex: query through basic fetch
      const res = await fetch('http://localhost:8765/api/v1/billing/status');
      // For this build, fetch status using standard API
      const data = await response.json();
      setIsPremium(data.is_premium);
      setLicenseExpire(data.license_expires_at);
    } catch (e) {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to fetch token
  const useChatStoreStateToken = () => {
    try {
      const state = require('../stores/useAuthStore').useAuthStore.getState();
      return state.token || '';
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
  }, []);

  const handleCheckout = async (gateway: 'stripe' | 'razorpay') => {
    setIsLoading(true);
    try {
      const token = useChatStoreStateToken();
      const res = await fetch('http://localhost:8765/api/v1/billing/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          gateway: gateway,
          transaction_id: `tx_${Math.random().toString(36).substring(2, 10)}`,
          signature: `sig_${Math.random().toString(36).substring(2, 18)}${Math.random().toString(36).substring(2, 18)}`
        })
      });

      if (res.ok) {
        Alert.alert('Upgrade Successful!', 'Z-AI Premium activated! All advanced models and LAN tunnels are fully unlocked.');
        const data = await res.json();
        setIsPremium(data.is_premium);
        setLicenseExpire(data.license_expires_at);
      } else {
        Alert.alert('Payment Failed', 'Verification signature rejected.');
      }
    } catch (e) {
      Alert.alert('Checkout Offline', 'Payment gateway is unreachable.');
    } finally {
      setIsLoading(false);
    }
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
        <Text style={styles.title}>LICENSING & UPGRADES</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{isPremium ? 'PREMIUM' : 'FREE TIER'}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        
        {isPremium ? (
          /* Premium Active State */
          <View style={styles.premiumCard}>
            <Text style={styles.premiumTitle}>🏆 Z-AI PREMIUM UNLOCKED</Text>
            <Text style={styles.premiumDesc}>
              Thank you for supporting offline-first, local-first artificial intelligence! Your secure device instance has full licensing access.
            </Text>
            <View style={styles.licenseInfo}>
              <Text style={styles.licenseLabel}>License Valid Until:</Text>
              <Text style={styles.licenseVal}>
                {licenseExpire ? new Date(licenseExpire).toLocaleDateString() : 'Lifetime Unlocked'}
              </Text>
            </View>
          </View>
        ) : (
          /* Free Upgrade Grid */
          <>
            <View style={styles.card}>
              <Text style={styles.cardHeader}>UNLOCK LOCAL SUPERPOWERS</Text>
              <Text style={styles.cardDesc}>
                Upgrade to **Z-AI Premium** to unleash the full potential of offline local AI model architectures on your hardware.
              </Text>

              {/* Comparison list */}
              <View style={styles.benefitRow}>
                <Text style={styles.bullet}>✓</Text>
                <Text style={styles.benefitText}>Advanced 7B+ Parameters local models (Mistral, Llama-3)</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.bullet}>✓</Text>
                <Text style={styles.benefitText}>Multi-device secure Ed25519 LAN synchronization tunnels</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={styles.bullet}>✓</Text>
                <Text style={styles.benefitText}>Automatic background backup intervals and pruning scheduling</Text>
              </View>
            </View>

            {/* Billing Packages */}
            <Text style={styles.secHeader}>SELECT PAYMENT GATEWAY</Text>
            <View style={styles.billingGrid}>
              
              {/* Stripe */}
              <View style={styles.billingCard}>
                <Text style={styles.gatewayName}>STRIPE CHECKOUT</Text>
                <Text style={styles.price}>$9.99 / one-time</Text>
                <Text style={styles.billingDesc}>Global payment processing. Supports all international credit/debit cards.</Text>
                <TouchableOpacity 
                  style={[styles.payBtn, styles.stripeBtn]} 
                  onPress={() => handleCheckout('stripe')}
                  disabled={isLoading}
                >
                  <Text style={styles.payBtnText}>UPGRADE WITH STRIPE</Text>
                </TouchableOpacity>
              </View>

              {/* Razorpay */}
              <View style={styles.billingCard}>
                <Text style={styles.gatewayName}>RAZORPAY INDIA</Text>
                <Text style={styles.price}>₹820 / one-time</Text>
                <Text style={styles.billingDesc}>Optimized for India. Supports UPI (GPay, PhonePe), NetBanking & Cards.</Text>
                <TouchableOpacity 
                  style={[styles.payBtn, styles.razorpayBtn]} 
                  onPress={() => handleCheckout('razorpay')}
                  disabled={isLoading}
                >
                  <Text style={styles.payBtnText}>UPGRADE WITH UPI</Text>
                </TouchableOpacity>
              </View>

            </View>
          </>
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
  premiumCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    padding: 24,
    gap: 12,
  },
  premiumTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: theme.colors.secondary,
  },
  premiumDesc: {
    fontSize: 13.5,
    color: theme.colors.onSurface,
    lineHeight: 20,
  },
  licenseInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
    marginTop: 8,
  },
  licenseLabel: {
    fontSize: 12.5,
    color: theme.colors.onSurfaceVariant,
  },
  licenseVal: {
    fontSize: 12.5,
    color: theme.colors.secondary,
    fontWeight: 'bold',
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
    fontSize: 13.5,
    color: theme.colors.onSurface,
    lineHeight: 20,
    marginBottom: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  bullet: {
    color: theme.colors.secondary,
    fontWeight: 'bold',
    marginRight: 10,
    fontSize: 14,
  },
  benefitText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 18,
    flex: 1,
  },
  secHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    letterSpacing: 1,
    marginTop: 8,
  },
  billingGrid: {
    gap: 16,
  },
  billingCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    padding: 16,
    gap: 8,
  },
  gatewayName: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  billingDesc: {
    fontSize: 12.5,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 8,
  },
  payBtn: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripeBtn: {
    backgroundColor: theme.colors.primary,
  },
  razorpayBtn: {
    backgroundColor: theme.colors.secondary,
  },
  payBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  }
});

export default UpgradeScreen;

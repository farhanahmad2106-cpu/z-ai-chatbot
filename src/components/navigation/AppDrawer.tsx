import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert
} from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { theme } from '../../theme';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { SystemMetrics } from '../chat/SystemMetrics';
import { Button } from '../common/Button';
import { apiClient } from '../../services/apiClient';

export const AppDrawer: React.FC<DrawerContentComponentProps> = (props) => {
  const { navigation } = props;
  
  const {
    conversations,
    currentConversationId,
    loadConversations,
    selectConversation,
    startNewConversation,
    deleteConversation,
    isGenerating
  } = useChatStore();

  const { lock } = useAuthStore();

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  const handleStartNewChat = async () => {
    if (isGenerating) {
      Alert.alert('Inference Active', 'Please wait for response to finish or stop generation.');
      return;
    }
    await startNewConversation('New Chat');
    navigation.closeDrawer();
  };

  const handleSelectConv = async (id: string) => {
    if (isGenerating) return;
    await selectConversation(id);
    navigation.navigate('ChatHome', { conversationId: id });
    navigation.closeDrawer();
  };

  const handleDeleteConv = (id: string, title: string) => {
    Alert.alert(
      'Delete Conversation',
      `Are you sure you want to delete "${title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteConversation(id);
          }
        }
      ]
    );
  };

  const handleLockApp = async () => {
    try {
      // Call local backend lock endpoint
      await apiClient.post('/api/v1/auth/lock');
    } catch (e) {
      // Fallback: local store lock
    }
    lock();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Unlock' }],
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoText}>Z-AI CHATBOT</Text>
          <Text style={styles.versionText}>v1.0 (Local-First)</Text>
        </View>

        {/* Action Button */}
        <TouchableOpacity style={styles.newChatBtn} onPress={handleStartNewChat}>
          <Text style={styles.newChatBtnText}>+ START NEW CHAT</Text>
        </TouchableOpacity>

        {/* Scrollable Conversation List */}
        <Text style={styles.sectionHeader}>CONVERSATIONS</Text>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          {conversations.length === 0 ? (
            <Text style={styles.emptyText}>No recent chats</Text>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === currentConversationId;
              return (
                <View key={conv.id} style={[styles.convRow, isActive && styles.convRowActive]}>
                  <TouchableOpacity
                    style={styles.convItem}
                    onPress={() => handleSelectConv(conv.id)}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.convItemText, isActive && styles.convItemTextActive]}
                    >
                      {conv.title}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteConv(conv.id, conv.title)}
                  >
                    <Text style={styles.deleteBtnText}>[x]</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Navigation Section */}
        <View style={styles.navSection}>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              navigation.navigate('Dashboard');
              navigation.closeDrawer();
            }}
          >
            <Text style={styles.navItemText}>* System Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              navigation.navigate('Models');
              navigation.closeDrawer();
            }}
          >
            <Text style={styles.navItemText}>* Model Manager</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              navigation.navigate('Settings');
              navigation.closeDrawer();
            }}
          >
            <Text style={styles.navItemText}>* Preferences</Text>
          </TouchableOpacity>
        </View>

        {/* Footer with Telemetry + Lock */}
        <View style={styles.footer}>
          <SystemMetrics cpuUsage={8} ramUsedGB={1.8} ramTotalGB={8.0} />
          
          <Button
            label="SECURE LOCK APP"
            onPress={handleLockApp}
            variant="secondary"
            style={styles.lockBtn}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  container: {
    flex: 1,
    paddingVertical: 12,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  logoText: {
    fontFamily: theme.typography.displayLg.fontFamily,
    fontSize: theme.typography.headlineMd.fontSize,
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    letterSpacing: -0.5,
  },
  versionText: {
    fontSize: 10,
    fontFamily: 'System',
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  newChatBtn: {
    margin: 16,
    height: 44,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatBtnText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    paddingHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    fontStyle: 'italic',
    paddingLeft: 4,
    paddingTop: 8,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 38,
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  convRowActive: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  convItem: {
    flex: 1,
    justifyContent: 'center',
    height: '100%',
  },
  convItemText: {
    fontSize: 13.5,
    color: theme.colors.onSurfaceVariant,
  },
  convItemTextActive: {
    color: theme.colors.onSurface,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    fontSize: 11,
    color: theme.colors.error,
    fontWeight: 'bold',
  },
  navSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
    paddingTop: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  navItem: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  navItemText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
    paddingHorizontal: 16,
    gap: 12,
  },
  lockBtn: {
    height: 38,
  },
});

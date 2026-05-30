import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { ChatBubble } from '../components/chat/ChatBubble';
import { useChatStore } from '../stores/useChatStore';

export const ChatHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const flatListRef = useRef<FlatList>(null);
  const [inputText, setInputText] = useState('');
  const [searchWeb, setSearchWeb] = useState(false);

  const {
    conversations,
    currentConversationId,
    messages,
    isGenerating,
    isLoading,
    activeModelId,
    loadConversations,
    sendMessage,
    stopGeneration
  } = useChatStore();

  // Load conversations and history on start
  useEffect(() => {
    const fetch = async () => {
      await loadConversations();
    };
    fetch();
  }, []);

  // Find active conversation object
  const activeConv = conversations.find(c => c.id === currentConversationId);
  const modelLabel = activeConv?.model_id ? 
    (activeConv.model_id.includes('gemma') ? 'Gemma 2B (Local)' : 'Phi-3 Mini (3.8B)') 
    : 'Local Model';

  const handleSend = async () => {
    if (!inputText.trim() || isGenerating) return;
    const text = inputText.trim();
    setInputText('');
    await sendMessage(text);
  };

  // Memoised renderItem — prevents GC pressure at 24fps token streaming
  const renderItem = useCallback(({ item }: { item: any }) => (
    <ChatBubble
      role={item.role}
      content={item.content}
      timestamp={
        item.created_at
          ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : undefined
      }
    />
  ), []);

  // Scroll to bottom on content changes
  const scrollToBottom = (animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 100);
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {/* Header */}
        <View style={styles.headerBar}>
          <TouchableOpacity 
            onPress={() => navigation.openDrawer()}
            style={styles.menuButton}
          >
            <Text style={styles.menuIconText}>[=]</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{modelLabel}</Text>
            <Text style={styles.dropdownIndicator}>[v]</Text>
          </View>
          <View style={styles.syncBadge}>
            <View style={styles.syncDot} />
            <Text style={styles.syncText}>Sync Secure</Text>
          </View>
        </View>

        {/* Loading Spinner */}
        {isLoading && messages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Decrypting conversations...</Text>
          </View>
        ) : messages.length === 0 ? (
          /* Empty State */
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Secure Offline AI</Text>
            <Text style={styles.emptyDesc}>
              No active session. Write a message below to start your offline-first encrypted query session.
            </Text>
          </View>
        ) : (
          /* Chat List */
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.scrollList}
            onContentSizeChange={() => scrollToBottom(true)}
          />
        )}

        {/* Composer */}
        <View style={styles.composerContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.composerInput}
              placeholder="Write offline message..."
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={inputText}
              onChangeText={setInputText}
              multiline
              editable={!isGenerating}
            />
            {isGenerating ? (
              <TouchableOpacity 
                onPress={stopGeneration}
                style={styles.stopButton}
              >
                <Text style={styles.stopText}>STOP</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                onPress={handleSend}
                style={[styles.sendButton, !inputText.trim() && styles.disabledSendButton]}
                disabled={!inputText.trim()}
              >
                <Text style={styles.sendText}>SEND</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.toolStrip}>
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => setSearchWeb(!searchWeb)}
              style={styles.toggleRow}
            >
              <View style={[styles.checkbox, searchWeb && styles.checkboxActive]} />
              <Text style={styles.toggleText}>Search Web</Text>
            </TouchableOpacity>
            <Text style={styles.nodeStatus}>
              {isGenerating ? 'Generating response...' : 'Node: Local Active'}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardContainer: {
    flex: 1,
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
  menuButton: {
    padding: 8,
  },
  menuIconText: {
    color: theme.colors.onSurface,
    fontFamily: 'System',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: theme.typography.labelSm.fontFamily,
    fontSize: theme.typography.bodyLg.fontSize,
    color: theme.colors.onSurface,
    fontWeight: '600',
  },
  dropdownIndicator: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    marginLeft: 6,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.secondary,
    marginRight: 6,
  },
  syncText: {
    fontFamily: 'System',
    fontSize: 10,
    color: theme.colors.secondary,
    fontWeight: 'bold',
  },
  scrollList: {
    paddingHorizontal: theme.spacing.gutter,
    paddingVertical: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  emptyDesc: {
    fontSize: 13.5,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 19,
  },
  composerContainer: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
    padding: theme.spacing.gutter,
  },
  inputWrapper: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.outline,
    backgroundColor: theme.colors.background,
    borderRadius: 0,
    alignItems: 'flex-end',
  },
  composerInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    color: theme.colors.onBackground,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: theme.typography.bodyLg.fontSize,
    fontFamily: theme.typography.bodyLg.fontFamily,
  },
  sendButton: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
  },
  stopButton: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.colors.error,
  },
  disabledSendButton: {
    backgroundColor: theme.colors.surfaceVariant,
  },
  sendText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  stopText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  toolStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    marginRight: 6,
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  toggleText: {
    fontFamily: 'System',
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
  },
  nodeStatus: {
    fontFamily: 'System',
    fontSize: 10,
    color: theme.colors.secondary,
    fontWeight: 'bold',
  },
});

export default ChatHomeScreen;

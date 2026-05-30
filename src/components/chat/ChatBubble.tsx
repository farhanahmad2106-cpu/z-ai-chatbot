import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { theme } from '../../theme';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  timestamp?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  role,
  content,
  citations = [],
  timestamp,
}) => {
  const isUser = role === 'user';

  return (
    <View style={[styles.bubbleWrapper, isUser ? styles.userAlign : styles.assistantAlign]}>
      <View
        style={[
          styles.baseBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Text 
          selectable 
          style={[styles.baseText, isUser ? styles.userText : styles.assistantText]}
        >
          {content}
        </Text>

        {citations.length > 0 && (
          <View style={styles.citationContainer}>
            <Text style={styles.citationLabel}>Sources:</Text>
            <View style={styles.citationList}>
              {citations.map((citation, index) => (
                <View key={index} style={styles.citationTag}>
                  <Text style={styles.citationText}>
                    [{index + 1}] {citation}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {timestamp && (
          <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.assistantTimestamp]}>
            {timestamp}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bubbleWrapper: {
    marginVertical: 8,
    width: '100%',
    flexDirection: 'row',
  },
  userAlign: {
    justifyContent: 'flex-end',
  },
  assistantAlign: {
    justifyContent: 'flex-start',
  },
  baseBubble: {
    maxWidth: '85%',
    padding: theme.spacing.gutter,
    borderRadius: 0, // Rectilinear, sharp brutalist corners
    borderWidth: 1,
    borderColor: 'transparent',
  },
  userBubble: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.outline,
    borderWidth: 1,
  },
  assistantBubble: {
    backgroundColor: theme.colors.surface,
    borderColor: 'transparent',
    borderWidth: 0,
  },
  baseText: {
    fontSize: theme.typography.bodyLg.fontSize,
    lineHeight: theme.typography.bodyLg.lineHeight,
  },
  userText: {
    color: theme.colors.onBackground,
    textAlign: 'right',
  },
  assistantText: {
    color: theme.colors.onSurface,
    textAlign: 'left',
  },
  citationContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
    paddingTop: 8,
  },
  citationLabel: {
    fontFamily: theme.typography.labelSm.fontFamily,
    fontSize: 10,
    color: theme.colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  citationList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  citationTag: {
    backgroundColor: theme.colors.surfaceVariant,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
  },
  citationText: {
    fontFamily: 'System', // Standard System monospaced or labelSm
    fontSize: 10,
    color: theme.colors.secondary,
  },
  timestamp: {
    fontFamily: 'System',
    fontSize: 10,
    color: theme.colors.onSurfaceVariant,
    marginTop: 6,
  },
  userTimestamp: {
    textAlign: 'right',
  },
  assistantTimestamp: {
    textAlign: 'left',
  },
});

export default ChatBubble;

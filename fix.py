import os

os.system('git checkout App.tsx')

with open('App.tsx', 'r') as f:
    content = f.read()

# 1. Add Convex imports at the top right after react-navigation
import_insertion = '''import { NavigationContainer } from '@react-navigation/native';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { CONVEX_URL } from './convex/convex';

const convex = new ConvexReactClient(CONVEX_URL);'''

content = content.replace(
    'import { NavigationContainer } from \'@react-navigation/native\';',
    import_insertion,
    1
)

# 2. Add ConvexProvider to the return block
old_return = '''export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
          <StatusBar
            barStyle="light-content"
            backgroundColor={theme.colors.background}
            translucent={false}
          />
          <RootNavigator />
        </NavigationContainer>
    </GestureHandlerRootView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}'''

new_return = '''export default function App(): React.JSX.Element {
  return (
    <ConvexProvider client={convex}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer>
            <StatusBar
              barStyle="light-content"
              backgroundColor={theme.colors.background}
              translucent={false}
            />
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ConvexProvider>
  );
}'''

content = content.replace(old_return, new_return)

with open('App.tsx', 'w') as f:
    f.write(content)

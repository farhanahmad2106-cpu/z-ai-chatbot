import os

with open('App.tsx', 'r') as f:
    content = f.read()

return_idx = content.find('  return (')

if return_idx != -1:
    clean_return = '''  return (
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
}
'''
    new_content = content[:return_idx] + clean_return
    with open('App.tsx', 'w') as f:
        f.write(new_content)

with open('App.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { GestureHandlerRootView } from 'react-native-gesture-handler';\n", "", 1)

with open('App.tsx', 'w') as f:
    f.write(content)

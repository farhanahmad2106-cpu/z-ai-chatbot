with open('../src/services/baseUrl.ts', 'r') as f:
    content = f.read()

content = content.replace("return 'http://127.0.0.1:8765';", "return 'http://172.20.10.13:8765';")

with open('../src/services/baseUrl.ts', 'w') as f:
    f.write(content)

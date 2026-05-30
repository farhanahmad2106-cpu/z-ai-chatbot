with open('app/api/auth.py', 'r') as f:
    content = f.read()

content = content.replace(
    'status_code=status.HTTP_204_NO_CONTENT',
    'status_code=status.HTTP_204_NO_CONTENT, response_class=Response'
)

# Also fix the type hint so FastAPI doesn't complain about returning None
content = content.replace(
    ') -> None:',
    ') -> Response:'
)

with open('app/api/auth.py', 'w') as f:
    f.write(content)

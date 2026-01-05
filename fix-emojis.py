import re

with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix all corrupted emojis - these are UTF-8 bytes misread as Windows-1252
# The pattern is recognizable mojibake
replacements = [
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x94\xe2\x80\x99\xc3\xaf\xc2\xb8', '🗑️'.encode('utf-8')),  # trash
    (b'\xc3\xa2\xc5\xa1 \xc3\xaf\xc2\xb8', '⚠️'.encode('utf-8')),  # warning
    (b'\xc3\xa2\xc5\xa1\xc3\xaf\xc2\xb8', '⚠️'.encode('utf-8')),  # warning alt
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9c\xc2\xa5\xc3\xaf\xc2\xb8', '🖥️'.encode('utf-8')),  # desktop
    (b'\xc3\xa2\xc2\xb1\xc3\xaf\xc2\xb8', '⏱️'.encode('utf-8')),  # timer
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9c', '—'.encode('utf-8')),  # em dash
    (b'2\xc3\xaf\xc2\xb8\xc3\xa2\xc6\x92\xc2\xa3', '2️⃣'.encode('utf-8')),  # 2 keycap
]

# Read as bytes
with open('script.js', 'rb') as f:
    content_bytes = f.read()

# Do replacements
for old, new in replacements:
    content_bytes = content_bytes.replace(old, new)

# Write back
with open('script.js', 'wb') as f:
    f.write(content_bytes)

print('Done fixing emojis')

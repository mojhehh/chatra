#!/usr/bin/env python3
# Fix corrupted emojis in walkthrough
import shutil
import sys
import os

# Create backup before modifying
if os.path.exists('script.js'):
    shutil.copy2('script.js', 'script.js.walkthrough.bak')
    print('Backup created: script.js.walkthrough.bak')

try:
    with open('script.js', 'r', encoding='utf-8') as f:
        content = f.read()
except FileNotFoundError as e:
    print(f'Error: Failed to open script.js: {e}')
    sys.exit(1)
except PermissionError as e:
    print(f'Error: Permission denied reading script.js: {e}')
    sys.exit(1)
except OSError as e:
    print(f'Error: Failed to read script.js: {e}')
    sys.exit(1)

# Fix walkthrough emojis
replacements = [
    ('Welcome to Chatra! "', 'Welcome to Chatra! 👋"'),
    ('Group Chats "', 'Group Chats 👥"'),
    ("All Set! ‰", "All Set! 🎉"),
    ('Share Media ðŸ"·', 'Share Media 📷'),
    ('Open the Menu ˜°', 'Open the Menu ☰'),
    ('Direct Messages ðŸ"¨', 'Direct Messages 📨'),
    ('Chat Area ðŸ"œ', 'Chat Area 📜'),
    # Other corrupted emojis in the file
    ('ðŸ"¢', '📢'),
    ('ðŸ–¥ï¸', '🖥️'),
    ('â±ï¸', '⏱️'),
    ('ðŸ"…', '📅'),
    ('â°', '⏰'),
    ('ðŸ"‡', '📇'),
    ('ðŸ•', '🕐'),
    ('ðŸ"', '📍'),
    # Additional patterns
    ('ðŸ"·', '📷'),
    ('ðŸ"¨', '📨'),
    ('ðŸ"œ', '📜'),
]

for old, new in replacements:
    if old in content:
        print(f'Replacing: {repr(old)} -> {repr(new)}')
        content = content.replace(old, new)

try:
    with open('script.js', 'w', encoding='utf-8') as f:
        f.write(content)
except PermissionError as e:
    print(f'Error: Permission denied writing script.js: {e}')
    print('Original file preserved in script.js.walkthrough.bak')
    sys.exit(1)
except OSError as e:
    print(f'Error: Failed to write script.js: {e}')
    print('Original file preserved in script.js.walkthrough.bak')
    sys.exit(1)

print('Done fixing walkthrough emojis!')

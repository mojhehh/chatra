#!/usr/bin/env python3
"""Fix mojibake encoding issues in script.js"""

# Read file as bytes
with open('script.js', 'rb') as f:
    content = f.read()

# Common mojibake patterns (UTF-8 bytes interpreted as CP1252, then re-encoded as UTF-8)
replacements = [
    # â€" -> — (em-dash)
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9c', '—'.encode('utf-8')),
    # â€" (alternative encoding)
    (b'\xe2\x80\x93', '–'.encode('utf-8')),  # en-dash
    # â€¦ -> … (ellipsis)
    (b'\xc3\xa2\xe2\x82\xac\xc2\xa6', '…'.encode('utf-8')),
    # ðŸ˜„ -> 😄 (grinning face)
    (b'\xc3\xb0\xc5\xb8\xcb\x9c\xe2\x80\x9e', '😄'.encode('utf-8')),
    # â€‹ -> zero-width space
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\xb9', '\u200b'.encode('utf-8')),
]

count = 0
for old, new in replacements:
    if old in content:
        occurrences = content.count(old)
        content = content.replace(old, new)
        print(f"Replaced {occurrences} occurrence(s) of {old!r} -> {new!r}")
        count += occurrences

with open('script.js', 'wb') as f:
    f.write(content)

print(f"\nDone! Fixed {count} total replacements.")

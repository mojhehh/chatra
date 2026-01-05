with open('script.js', 'rb') as f:
    content = f.read()

# The new clean patch notes function
new_function = b'''function openPatchNotes() {
        try {
          document.getElementById('patchNotesTitle').textContent = 'Patch Notes - v7.1';
          patchNotesContent.innerHTML = `
            <h4 class="font-semibold text-slate-200">Version 7.1 - January 2026</h4>
            <p class="text-xs text-slate-400">Released: January 3, 2026</p>
            
            <h5 class="font-medium text-sky-400 mt-4 mb-2">New Features</h5>
            <ul class="list-disc pl-5 space-y-1">
                <li><strong>Unban All Button</strong> - Owner-only button to clear all bans, mutes, and hardware bans.</li>
                <li><strong>Hardware Ban System</strong> - Admins can hardware ban users to prevent ban evasion.</li>
                <li><strong>Mod Panel Improvements</strong> - View banned/muted users with usernames, extend bans, manage hardware bans.</li>
            </ul>
            
            <h5 class="font-medium text-emerald-400 mt-4 mb-2">Improvements</h5>
            <ul class="list-disc pl-5 space-y-1">
                <li><strong>Toast Notifications</strong> - All browser alerts replaced with styled in-app toasts.</li>
                <li><strong>DM Buttons</strong> - Delete, edit, and report buttons in DMs now match Global Chat style.</li>
                <li><strong>Expired Bans Auto-Remove</strong> - Expired bans/mutes automatically removed from mod panel.</li>
                <li><strong>Instant Unban</strong> - Unbanning removes users from the list immediately.</li>
            </ul>
            
            <h5 class="font-medium text-rose-400 mt-4 mb-2">Bug Fixes</h5>
            <ul class="list-disc pl-5 space-y-1">
                <li>Fixed corrupted emoji characters throughout the app.</li>
                <li>Fixed bannedEmails permission denied error on login.</li>
                <li>Fixed mod panel not showing usernames for banned users.</li>
            </ul>
            
            <h4 class="font-semibold text-slate-200 mt-6">Previous Updates</h4>
            <details class="text-xs text-slate-400 mt-2">
              <summary class="cursor-pointer hover:text-slate-300">v7.0 - Group Chats</summary>
              <ul class="list-disc pl-5 space-y-1 mt-2">
                <li>Added Group Chat - Create and join group chats with friends.</li>
                <li>Added Group Search - Search groups in real-time.</li>
                <li>Added Online Counter - See how many users are online.</li>
                <li>Added Online Status - Friends list shows who is online.</li>
                <li>Added @AI Mentions - Mention the AI anywhere in your message.</li>
              </ul>
            </details>
            <details class="text-xs text-slate-400 mt-2">
              <summary class="cursor-pointer hover:text-slate-300">v6.0 - Share and Mentions</summary>
              <ul class="list-disc pl-5 space-y-1 mt-2">
                <li>Added Share Button - Share Chatra with friends via link or QR code.</li>
                <li>Added @everyone (Admin) - Admins can mention everyone in global chat.</li>
                <li>Added Timestamps - Messages show time or date below each bubble.</li>
                <li>Slimmer message bubbles for a cleaner look.</li>
              </ul>
            </details>
            <details class="text-xs text-slate-400 mt-2">
              <summary class="cursor-pointer hover:text-slate-300">v5.5 - Walkthrough and Reports</summary>
              <ul class="list-disc pl-5 space-y-1 mt-2">
                <li>Added mentioning others when replying.</li>
                <li>Added an onboarding walkthrough for new users.</li>
                <li>Improved reporting system with inline report flow.</li>
                <li>Fixed touchscreen compatibility (iPad/Safari).</li>
              </ul>
            </details>`;
        } catch (e) {}'''

# Find the old function boundaries
start_marker = b'function openPatchNotes() {'
end_marker = b'} catch (e) {}'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

# Replace
content = content[:start_idx] + new_function + content[end_idx:]

with open('script.js', 'wb') as f:
    f.write(content)

print('Patch notes updated!')

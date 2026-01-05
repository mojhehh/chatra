document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const infoEl = document.getElementById('verify-info');
  const emailEl = document.getElementById('emailDisplay');
  const form = document.getElementById('resetForm');
  const resultEl = document.getElementById('result');

  const params = new URLSearchParams(window.location.search);
  const tokenId = params.get('token');
  if (!tokenId) {
    statusEl.textContent = 'Missing token in the URL.';
    return;
  }

  const workerUrl = window.RECOVERY_WORKER_URL || 'https://recovery-modmojheh.modmojheh.workers.dev';

  try {
    const res = await fetch(workerUrl + '/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId }),
    })
      .then(res => {
        console.log('VERIFY TOKEN', res.status, res.statusText);
        return res;
      })
      .catch(err => {
        console.error('VERIFY TOKEN FAILED', err);
        throw err;
      });
    if (!res.ok) throw new Error('Invalid token');
    
    const tokenData = await res.json();
    if (tokenData.email) {
      emailEl.textContent = tokenData.email;
    }
    statusEl.style.display = 'none';
    infoEl.style.display = '';
    form.style.display = '';

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      resultEl.style.display = 'none';
      const pw = document.getElementById('password').value;
      const conf = document.getElementById('confirm').value;
      if (pw.length < 12 || pw.length > 128) {
        resultEl.textContent = 'Password must be 12-128 characters.';
        resultEl.style.display = '';
        return;
      }
      if (pw !== conf) {
        resultEl.textContent = 'Passwords do not match.';
        resultEl.style.display = '';
        return;
      }

      try {
        const r = await fetch(workerUrl + '/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId, newPassword: pw }),
        })
          .then(res => {
            console.log('RESET PASSWORD', res.status, res.statusText);
            return res;
          })
          .catch(err => {
            console.error('RESET PASSWORD FAILED', err);
            throw err;
          });
        if (!r.ok) {
          const err = await r.text();
          throw new Error(err || 'Reset failed');
        }
        // Safely consume response - ignore JSON parse errors
        try { await r.json(); } catch (_) { /* non-JSON response is fine */ }
        
        resultEl.textContent = 'Password changed successfully.';
        resultEl.style.display = '';
      } catch (e) {
        resultEl.textContent = 'Reset error: ' + (e.message || e);
        resultEl.style.display = '';
      }
    });
  } catch (err) {
    statusEl.textContent = 'Token invalid or expired.';
  }
});

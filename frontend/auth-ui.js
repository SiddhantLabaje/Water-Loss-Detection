'use strict';

async function initializeAccountControls() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      location.replace('/login.html');
      return;
    }
    throw new Error(result.message || 'Unable to verify your account.');
  }

  const { user } = result;
  const footer = document.querySelector('.sb-footer');
  const nav = document.querySelector('.sidebar nav');
  if (!footer || !nav) return;

  const account = document.createElement('div');
  account.className = 'sb-account';
  account.textContent = `${user.name} · ${user.role}`;
  footer.prepend(account);

  if (user.role === 'plumber' && !nav.querySelector('a[href="plumber.html"]')) {
    const workspace = document.createElement('a');
    workspace.href = 'plumber.html';
    workspace.textContent = 'Repair workspace';
    nav.append(workspace);
  }

  const adminOnly = document.querySelector('[data-admin-only]');
  if (adminOnly && user.role !== 'admin') adminOnly.hidden = true;

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'btn btn-ghost';
  logout.textContent = 'Sign out';
  logout.style.width = '100%';
  logout.style.marginTop = '10px';
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      const logoutResponse = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!logoutResponse.ok) throw new Error('Unable to sign out. Please try again.');
      location.replace('/login.html');
    } catch (error) {
      const message = document.createElement('p');
      message.className = 'small';
      message.style.color = 'var(--danger)';
      message.textContent = error.message;
      footer.append(message);
      logout.disabled = false;
    }
  });
  footer.append(logout);
}

initializeAccountControls().catch(error => {
  console.error('Account controls could not be initialized:', error);
  const footer = document.querySelector('.sb-footer');
  if (!footer) return;
  const message = document.createElement('p');
  message.className = 'small';
  message.style.color = 'var(--danger)';
  message.textContent = 'Unable to verify your account. Refresh to try again.';
  footer.append(message);
});

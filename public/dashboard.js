(function dashboardPage() {
  const auth = window.AuthCommon;
  const flash = document.getElementById('flash');
  const emailEl = document.getElementById('userEmail');
  const methodEl = document.getElementById('userMethod');
  const createdAtEl = document.getElementById('userCreatedAt');
  const logoutButton = document.getElementById('logoutButton');

  const session = auth.getAuthSession();
  if (!session || !session.user) {
    auth.setFlash('Please login first.', 'info');
    window.location.href = '/login.html';
    return;
  }

  auth.renderFlash(flash);

  const methodText =
    session.method === 'face'
      ? 'Face'
      : session.method === 'email_password'
        ? 'Email & Password'
        : 'Unknown';

  let createdAtText = '-';
  if (session.user.createdAt) {
    const date = new Date(session.user.createdAt);
    if (!Number.isNaN(date.getTime())) {
      createdAtText = date.toLocaleString();
    }
  }

  emailEl.textContent = session.user.email || '-';
  methodEl.textContent = methodText;
  createdAtEl.textContent = createdAtText;

  logoutButton.addEventListener('click', () => {
    auth.clearAuthSession();
    auth.setFlash('Logged out successfully.', 'info');
    window.location.href = '/';
  });
})();

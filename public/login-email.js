(function emailLoginPage() {
  const auth = window.AuthCommon;
  const form = document.getElementById('emailLoginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const feedback = document.getElementById('feedback');
  const flash = document.getElementById('flash');
  const loginButton = document.getElementById('loginButton');

  auth.renderFlash(flash);

  const params = new URLSearchParams(window.location.search);
  const emailFromQuery = params.get('email');
  if (emailFromQuery) {
    emailInput.value = emailFromQuery;
  } else {
    const pendingEmail = auth.getPendingEmail();
    if (pendingEmail) {
      emailInput.value = pendingEmail;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    auth.hideFeedback(feedback);

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !password) {
      auth.showFeedback(feedback, 'error', 'Email and password are required.');
      return;
    }

    loginButton.disabled = true;

    try {
      const response = await auth.postJson('/api/login/email', { email, password });
      auth.saveAuthSession(response);
      auth.setFlash('Email/password login successful.', 'success');
      window.location.href = '/dashboard.html';
    } catch (error) {
      auth.showFeedback(feedback, 'error', `Login failed: ${error.message}`);
      loginButton.disabled = false;
    }
  });
})();

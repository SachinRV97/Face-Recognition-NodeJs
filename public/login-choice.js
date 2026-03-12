(function loginChoicePage() {
  const auth = window.AuthCommon;
  const flash = document.getElementById('flash');
  const emailLoginLink = document.getElementById('emailLoginLink');

  auth.renderFlash(flash);

  const pendingEmail = auth.getPendingEmail();
  if (pendingEmail) {
    emailLoginLink.href = `/login-email.html?email=${encodeURIComponent(pendingEmail)}`;
  }
})();

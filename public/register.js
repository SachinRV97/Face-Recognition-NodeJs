(function registerPage() {
  const auth = window.AuthCommon;
  const form = document.getElementById('registerForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const fileInput = document.getElementById('faceImage');
  const preview = document.getElementById('facePreview');
  const modelStatus = document.getElementById('modelStatus');
  const feedback = document.getElementById('feedback');
  const submitButton = document.getElementById('registerButton');

  let selectedFile = null;
  let modelsReady = false;
  let submitting = false;

  function updateButtonState() {
    const canSubmit =
      modelsReady &&
      !!selectedFile &&
      emailInput.value.trim().length > 0 &&
      passwordInput.value.length >= 6 &&
      !submitting;

    submitButton.disabled = !canSubmit;
  }

  async function initializeModels() {
    try {
      await auth.ensureFaceModels(modelStatus);
      modelsReady = true;
      updateButtonState();
    } catch (error) {
      auth.setText(modelStatus, `Model load failed: ${error.message}`);
      auth.showFeedback(feedback, 'error', error.message);
    }
  }

  fileInput.addEventListener('change', (event) => {
    selectedFile = event.target.files && event.target.files[0];
    auth.previewImage(selectedFile, preview);
    auth.hideFeedback(feedback);
    updateButtonState();
  });

  emailInput.addEventListener('input', updateButtonState);
  passwordInput.addEventListener('input', updateButtonState);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) {
      return;
    }

    submitting = true;
    updateButtonState();
    auth.hideFeedback(feedback);

    try {
      auth.setText(modelStatus, 'Extracting face descriptor...');
      const descriptor = await auth.descriptorFromFile(selectedFile);

      auth.setText(modelStatus, 'Submitting registration...');
      const email = emailInput.value.trim().toLowerCase();
      const response = await auth.postJson('/api/register', {
        email,
        password: passwordInput.value,
        faceDescriptor: descriptor
      });

      auth.savePendingEmail(email);
      auth.setFlash('Registration successful. Choose your login method.', 'success');
      auth.showFeedback(feedback, 'success', `Registered: ${response.user.email}`);
      auth.setText(modelStatus, 'Registration complete. Redirecting to login...');

      setTimeout(() => {
        window.location.href = '/login.html';
      }, 700);
    } catch (error) {
      auth.showFeedback(feedback, 'error', `Registration failed: ${error.message}`);
      auth.setText(modelStatus, 'Registration failed.');
      submitting = false;
      updateButtonState();
    }
  });

  initializeModels();
})();

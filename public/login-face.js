(function faceLoginPage() {
  const auth = window.AuthCommon;
  const form = document.getElementById('faceLoginForm');
  const fileInput = document.getElementById('faceImage');
  const preview = document.getElementById('facePreview');
  const modelStatus = document.getElementById('modelStatus');
  const feedback = document.getElementById('feedback');
  const submitButton = document.getElementById('faceLoginButton');

  let selectedFile = null;
  let modelsReady = false;
  let submitting = false;

  function updateButtonState() {
    submitButton.disabled = !(modelsReady && selectedFile && !submitting);
  }

  fileInput.addEventListener('change', (event) => {
    selectedFile = event.target.files && event.target.files[0];
    auth.previewImage(selectedFile, preview);
    auth.hideFeedback(feedback);
    updateButtonState();
  });

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

      auth.setText(modelStatus, 'Matching face with registered users...');
      const response = await auth.postJson('/api/login/face', { faceDescriptor: descriptor });

      auth.saveAuthSession(response);
      auth.setFlash(
        `Face login successful (distance: ${response.distance}).`,
        'success'
      );
      window.location.href = '/dashboard.html';
    } catch (error) {
      auth.showFeedback(feedback, 'error', `Face login failed: ${error.message}`);
      auth.setText(modelStatus, 'Face login failed.');
      submitting = false;
      updateButtonState();
    }
  });

  auth
    .ensureFaceModels(modelStatus)
    .then(() => {
      modelsReady = true;
      updateButtonState();
    })
    .catch((error) => {
      auth.setText(modelStatus, `Model load failed: ${error.message}`);
      auth.showFeedback(feedback, 'error', error.message);
    });
})();

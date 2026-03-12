(function registerPage() {
  const auth = window.AuthCommon;
  const form = document.getElementById('registerForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const cameraView = document.getElementById('cameraView');
  const preview = document.getElementById('facePreview');
  const modelStatus = document.getElementById('modelStatus');
  const feedback = document.getElementById('feedback');

  const startCameraButton = document.getElementById('startCameraButton');
  const captureButton = document.getElementById('captureButton');
  const retakeButton = document.getElementById('retakeButton');
  const submitButton = document.getElementById('registerButton');

  let cameraStream = null;
  let modelsReady = false;
  let cameraReady = false;
  let startingCamera = false;
  let submitting = false;
  let capturedCanvas = null;

  function updateButtonState() {
    captureButton.disabled = !(cameraReady && !submitting);
    retakeButton.disabled = !(cameraReady && capturedCanvas && !submitting);

    const canSubmit =
      modelsReady &&
      cameraReady &&
      !!capturedCanvas &&
      emailInput.value.trim().length > 0 &&
      passwordInput.value.length >= 6 &&
      !submitting;

    submitButton.disabled = !canSubmit;
    startCameraButton.disabled = startingCamera || (cameraReady && !submitting);
  }

  async function startCamera() {
    if (cameraReady || startingCamera) {
      return;
    }

    startingCamera = true;
    updateButtonState();
    auth.hideFeedback(feedback);

    try {
      auth.setText(modelStatus, 'Starting camera...');
      cameraStream = await auth.startCamera(cameraView);
      cameraReady = true;
      auth.setText(modelStatus, modelsReady ? 'Ready. Capture your face and register.' : 'Camera ready. Loading models...');
    } catch (error) {
      auth.showFeedback(feedback, 'error', `Camera error: ${error.message}`);
      auth.setText(modelStatus, 'Unable to start camera.');
      cameraReady = false;
    } finally {
      startingCamera = false;
      updateButtonState();
    }
  }

  function captureFace() {
    try {
      const capture = auth.captureFrame(cameraView);
      capturedCanvas = capture.canvas;
      preview.src = capture.dataUrl;
      preview.classList.remove('hidden');
      auth.showFeedback(feedback, 'info', 'Face captured. You can retake if needed.');
      auth.setText(modelStatus, 'Face captured. Submit to register.');
      updateButtonState();
    } catch (error) {
      auth.showFeedback(feedback, 'error', `Capture failed: ${error.message}`);
      auth.setText(modelStatus, 'Capture failed.');
    }
  }

  function retakeFace() {
    capturedCanvas = null;
    preview.removeAttribute('src');
    preview.classList.add('hidden');
    auth.hideFeedback(feedback);
    auth.setText(modelStatus, 'Capture a new face image.');
    updateButtonState();
  }

  async function initializeModels() {
    try {
      await auth.ensureFaceModels(modelStatus);
      modelsReady = true;
      if (cameraReady) {
        auth.setText(modelStatus, 'Ready. Capture your face and register.');
      }
      updateButtonState();
    } catch (error) {
      auth.setText(modelStatus, `Model load failed: ${error.message}`);
      auth.showFeedback(feedback, 'error', error.message);
    }
  }

  startCameraButton.addEventListener('click', startCamera);
  captureButton.addEventListener('click', captureFace);
  retakeButton.addEventListener('click', retakeFace);

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
      const descriptor = await auth.descriptorFromElement(capturedCanvas);

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

  window.addEventListener('beforeunload', () => {
    auth.stopCamera(cameraStream);
  });

  initializeModels();
  startCamera();
})();
(function faceLoginPage() {
  const auth = window.AuthCommon;
  const form = document.getElementById('faceLoginForm');
  const cameraView = document.getElementById('cameraView');
  const modelStatus = document.getElementById('modelStatus');
  const feedback = document.getElementById('feedback');

  const startCameraButton = document.getElementById('startCameraButton');
  const loginButton = document.getElementById('faceLoginButton');

  let cameraStream = null;
  let cameraReady = false;
  let modelsReady = false;
  let startingCamera = false;
  let submitting = false;

  function updateButtonState() {
    loginButton.disabled = !(cameraReady && modelsReady && !submitting);
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
      auth.setText(
        modelStatus,
        modelsReady ? 'Ready. Login directly from the live camera.' : 'Camera ready. Loading models...'
      );
    } catch (error) {
      auth.showFeedback(feedback, 'error', `Camera error: ${error.message}`);
      auth.setText(modelStatus, 'Unable to start camera.');
      cameraReady = false;
    } finally {
      startingCamera = false;
      updateButtonState();
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginButton.disabled) {
      return;
    }

    submitting = true;
    updateButtonState();
    auth.hideFeedback(feedback);

    try {
      auth.setText(modelStatus, 'Capturing live frame...');
      const capturedCanvas = auth.captureFrame(cameraView).canvas;

      auth.setText(modelStatus, 'Extracting face descriptor...');
      const descriptor = await auth.descriptorFromElement(capturedCanvas);

      auth.setText(modelStatus, 'Matching face with registered users...');
      const response = await auth.postJson('/api/login/face', { faceDescriptor: descriptor });

      auth.saveAuthSession(response);
      auth.setFlash(`Face login successful (distance: ${response.distance}).`, 'success');
      window.location.href = '/dashboard.html';
    } catch (error) {
      auth.showFeedback(feedback, 'error', `Face login failed: ${error.message}`);
      auth.setText(modelStatus, 'Face login failed.');
      submitting = false;
      updateButtonState();
    }
  });

  startCameraButton.addEventListener('click', startCamera);

  auth
    .ensureFaceModels(modelStatus)
    .then(() => {
      modelsReady = true;
      if (cameraReady) {
        auth.setText(modelStatus, 'Ready. Login directly from the live camera.');
      }
      updateButtonState();
    })
    .catch((error) => {
      auth.setText(modelStatus, `Model load failed: ${error.message}`);
      auth.showFeedback(feedback, 'error', error.message);
    });

  window.addEventListener('beforeunload', () => {
    auth.stopCamera(cameraStream);
  });

  startCamera();
})();

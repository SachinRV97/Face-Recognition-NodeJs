(function faceLoginPage() {
  const auth = window.AuthCommon;
  const form = document.getElementById('faceLoginForm');
  const cameraView = document.getElementById('cameraView');
  const preview = document.getElementById('facePreview');
  const modelStatus = document.getElementById('modelStatus');
  const feedback = document.getElementById('feedback');

  const startCameraButton = document.getElementById('startCameraButton');
  const captureButton = document.getElementById('captureButton');
  const retakeButton = document.getElementById('retakeButton');
  const submitButton = document.getElementById('faceLoginButton');

  let cameraStream = null;
  let cameraReady = false;
  let modelsReady = false;
  let startingCamera = false;
  let submitting = false;
  let capturedCanvas = null;

  function updateButtonState() {
    captureButton.disabled = !(cameraReady && !submitting);
    retakeButton.disabled = !(cameraReady && capturedCanvas && !submitting);
    submitButton.disabled = !(cameraReady && modelsReady && capturedCanvas && !submitting);
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
      auth.setText(modelStatus, modelsReady ? 'Ready. Capture your face to login.' : 'Camera ready. Loading models...');
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
      auth.setText(modelStatus, 'Face captured. Submit to login.');
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
  captureButton.addEventListener('click', captureFace);
  retakeButton.addEventListener('click', retakeFace);

  auth
    .ensureFaceModels(modelStatus)
    .then(() => {
      modelsReady = true;
      if (cameraReady) {
        auth.setText(modelStatus, 'Ready. Capture your face to login.');
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
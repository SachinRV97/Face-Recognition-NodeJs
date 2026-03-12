const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

const registerEmailInput = document.getElementById('registerEmail');
const registerPasswordInput = document.getElementById('registerPassword');
const registerFaceInput = document.getElementById('registerFaceInput');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const loginFaceInput = document.getElementById('loginFaceInput');

const registerFacePreview = document.getElementById('registerFacePreview');
const loginFacePreview = document.getElementById('loginFacePreview');

const registerBtn = document.getElementById('registerBtn');
const emailLoginBtn = document.getElementById('emailLoginBtn');
const faceLoginBtn = document.getElementById('faceLoginBtn');

const statusEl = document.getElementById('status');
const resultCard = document.getElementById('resultCard');
const resultText = document.getElementById('resultText');

let modelsLoaded = false;
let registerFaceFile;
let loginFaceFile;

function setStatus(message) {
  statusEl.textContent = message;
}

function showResult(message, isError = false) {
  resultText.textContent = message;
  resultCard.classList.remove('hidden');
  resultCard.classList.toggle('error', isError);
}

function updateActionState() {
  const canRegister =
    modelsLoaded &&
    registerFaceFile &&
    registerEmailInput.value.trim() &&
    registerPasswordInput.value.length >= 6;
  const canFaceLogin = modelsLoaded && loginFaceFile;

  registerBtn.disabled = !canRegister;
  faceLoginBtn.disabled = !canFaceLogin;
}

function previewImage(file, imageElement) {
  if (!file) {
    imageElement.removeAttribute('src');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    imageElement.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image.'));
    };
    img.src = objectUrl;
  });
}

async function descriptorFromFile(file) {
  const image = await fileToImage(file);
  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error('No face detected. Use a clear, front-facing photo.');
  }

  return Array.from(detection.descriptor);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response
    .json()
    .catch(() => ({ error: `Unexpected response from ${url}.` }));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

registerEmailInput.addEventListener('input', updateActionState);
registerPasswordInput.addEventListener('input', updateActionState);

registerFaceInput.addEventListener('change', (event) => {
  registerFaceFile = event.target.files[0];
  previewImage(registerFaceFile, registerFacePreview);
  resultCard.classList.add('hidden');
  updateActionState();
});

loginFaceInput.addEventListener('change', (event) => {
  loginFaceFile = event.target.files[0];
  previewImage(loginFaceFile, loginFacePreview);
  resultCard.classList.add('hidden');
  updateActionState();
});

registerBtn.addEventListener('click', async () => {
  registerBtn.disabled = true;
  faceLoginBtn.disabled = true;
  setStatus('Extracting facial descriptor for registration...');

  try {
    const faceDescriptor = await descriptorFromFile(registerFaceFile);
    const payload = {
      email: registerEmailInput.value.trim(),
      password: registerPasswordInput.value,
      faceDescriptor
    };

    setStatus('Submitting registration...');
    const response = await postJson('/api/register', payload);
    showResult(`Registered user: ${response.user.email}`);
    setStatus('Registration complete.');
  } catch (error) {
    showResult(`Registration failed: ${error.message}`, true);
    setStatus('Registration failed.');
  } finally {
    updateActionState();
  }
});

emailLoginBtn.addEventListener('click', async () => {
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  if (!email || !password) {
    showResult('Email and password are required for login.', true);
    return;
  }

  emailLoginBtn.disabled = true;
  setStatus('Verifying email and password...');

  try {
    const response = await postJson('/api/login/email', { email, password });
    showResult(`Email/password login successful for ${response.user.email}.`);
    setStatus('Email/password login successful.');
  } catch (error) {
    showResult(`Email/password login failed: ${error.message}`, true);
    setStatus('Email/password login failed.');
  } finally {
    emailLoginBtn.disabled = false;
    updateActionState();
  }
});

faceLoginBtn.addEventListener('click', async () => {
  faceLoginBtn.disabled = true;
  registerBtn.disabled = true;
  setStatus('Extracting facial descriptor for face login...');

  try {
    const faceDescriptor = await descriptorFromFile(loginFaceFile);
    const response = await postJson('/api/login/face', { faceDescriptor });
    showResult(
      `Face login successful for ${response.user.email} (distance: ${response.distance}).`
    );
    setStatus('Face login successful.');
  } catch (error) {
    showResult(`Face login failed: ${error.message}`, true);
    setStatus('Face login failed.');
  } finally {
    updateActionState();
  }
});

async function loadModels() {
  try {
    setStatus('Loading Tiny Face Detector...');
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

    setStatus('Loading Face Landmark model...');
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);

    setStatus('Loading Face Recognition model...');
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

    modelsLoaded = true;
    setStatus('Models loaded. You can now register or use face login.');
    updateActionState();
  } catch (error) {
    setStatus(`Failed to load models: ${error.message}`);
  }
}

loadModels();
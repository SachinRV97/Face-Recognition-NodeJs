(function initAuthCommon() {
  const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
  const FLASH_KEY = 'face_auth_flash';
  const AUTH_SESSION_KEY = 'face_auth_session';
  const PENDING_EMAIL_KEY = 'face_auth_pending_email';

  let modelLoadPromise = null;

  function setText(element, message) {
    if (!element) {
      return;
    }
    element.textContent = message;
  }

  function showFeedback(element, type, message) {
    if (!element) {
      return;
    }

    element.textContent = message;
    element.classList.remove('hidden', 'info', 'success', 'error');
    element.classList.add('feedback', type);
  }

  function hideFeedback(element) {
    if (!element) {
      return;
    }
    element.textContent = '';
    element.classList.add('hidden');
    element.classList.remove('info', 'success', 'error');
  }

  function setFlash(message, type) {
    const payload = {
      message,
      type: type || 'info'
    };
    sessionStorage.setItem(FLASH_KEY, JSON.stringify(payload));
  }

  function consumeFlash() {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) {
      return null;
    }

    sessionStorage.removeItem(FLASH_KEY);
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.message) {
        return null;
      }
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function renderFlash(element) {
    const flash = consumeFlash();
    if (!flash) {
      hideFeedback(element);
      return;
    }
    showFeedback(element, flash.type, flash.message);
  }

  async function ensureFaceModels(statusElement) {
    if (!window.faceapi) {
      throw new Error('face-api.js failed to load. Check internet connection and reload.');
    }

    if (!modelLoadPromise) {
      modelLoadPromise = (async () => {
        setText(statusElement, 'Loading Tiny Face Detector...');
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

        setText(statusElement, 'Loading Face Landmark model...');
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);

        setText(statusElement, 'Loading Face Recognition model...');
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      })().catch((error) => {
        modelLoadPromise = null;
        throw error;
      });
    }

    await modelLoadPromise;
    setText(statusElement, 'Face models loaded.');
  }

  function previewImage(file, imageElement) {
    if (!imageElement) {
      return;
    }

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
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to read image file.'));
      };

      image.src = objectUrl;
    });
  }

  async function descriptorFromFile(file) {
    if (!file) {
      throw new Error('Please upload a face image.');
    }

    const image = await fileToImage(file);
    const detection = await faceapi
      .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      throw new Error('No face detected. Use a clear, front-facing image.');
    }

    return Array.from(detection.descriptor);
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response
      .json()
      .catch(() => ({ error: `Unexpected response from ${url}.` }));

    if (!response.ok) {
      const details = data.details ? ` (${data.details})` : '';
      throw new Error((data.error || `Request failed (${response.status})`) + details);
    }

    return data;
  }

  function savePendingEmail(email) {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email || '');
  }

  function getPendingEmail() {
    return sessionStorage.getItem(PENDING_EMAIL_KEY) || '';
  }

  function saveAuthSession(apiResponse) {
    const payload = {
      method: apiResponse.method,
      distance: apiResponse.distance || null,
      user: apiResponse.user || null,
      loginAt: new Date().toISOString()
    };
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(payload));
  }

  function getAuthSession() {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function clearAuthSession() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  }

  window.AuthCommon = {
    setText,
    showFeedback,
    hideFeedback,
    setFlash,
    renderFlash,
    ensureFaceModels,
    previewImage,
    descriptorFromFile,
    postJson,
    savePendingEmail,
    getPendingEmail,
    saveAuthSession,
    getAuthSession,
    clearAuthSession
  };
})();

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const DISTANCE_THRESHOLD = 0.6;

const knownInput = document.getElementById('knownInput');
const candidateInput = document.getElementById('candidateInput');
const knownPreview = document.getElementById('knownPreview');
const candidatePreview = document.getElementById('candidatePreview');
const statusEl = document.getElementById('status');
const compareBtn = document.getElementById('compareBtn');
const resultCard = document.getElementById('resultCard');
const resultText = document.getElementById('resultText');

let modelsLoaded = false;
let knownFile;
let candidateFile;

function setStatus(message) {
  statusEl.textContent = message;
}

function updateCompareState() {
  compareBtn.disabled = !(modelsLoaded && knownFile && candidateFile);
}

function previewImage(file, imageElement) {
  const reader = new FileReader();
  reader.onload = () => {
    imageElement.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = URL.createObjectURL(file);
  });
}

async function descriptorFromFile(file) {
  const img = await fileToImage(file);
  const detection = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error('No face detected. Use a clear, front-facing photo.');
  }

  return detection.descriptor;
}

knownInput.addEventListener('change', (event) => {
  knownFile = event.target.files[0];
  if (knownFile) {
    previewImage(knownFile, knownPreview);
  }
  resultCard.classList.add('hidden');
  updateCompareState();
});

candidateInput.addEventListener('change', (event) => {
  candidateFile = event.target.files[0];
  if (candidateFile) {
    previewImage(candidateFile, candidatePreview);
  }
  resultCard.classList.add('hidden');
  updateCompareState();
});

compareBtn.addEventListener('click', async () => {
  compareBtn.disabled = true;
  setStatus('Detecting faces and comparing descriptors...');

  try {
    const [knownDescriptor, candidateDescriptor] = await Promise.all([
      descriptorFromFile(knownFile),
      descriptorFromFile(candidateFile)
    ]);

    const distance = faceapi.euclideanDistance(knownDescriptor, candidateDescriptor);
    const isMatch = distance < DISTANCE_THRESHOLD;

    resultText.textContent = isMatch
      ? `✅ Likely the same person (distance: ${distance.toFixed(4)}).`
      : `❌ Likely different people (distance: ${distance.toFixed(4)}).`;

    resultCard.classList.remove('hidden');
    setStatus('Comparison complete.');
  } catch (error) {
    resultText.textContent = `Error: ${error.message}`;
    resultCard.classList.remove('hidden');
    setStatus('Unable to compare images.');
  } finally {
    updateCompareState();
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
    setStatus('Models loaded. Select two images to compare.');
    updateCompareState();
  } catch (error) {
    setStatus(`Failed to load models: ${error.message}`);
  }
}

loadModels();

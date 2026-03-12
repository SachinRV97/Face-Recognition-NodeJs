const http = require('http');
const fs = require('fs');
const path = require('path');
const { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DISTANCE_THRESHOLD = 0.6;
const PASSWORD_ITERATIONS = 100000;
const PASSWORD_KEYLEN = 64;
const PASSWORD_DIGEST = 'sha512';

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, error.code === 'ENOENT' ? 404 : 500, {
        error: error.code === 'ENOENT' ? 'Not Found' : 'Server Error'
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function ensureUserStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]', 'utf8');
  }
}

function readUsers() {
  ensureUserStore();

  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeUsers(users) {
  ensureUserStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const maxSize = 2 * 1024 * 1024;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Payload too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', () => reject(new Error('Unable to read request body.')));
  });
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidFaceDescriptor(faceDescriptor) {
  return (
    Array.isArray(faceDescriptor) &&
    faceDescriptor.length === 128 &&
    faceDescriptor.every((value) => typeof value === 'number' && Number.isFinite(value))
  );
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) {
    return false;
  }

  const derivedHash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
  const expectedBuffer = Buffer.from(hash, 'hex');
  const actualBuffer = Buffer.from(derivedHash, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function calculateDistance(firstDescriptor, secondDescriptor) {
  let sum = 0;
  for (let index = 0; index < firstDescriptor.length; index += 1) {
    const difference = firstDescriptor[index] - secondDescriptor[index];
    sum += difference * difference;
  }
  return Math.sqrt(sum);
}

function findBestFaceMatch(users, candidateDescriptor) {
  let bestMatch = null;

  users.forEach((user) => {
    if (!isValidFaceDescriptor(user.faceDescriptor)) {
      return;
    }

    const distance = calculateDistance(user.faceDescriptor, candidateDescriptor);
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { user, distance };
    }
  });

  return bestMatch;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt
  };
}

async function handleApiRoute(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/register') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const faceDescriptor = body.faceDescriptor;

    if (!isValidEmail(email)) {
      sendJson(res, 400, { error: 'Provide a valid email address.' });
      return;
    }

    if (password.length < 6) {
      sendJson(res, 400, { error: 'Password must be at least 6 characters long.' });
      return;
    }

    if (!isValidFaceDescriptor(faceDescriptor)) {
      sendJson(res, 400, { error: 'A valid facial descriptor is required.' });
      return;
    }

    const users = readUsers();
    const alreadyRegistered = users.some((user) => normalizeEmail(user.email) === email);
    if (alreadyRegistered) {
      sendJson(res, 409, { error: 'Email is already registered.' });
      return;
    }

    const passwordData = hashPassword(password);
    const user = {
      id: randomUUID(),
      email,
      passwordSalt: passwordData.salt,
      passwordHash: passwordData.hash,
      faceDescriptor,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    writeUsers(users);

    sendJson(res, 201, {
      message: 'Registration successful.',
      user: sanitizeUser(user)
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/login/email') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      sendJson(res, 400, { error: 'Email and password are required.' });
      return;
    }

    const users = readUsers();
    const user = users.find((item) => normalizeEmail(item.email) === email);
    if (!user) {
      sendJson(res, 401, { error: 'Invalid email or password.' });
      return;
    }

    const passwordOk = verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!passwordOk) {
      sendJson(res, 401, { error: 'Invalid email or password.' });
      return;
    }

    sendJson(res, 200, {
      message: 'Login successful.',
      method: 'email_password',
      user: sanitizeUser(user)
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/login/face') {
    const body = await parseJsonBody(req);
    const faceDescriptor = body.faceDescriptor;

    if (!isValidFaceDescriptor(faceDescriptor)) {
      sendJson(res, 400, { error: 'A valid facial descriptor is required.' });
      return;
    }

    const users = readUsers();
    const bestMatch = findBestFaceMatch(users, faceDescriptor);

    if (!bestMatch || bestMatch.distance > DISTANCE_THRESHOLD) {
      sendJson(res, 401, { error: 'No matching registered face found.' });
      return;
    }

    sendJson(res, 200, {
      message: 'Face login successful.',
      method: 'face',
      distance: Number(bestMatch.distance.toFixed(4)),
      user: sanitizeUser(bestMatch.user)
    });
    return;
  }

  sendJson(res, 404, { error: 'API route not found.' });
}

function safePathFromUrl(pathname) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  return path.normalize(path.join(PUBLIC_DIR, normalizedPath));
}

const server = http.createServer((req, res) => {
  let pathname = '/';

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    sendJson(res, 400, { error: 'Bad Request' });
    return;
  }

  if (pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (pathname.startsWith('/api/')) {
    handleApiRoute(req, res, pathname).catch((error) => {
      const statusCode = error.message === 'Payload too large.' ? 413 : 400;
      sendJson(res, statusCode, { error: error.message || 'Server Error' });
    });
    return;
  }

  const resolvedPath = safePathFromUrl(pathname);
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  sendFile(res, resolvedPath);
});

server.listen(PORT, () => {
  console.log(`Face Recognition app is running at http://localhost:${PORT}`);
});

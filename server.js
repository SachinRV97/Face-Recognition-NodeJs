const http = require('http');
const fs = require('fs');
const path = require('path');
const mssql = require('mssql');
const mssqlMsNode = require('mssql/msnodesqlv8');
const { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const DB_SERVER = process.env.DB_SERVER || '(localdb)\\MSSQLLocalDB';
const DB_USER = process.env.DB_USER || 'sa';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DB_NAME || 'FaceRecognition';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;
const DB_ENCRYPT = process.env.DB_ENCRYPT === 'true';
const DB_TRUST_SERVER_CERT = process.env.DB_TRUST_SERVER_CERT !== 'false';
const DB_DRIVER = (process.env.DB_DRIVER || '').trim().toLowerCase();
const DB_TRUSTED_CONNECTION = process.env.DB_TRUSTED_CONNECTION === 'true';
const LOCAL_DB_PATTERN = /^\(localdb\)\\(.+)$/i;
const localDbMatch = LOCAL_DB_PATTERN.exec(DB_SERVER);
const DB_HOST = localDbMatch ? 'localhost' : DB_SERVER;
const DB_INSTANCE = localDbMatch ? localDbMatch[1] : null;
const USE_MSNODESQLV8 = DB_DRIVER === 'msnodesqlv8' || (!DB_DRIVER && !!localDbMatch);
const sql = USE_MSNODESQLV8 ? mssqlMsNode : mssql;

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

function escapeConnectionStringValue(value) {
  return String(value).replace(/;/g, ';;');
}

function buildMssqlConfig(database) {
  const config = {
    server: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database,
    options: {
      encrypt: DB_ENCRYPT,
      trustServerCertificate: DB_TRUST_SERVER_CERT,
      enableArithAbort: true
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  if (DB_INSTANCE) {
    config.options.instanceName = DB_INSTANCE;
  }

  if (Number.isInteger(DB_PORT) && DB_PORT > 0) {
    config.port = DB_PORT;
  }

  return config;
}

function buildMsNodeSqlConfig(database) {
  const trustedConnection = DB_TRUSTED_CONNECTION || !DB_USER || !DB_PASSWORD;
  const serverName =
    Number.isInteger(DB_PORT) && DB_PORT > 0 && !localDbMatch
      ? `${DB_SERVER},${DB_PORT}`
      : DB_SERVER;

  let connectionString =
    `Driver={ODBC Driver 17 for SQL Server};` +
    `Server=${escapeConnectionStringValue(serverName)};` +
    `Database=${escapeConnectionStringValue(database)};` +
    `Encrypt=${DB_ENCRYPT ? 'Yes' : 'No'};` +
    `TrustServerCertificate=${DB_TRUST_SERVER_CERT ? 'Yes' : 'No'};`;

  if (trustedConnection) {
    connectionString += 'Trusted_Connection=Yes;';
  } else {
    connectionString +=
      `Uid=${escapeConnectionStringValue(DB_USER)};` +
      `Pwd=${escapeConnectionStringValue(DB_PASSWORD)};`;
  }

  return {
    connectionString,
    options: {
      trustedConnection
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

const masterDbConfig = USE_MSNODESQLV8
  ? buildMsNodeSqlConfig('master')
  : buildMssqlConfig('master');
const appDbConfig = USE_MSNODESQLV8 ? buildMsNodeSqlConfig(DB_NAME) : buildMssqlConfig(DB_NAME);

let appPoolPromise = null;
let databaseInitPromise = null;
let databaseInitError = null;

function getErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (typeof error.message === 'string' && error.message !== '[object Object]') {
    return error.message;
  }

  if (error.originalError) {
    return getErrorMessage(error.originalError);
  }

  if (Array.isArray(error.precedingErrors) && error.precedingErrors.length > 0) {
    return getErrorMessage(error.precedingErrors[0]);
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch (jsonError) {
    return String(error);
  }
}

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

function getAppPool() {
  if (!appPoolPromise) {
    const pool = new sql.ConnectionPool(appDbConfig);
    appPoolPromise = pool.connect().catch((error) => {
      appPoolPromise = null;
      throw error;
    });
  }

  return appPoolPromise;
}

async function closeAppPool() {
  if (!appPoolPromise) {
    return;
  }

  try {
    const pool = await appPoolPromise;
    await pool.close();
  } catch (error) {
    // Ignore close errors during shutdown.
  } finally {
    appPoolPromise = null;
  }
}

async function doInitializeDatabase() {
  const masterPool = await new sql.ConnectionPool(masterDbConfig).connect();

  try {
    await masterPool
      .request()
      .input('dbName', sql.NVarChar(128), DB_NAME)
      .query(`
        IF DB_ID(@dbName) IS NULL
        BEGIN
          DECLARE @safeDbName NVARCHAR(258) = N'[' + REPLACE(@dbName, N']', N']]') + N']';
          DECLARE @createSql NVARCHAR(MAX) = N'CREATE DATABASE ' + @safeDbName;
          EXEC(@createSql);
        END
      `);
  } finally {
    await masterPool.close();
  }

  const appPool = await getAppPool();

  await appPool.request().query(`
    IF OBJECT_ID('dbo.Users', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Users (
        Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        Email NVARCHAR(255) NOT NULL,
        PasswordSalt NVARCHAR(128) NOT NULL,
        PasswordHash NVARCHAR(256) NOT NULL,
        FaceDescriptor NVARCHAR(MAX) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    END
  `);

  await appPool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'UX_Users_Email'
        AND object_id = OBJECT_ID('dbo.Users')
    )
    BEGIN
      CREATE UNIQUE INDEX UX_Users_Email ON dbo.Users (Email);
    END
  `);
}

function initializeDatabase() {
  if (!databaseInitPromise) {
    databaseInitPromise = doInitializeDatabase().catch((error) => {
      databaseInitError = error;
      throw error;
    });
  }

  return databaseInitPromise;
}

async function ensureDatabaseReady() {
  if (databaseInitError) {
    throw databaseInitError;
  }

  try {
    await initializeDatabase();
  } catch (error) {
    databaseInitError = error;
    await closeAppPool();
    throw error;
  }
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

function parseFaceDescriptor(value) {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return isValidFaceDescriptor(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function safeIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: safeIsoDate(user.createdAt)
  };
}

async function registerUser(email, password, faceDescriptor) {
  const pool = await getAppPool();

  const existingUser = await pool
    .request()
    .input('email', sql.NVarChar(255), email)
    .query(`
      SELECT TOP 1
        Id AS id
      FROM dbo.Users
      WHERE Email = @email
    `);

  if (existingUser.recordset.length > 0) {
    return { error: 'Email is already registered.', statusCode: 409 };
  }

  const passwordData = hashPassword(password);
  const user = {
    id: randomUUID(),
    email,
    createdAt: new Date()
  };

  try {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, user.id)
      .input('email', sql.NVarChar(255), email)
      .input('passwordSalt', sql.NVarChar(128), passwordData.salt)
      .input('passwordHash', sql.NVarChar(256), passwordData.hash)
      .input('faceDescriptor', sql.NVarChar(sql.MAX), JSON.stringify(faceDescriptor))
      .input('createdAt', sql.DateTime2, user.createdAt)
      .query(`
        INSERT INTO dbo.Users (Id, Email, PasswordSalt, PasswordHash, FaceDescriptor, CreatedAt)
        VALUES (@id, @email, @passwordSalt, @passwordHash, @faceDescriptor, @createdAt)
      `);
  } catch (error) {
    if (error && (error.number === 2601 || error.number === 2627)) {
      return { error: 'Email is already registered.', statusCode: 409 };
    }

    throw error;
  }

  return { user };
}

async function loginByEmail(email, password) {
  const pool = await getAppPool();
  const result = await pool
    .request()
    .input('email', sql.NVarChar(255), email)
    .query(`
      SELECT TOP 1
        Id AS id,
        Email AS email,
        PasswordSalt AS passwordSalt,
        PasswordHash AS passwordHash,
        CreatedAt AS createdAt
      FROM dbo.Users
      WHERE Email = @email
    `);

  const user = result.recordset[0];
  if (!user) {
    return null;
  }

  const passwordOk = verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!passwordOk) {
    return null;
  }

  return user;
}

async function loginByFace(faceDescriptor) {
  const pool = await getAppPool();
  const result = await pool.request().query(`
    SELECT
      Id AS id,
      Email AS email,
      FaceDescriptor AS faceDescriptor,
      CreatedAt AS createdAt
    FROM dbo.Users
  `);

  const users = result.recordset
    .map((record) => ({
      id: record.id,
      email: record.email,
      faceDescriptor: parseFaceDescriptor(record.faceDescriptor),
      createdAt: record.createdAt
    }))
    .filter((user) => user.faceDescriptor);

  const bestMatch = findBestFaceMatch(users, faceDescriptor);
  if (!bestMatch || bestMatch.distance > DISTANCE_THRESHOLD) {
    return null;
  }

  return bestMatch;
}

async function handleApiRoute(req, res, pathname) {
  await ensureDatabaseReady();

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

    const registration = await registerUser(email, password, faceDescriptor);
    if (registration.error) {
      sendJson(res, registration.statusCode, { error: registration.error });
      return;
    }

    sendJson(res, 201, {
      message: 'Registration successful.',
      user: sanitizeUser(registration.user)
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

    const user = await loginByEmail(email, password);
    if (!user) {
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

    const bestMatch = await loginByFace(faceDescriptor);
    if (!bestMatch) {
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
      if (databaseInitError) {
        sendJson(res, 503, {
          error: 'Database unavailable. Verify SQL Server connection settings and restart the app.',
          details: getErrorMessage(databaseInitError)
        });
        return;
      }

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

initializeDatabase()
  .then(() => {
    const driverLabel = USE_MSNODESQLV8 ? 'msnodesqlv8' : 'mssql';
    console.log(`Database ready: ${DB_NAME} on ${DB_SERVER} (driver: ${driverLabel})`);
  })
  .catch((error) => {
    console.error(`Database initialization failed: ${getErrorMessage(error)}`);
    if (localDbMatch && !USE_MSNODESQLV8) {
      console.error('LocalDB note: set DB_DRIVER=msnodesqlv8 for LocalDB connections.');
    }
  });

server.listen(PORT, () => {
  console.log(`Face Recognition app is running at http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  await closeAppPool();
  process.exit(0);
});

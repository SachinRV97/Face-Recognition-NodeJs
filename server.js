const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

function sendFile(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, {
        'Content-Type': 'application/json; charset=UTF-8'
      });
      res.end(
        JSON.stringify({
          error: error.code === 'ENOENT' ? 'Not Found' : 'Server Error'
        })
      );
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const safeUrlPath = req.url === '/' ? '/index.html' : req.url;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, safeUrlPath));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  sendFile(res, resolvedPath);
});

server.listen(PORT, () => {
  console.log(`Face Recognition app is running at http://localhost:${PORT}`);
});

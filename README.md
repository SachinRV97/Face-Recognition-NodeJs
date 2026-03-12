# Face Authentication Node.js App

A lightweight Node.js application that supports user registration and login with:
- `email + password`
- facial recognition using [face-api.js](https://github.com/justadudewhohacks/face-api.js)
- Microsoft SQL Server (`mssql` driver) for user storage

## Features

- Register users with email, password, and a face image.
- Store password hashes and facial descriptors on the server.
- Login with either:
  - email and password
  - face image matching against registered users
- Browser-side face descriptor extraction with `face-api.js`.

## Prerequisites

- Node.js 18+
- SQL Server instance

## Run locally

```bash
npm install
npm start
```

Then open: `http://localhost:3000`

## SQL Server configuration

The server reads these environment variables:

- `DB_SERVER` (default: `(localdb)\\MSSQLLocalDB`)
- `DB_USER` (default: `sa`)
- `DB_PASSWORD` (default: `123456`)
- `DB_NAME` (default: `FaceRecognition`)
- `DB_PORT` (optional)
- `DB_ENCRYPT` (default: `false`)
- `DB_TRUST_SERVER_CERT` (default: `true`)

Example:

```bash
set DB_SERVER=(localdb)\MSSQLLocalDB
set DB_USER=sa
set DB_PASSWORD=123456
set DB_NAME=FaceRecognition
npm start
```

On startup, the app creates the database and `dbo.Users` table if missing.

Note: `LocalDB` often uses Windows Authentication. If SQL login `sa` is disabled in your instance, use a SQL-auth enabled instance (for example `localhost\\SQLEXPRESS`) or update credentials accordingly.

If you see `Port for MSSQLLocalDB not found in localhost`, ensure the LocalDB instance is running or switch to a SQL Server instance that accepts SQL authentication.

## How it works

## Page flow

1. `/`:
- Landing page with navigation to register/login flows.

2. `/register.html`:
- Register using email, password, and face image.
- On success, user is redirected to `/login.html`.

3. `/login.html`:
- Choose login method.

4. `/login-email.html`:
- Login with email and password.

5. `/login-face.html`:
- Login with face image.

6. `/dashboard.html`:
- Displays current logged-in user details.

## Authentication flow

1. Registration:
- Enter email and password.
- Upload a clear, front-facing face image.
- The browser extracts a 128-length facial descriptor and sends it to the server.

2. Login with email and password:
- Enter registered email and password.
- Server validates password hash.

3. Login with face:
- Upload a face image.
- Browser extracts descriptor; server matches with stored users using Euclidean distance.

## Notes

- Model files are loaded from `https://justadudewhohacks.github.io/face-api.js/models`.
- User data is stored in SQL Server table `dbo.Users`.
- Passwords are hashed using PBKDF2 (`sha512`).
- This app is for learning/prototyping and does not include production auth features (sessions/JWT, rate-limiting, MFA, etc).

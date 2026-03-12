# Face Authentication Node.js App

A lightweight Node.js application that supports user registration and login with:
- `email + password`
- facial recognition using [face-api.js](https://github.com/justadudewhohacks/face-api.js)

## Features

- Register users with email, password, and a face image.
- Store password hashes and facial descriptors on the server.
- Login with either:
  - email and password
  - face image matching against registered users
- Browser-side face descriptor extraction with `face-api.js`.

## Prerequisites

- Node.js 18+

## Run locally

```bash
npm install
npm start
```

Then open: `http://localhost:3000`

## How it works

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
- User data is stored in `data/users.json`.
- Passwords are hashed using PBKDF2 (`sha512`).
- This app is for learning/prototyping and does not include production auth features (sessions/JWT, rate-limiting, MFA, etc).

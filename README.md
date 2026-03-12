# Face Recognition Node.js App

A lightweight Node.js application that serves a browser-based face recognition demo using [face-api.js](https://github.com/justadudewhohacks/face-api.js).

## Features

- Upload two images in the browser.
- Detect a single face in each image.
- Compare face embeddings with Euclidean distance.
- Show a match/non-match result.

## Prerequisites

- Node.js 18+

## Run locally

```bash
npm install
npm start
```

Then open: `http://localhost:3000`

## Notes

- Model files are loaded from `https://justadudewhohacks.github.io/face-api.js/models`.
- This demo compares one face per image and is designed for learning/prototyping.

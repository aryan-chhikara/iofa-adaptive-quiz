# IFOA — AI-Driven Adaptive Aviation Quiz
### Assignment 1 | IFOA India AI/ML Development Intern

---

## Overview
An AI-powered adaptive quiz system for Flight Dispatcher training. Questions are generated live by Claude AI and difficulty adjusts dynamically based on the candidate's performance.

## Features
- 10 progressive difficulty levels: Novice → Master Dispatcher
- Live question generation via Claude API
- Topics: Aviation Navigation, Meteorology, EASA Flight Dispatcher
- Adaptive logic: correct → level up (max 10), wrong → level down (min 1)
- Final report with accuracy %, streak, and full question review
- Dark aerospace UI

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Add your Anthropic API key
Edit `.env`:
```
REACT_APP_ANTHROPIC_API_KEY=your_api_key_here
```
Get your key at: https://console.anthropic.com/

### 3. Run
```bash
npm start
# Opens at http://localhost:3000
```

### 4. Build for production
```bash
npm run build
```

## Deploy to Vercel
```bash
npm i -g vercel
vercel
```
Set `REACT_APP_ANTHROPIC_API_KEY` in the Vercel dashboard under Environment Variables.

## Deploy to Netlify
```bash
npm run build
# Drag & drop the build/ folder at app.netlify.com
# Set env variable in Site Settings → Environment Variables
```

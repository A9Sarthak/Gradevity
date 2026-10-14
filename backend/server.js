import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import User from './models/User.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();

// Enable CORS for all domains
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// ------------------------------
// MongoDB Connection & Serverless Caching
// ------------------------------
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gpa_calculator';
let cachedDbPromise = null;

const ensureDbConnected = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!cachedDbPromise) {
    console.log('Connecting to MongoDB...');
    cachedDbPromise = mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    }).then(m => {
      console.log('✅ Connected to MongoDB Backend!');
      return m;
    }).catch(err => {
      cachedDbPromise = null;
      console.error('❌ MongoDB Connection Error:', err.message);
      throw err;
    });
  }

  return cachedDbPromise;
};

// Immediate connection attempt on startup
ensureDbConnected().catch(() => {});

// Middleware to ensure DB connection is ready for incoming requests
app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  try {
    await ensureDbConnected();
    next();
  } catch (err) {
    return res.status(503).json({
      error: 'Database connection failed. Please verify MONGODB_URI is configured properly.',
      details: err.message
    });
  }
});

// ------------------------------
// API Routes (Mounted on both /api and / for full Vercel compatibility)
// ------------------------------
const apiRouter = express.Router();

// Health Check Endpoint
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Screenshot Scanner Route (Gemini OCR)
apiRouter.post('/scan-screenshot', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    console.log('📸 Scan request received. Image size:', imageBase64 ? imageBase64.length : 0, 'bytes');
    if (!imageBase64) return res.status(400).json({ error: "Missing image" });
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "No Gemini Key Configured. Please configure standard environments to utilize this tool!" });
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    
    const prompt = `You are a strict data extractor. Analyze this tabular screenshot of university subject registrations.
Extract each registered course's Basic Name and its assigned Credits (which is always the bottom-most number in the vertical LTPJC matrix or explicitly shown on the same line if single).
Also, identify if it's a lab (contains words like "Lab", "Practice" or code ending in 'P').
Do NOT include course codes (like BITE304L) in the name. Just the plain name. Make sure it is capitalized correctly.
Respond ONLY with a JSON array of objects. Like this:
[{"name": "Web Technologies", "credits": 3.0, "type": "theory"}, {"name": "Software Engineering Lab", "credits": 1.0, "type": "lab"}]`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64.split(',')[1] || imageBase64,
          mimeType: mimeType || "image/jpeg"
        }
      }
    ]);
    
    let jsonStr = result.response.text();
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Parse strictly to validate
    const subjects = JSON.parse(jsonStr);
    
    res.json({ success: true, data: subjects });
  } catch (err) {
    console.error("Gemini AI failed: ", err);
    res.status(500).json({ error: "Gemini Vision completely failed to decode formatting: " + err.message });
  }
});

// Signup Route
apiRouter.post('/auth/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  try {
    const normalizedUsername = username.trim().toLowerCase();
    const existingUser = await User.findOne({ username: normalizedUsername });
    if (existingUser) return res.status(400).json({ error: 'Username already taken.' });

    const newUser = new User({ username: normalizedUsername, password });
    await newUser.save();
    
    res.json({ success: true, message: 'Account created successfully.', gpaData: newUser.gpaData });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup.' });
  }
});

// Login Route
apiRouter.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  try {
    const normalizedUsername = username.trim().toLowerCase();
    const user = await User.findOne({ username: normalizedUsername });
    if (!user) return res.status(404).json({ error: 'User not found. Please sign up.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Incorrect password.' });

    res.json({ success: true, message: 'Logged in successfully.', gpaData: user.gpaData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Load User Data Route
apiRouter.get('/data/load/:username', async (req, res) => {
  try {
    const normalizedUsername = (req.params.username || '').trim().toLowerCase();
    if (!normalizedUsername) return res.status(400).json({ error: 'Username required.' });

    const user = await User.findOne({ username: normalizedUsername });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({ success: true, data: user.gpaData || null });
  } catch (err) {
    console.error('Load data error:', err);
    res.status(500).json({ error: 'Failed to load data: ' + err.message });
  }
});

// Save User Data Route (Saves multi-semester & overall GPA data)
apiRouter.post('/data/save', async (req, res) => {
  const { username, data } = req.body;
  if (!username || !data) return res.status(400).json({ error: 'Username and data are required.' });

  try {
    const normalizedUsername = username.trim().toLowerCase();
    const user = await User.findOneAndUpdate(
      { username: normalizedUsername },
      { $set: { gpaData: data } },
      { new: true, runValidators: false }
    );
    
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true, message: 'Data saved successfully.', data: user.gpaData });
  } catch (err) {
    console.error('Save data error:', err);
    res.status(500).json({ error: 'Failed to save data: ' + err.message });
  }
});

// Mount router on both /api and / so all Vercel/proxy combinations succeed
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Start Server locally (not when invoked serverless by Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

export default app;

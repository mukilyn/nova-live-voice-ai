const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/ogl', express.static(path.join(__dirname, 'node_modules/ogl/src')));

// Configure Multer for Audio Uploads
const upload = multer({ dest: path.join(__dirname, 'uploads') });
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

let GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// Available model fallback cascade in order of preference
const MODEL_CASCADE = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'allam-2-7b'
];

let activeModelIndex = 0;
let modelStats = {
  requests: 0,
  fallbacks: 0,
  fallbackHistory: [],
  modelUsage: {}
};

MODEL_CASCADE.forEach(m => {
  modelStats.modelUsage[m] = { calls: 0, errors: 0, lastUsed: null };
});

// Helper: Windows command execution
function runWindowsCommand(cmd, usePowershell = false) {
  return new Promise((resolve) => {
    const options = usePowershell ? { shell: 'powershell.exe' } : {};
    exec(cmd, options, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message, stderr });
      } else {
        resolve({ success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
      }
    });
  });
}

// System Command Handler
async function executeSystemAction(action) {
  if (!action || !action.type) return { executed: false, message: 'No action specified' };

  try {
    switch (action.type) {
      case 'open_url': {
        const url = (action.target || '').startsWith('http') ? action.target : `https://${action.target}`;
        await runWindowsCommand(`start "" "${url}"`);
        return { executed: true, message: `Opened URL: ${url}`, url };
      }

      case 'search_youtube': {
        const query = encodeURIComponent(action.target || action.query || '');
        const url = `https://www.youtube.com/results?search_query=${query}`;
        await runWindowsCommand(`start "" "${url}"`);
        return { executed: true, message: `Searched YouTube for: ${action.target}`, url };
      }

      case 'search_google': {
        const query = encodeURIComponent(action.target || action.query || '');
        const url = `https://www.google.com/search?q=${query}`;
        await runWindowsCommand(`start "" "${url}"`);
        return { executed: true, message: `Searched Google for: ${action.target}`, url };
      }

      case 'open_app': {
        const appMap = {
          notepad: 'notepad.exe',
          calculator: 'calc.exe',
          calc: 'calc.exe',
          explorer: 'explorer.exe',
          files: 'explorer.exe',
          paint: 'mspaint.exe',
          terminal: 'wt.exe',
          cmd: 'cmd.exe',
          taskmgr: 'taskmgr.exe',
          taskmanager: 'taskmgr.exe',
          code: 'code.cmd'
        };
        const appKey = (action.target || '').toLowerCase().trim();
        const targetCmd = appMap[appKey] || `${appKey}.exe`;
        await runWindowsCommand(`start "" "${targetCmd}"`);
        return { executed: true, message: `Launched application: ${action.target}` };
      }

      case 'system_info': {
        const battRes = await runWindowsCommand('(Get-CimInstance -ClassName Win32_Battery).EstimatedChargeRemaining', true);
        const battStatus = await runWindowsCommand('(Get-CimInstance -ClassName Win32_Battery).BatteryStatus', true);
        return {
          executed: true,
          message: 'Retrieved laptop system stats',
          data: {
            batteryPercent: battRes.stdout ? `${battRes.stdout}%` : 'AC Power / 100%',
            isCharging: battStatus.stdout === '2' || battStatus.stdout === '6',
            time: new Date().toLocaleTimeString(),
            date: new Date().toLocaleDateString()
          }
        };
      }

      case 'adjust_volume': {
        if (action.target === 'mute') {
          await runWindowsCommand('$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]173)', true);
          return { executed: true, message: 'Toggled audio mute' };
        } else if (action.target === 'up') {
          await runWindowsCommand('$w = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 5;$i++){$w.SendKeys([char]175)}', true);
          return { executed: true, message: 'Volume increased' };
        } else if (action.target === 'down') {
          await runWindowsCommand('$w = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 5;$i++){$w.SendKeys([char]174)}', true);
          return { executed: true, message: 'Volume decreased' };
        }
        return { executed: false, message: 'Unknown volume command' };
      }

      default:
        return { executed: false, message: `Unknown action type: ${action.type}` };
    }
  } catch (err) {
    return { executed: false, error: err.message };
  }
}

// System prompt explaining voice role and tool/command execution format
const SYSTEM_PROMPT = `You are NOVA, a live voice AI companion for this laptop.
You speak clearly, concisely, and naturally for voice synthesis (TTS). Keep responses direct and friendly (usually 1-3 sentences unless asked for details).

CRITICAL CAPABILITY: You have direct control over this laptop and browser!
When the user asks you to:
- Open YouTube or watch something -> trigger action: {"type": "open_url", "target": "https://www.youtube.com"} or {"type": "search_youtube", "target": "query"}
- Open Google or search for something -> trigger action: {"type": "search_google", "target": "query"} or {"type": "open_url", "target": "https://www.google.com"}
- Open websites (e.g. GitHub, Reddit, Twitter, Netflix) -> trigger action: {"type": "open_url", "target": "https://..."}
- Open laptop desktop apps (Notepad, Calculator, Task Manager, File Explorer, Terminal/CMD, Paint) -> trigger action: {"type": "open_app", "target": "notepad"} (calc, explorer, taskmgr, paint, etc.)
- Check laptop battery/stats/system info -> trigger action: {"type": "system_info"}
- Volume controls -> trigger action: {"type": "adjust_volume", "target": "mute"|"up"|"down"}

RESPONSE FORMAT:
You MUST ALWAYS respond with a valid JSON object in this exact format:
{
  "speech": "Natural voice replay message for the user.",
  "action": null or {"type": "...", "target": "..."}
}
Never output markdown backticks around the JSON. Output raw JSON only.`;

// Call Groq Chat Completion with Automatic Model Fallback
async function callGroqChatWithFallback(messages, requestedModel = null) {
  let startIndex = 0;
  if (requestedModel) {
    const idx = MODEL_CASCADE.indexOf(requestedModel);
    if (idx !== -1) startIndex = idx;
  } else {
    startIndex = activeModelIndex;
  }

  let lastError = null;
  let fallbackLog = [];

  for (let offset = 0; offset < MODEL_CASCADE.length; offset++) {
    const currentIndex = (startIndex + offset) % MODEL_CASCADE.length;
    const modelToTry = MODEL_CASCADE[currentIndex];

    try {
      const startTime = Date.now();
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelToTry,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
          ],
          temperature: 0.7,
          max_tokens: 350,
          response_format: { type: 'json_object' }
        })
      });

      const latencyMs = Date.now() - startTime;
      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error?.message || `HTTP ${response.status} ${response.statusText}`;
        console.warn(`[Groq Warning] Model ${modelToTry} failed (${response.status}): ${errorMsg}`);
        
        // Track error
        modelStats.modelUsage[modelToTry].errors++;
        fallbackLog.push({ model: modelToTry, status: response.status, error: errorMsg });

        // If rate limit (429) or token limit or server error, proceed to fallback next model
        lastError = errorMsg;
        modelStats.fallbacks++;
        continue;
      }

      // Success! Update active model
      activeModelIndex = currentIndex;
      modelStats.requests++;
      modelStats.modelUsage[modelToTry].calls++;
      modelStats.modelUsage[modelToTry].lastUsed = new Date().toISOString();

      const rawContent = data.choices?.[0]?.message?.content || '{}';
      let parsed = { speech: rawContent, action: null };
      try {
        parsed = JSON.parse(rawContent);
      } catch (parseErr) {
        // Fallback if not valid JSON
        parsed = { speech: rawContent, action: null };
      }

      return {
        success: true,
        speech: parsed.speech || 'Done.',
        action: parsed.action || null,
        modelUsed: modelToTry,
        fallbackOccurred: fallbackLog.length > 0,
        fallbackLog: fallbackLog,
        latencyMs,
        usage: data.usage || null
      };

    } catch (networkErr) {
      console.error(`[Groq Network Error] on ${modelToTry}:`, networkErr.message);
      lastError = networkErr.message;
      fallbackLog.push({ model: modelToTry, error: networkErr.message });
      modelStats.fallbacks++;
    }
  }

  // If all models failed in the cascade
  return {
    success: false,
    error: `All models in fallback cascade exhausted. Last error: ${lastError}`,
    fallbackLog
  };
}

// API Routes

// 1. Get Models & Stats
app.get('/api/models', (req, res) => {
  res.json({
    models: MODEL_CASCADE,
    activeModel: MODEL_CASCADE[activeModelIndex],
    stats: modelStats
  });
});

// 2. Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model, executeOnServer } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const aiResult = await callGroqChatWithFallback(messages, model);

    if (!aiResult.success) {
      return res.status(500).json(aiResult);
    }

    let executionResult = null;
    if (aiResult.action && executeOnServer !== false) {
      executionResult = await executeSystemAction(aiResult.action);
    }

    res.json({
      ...aiResult,
      executionResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Speech-to-Text via Groq Whisper API
app.post('/api/stt', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname || 'audio.webm';

  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
      filename: originalName,
      contentType: req.file.mimetype || 'audio/webm'
    });
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');

    const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        ...form.getHeaders()
      },
      body: form
    });

    const whisperData = await whisperRes.json();
    
    // Clean up temporary file
    fs.unlink(filePath, () => {});

    if (!whisperRes.ok) {
      return res.status(whisperRes.status).json({ error: whisperData.error?.message || 'Whisper transcription failed' });
    }

    res.json({ text: whisperData.text || '' });
  } catch (err) {
    fs.unlink(filePath, () => {});
    res.status(500).json({ error: err.message });
  }
});

// 4. Direct System Action Execution
app.post('/api/system/exec', async (req, res) => {
  try {
    const { action } = req.body;
    const result = await executeSystemAction(action);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. System Stats
app.get('/api/system/stats', async (req, res) => {
  try {
    const info = await executeSystemAction({ type: 'system_info' });
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Update Configuration
app.post('/api/settings', (req, res) => {
  const { apiKey, activeModel } = req.body;
  if (apiKey) {
    GROQ_API_KEY = apiKey;
  }
  if (activeModel && MODEL_CASCADE.includes(activeModel)) {
    activeModelIndex = MODEL_CASCADE.indexOf(activeModel);
  }
  res.json({
    success: true,
    activeModel: MODEL_CASCADE[activeModelIndex],
    apiKeyConfigured: Boolean(GROQ_API_KEY)
  });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 NOVA Live Voice AI Server running on: http://localhost:${PORT}`);
  console.log(`🎧 Primary Model: ${MODEL_CASCADE[activeModelIndex]}`);
  console.log(`🔄 Fallback Pool: ${MODEL_CASCADE.join(' -> ')}`);
  console.log(`===============================================`);
});

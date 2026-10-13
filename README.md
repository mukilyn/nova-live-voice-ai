# NOVA - Live Voice AI Laptop Assistant

**NOVA** is a real-time, interactive Live Voice AI Assistant designed specifically for your laptop. Speak to NOVA naturally—it listens, transcribes speech, reasons using high-performance Groq AI models with automatic failover rotation, speaks back using natural TTS, and executes OS commands on your laptop (opening YouTube, searching Google, launching apps, and retrieving laptop battery metrics).

---

## ✨ Key Features

1. **🎙️ Speech-to-Text (STT) & Hands-Free Conversation**
   - **Real-Time Live Streaming (Web Speech API)**: Transcribes your voice in real-time as you speak with zero lag.
   - **Groq Whisper HD (whisper-large-v3-turbo)**: High-definition studio transcription using Groq's dedicated audio processing.
   - **Hands-Free Continuous Mode**: Keeps listening continuously so you can talk back and forth naturally.

2. **🔊 Text-to-Speech (TTS) Voice Synthesis**
   - Voice replay through natural speech synthesis.
   - Customizable voice, speaking rate, and pitch controls.
   - Audio waveform replay buttons on every response.

3. **🔄 Automatic Model Fallback Rotation (Never Run Out of Tokens)**
   - Configured with a multi-model cascade on Groq:
     1. `qwen/qwen3.8-27b` *(Primary: ultra-fast and intelligent)*
     2. `openai/gpt-oss-120b` *(High-intelligence 120B parameter model)*
     3. `openai/gpt-oss-20b` *(Ultra-low latency model)*
     4. `canopylabs/orpheus-v1-english`
     5. `allam-2-7b`
   - **Automatic Failover**: If a model hits a rate limit (HTTP 429), runs out of token quota, or experiences downtime, NOVA automatically switches to the next model in the cascade without interrupting your conversation!
   - Real-time indicator and notifications inform you whenever an automatic failover occurs.

4. **⚡ Laptop OS & Browser Automation Commands**
   - **"Open YouTube on browser"**: Instantly launches YouTube (`https://www.youtube.com`) in your default browser.
   - **"Search YouTube for [topic]"**: Opens YouTube with the exact search query.
   - **"Open Google"** or **"Search Google for [topic]"**: Launches Google searches.
   - **"Open Calculator / Notepad / Paint / Task Manager / Files"**: Opens native Windows desktop applications.
   - **"Check battery / system stats"**: Displays real-time laptop battery percentage and charging status.
   - **"Mute audio"**: Toggles laptop audio mute via system commands.

5. **🔮 3D Audio-Reactive Voice Orb Visualizer**
   - Dynamic canvas particles and undulating soundwaves.
   - Reacts in real-time to your microphone volume and NOVA's speech synthesis.
   - Dynamic visual states: *Idle*, *Listening*, *Thinking*, and *Speaking*.

---

## 🚀 How to Run

1. Open a terminal or double-click `start-nova.bat`.
2. Or run manually:
   ```powershell
   node server.js
   ```
3. Open **`http://localhost:3000`** in your browser.
4. Allow microphone access when prompted.
5. Tap the microphone or click any quick command like **"Open YouTube on browser"** to start!

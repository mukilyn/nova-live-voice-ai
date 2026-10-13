// NOVA Live Voice AI Assistant Client Logic
import { createStrands } from './strands.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const canvas = document.getElementById('voiceOrbCanvas');
  const ctx = canvas.getContext('2d');
  const orbGlow = document.getElementById('orbGlow');
  const stateChip = document.getElementById('stateChip');
  const stateText = document.getElementById('stateText');
  const liveTranscriptPreview = document.getElementById('liveTranscriptPreview');
  const micBtn = document.getElementById('micBtn');
  const handsFreeBtn = document.getElementById('handsFreeBtn');
  const stopSpeechBtn = document.getElementById('stopSpeechBtn');
  const chatForm = document.getElementById('chatForm');
  const textInput = document.getElementById('textInput');
  const chatMessages = document.getElementById('chatMessages');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const exportHistoryBtn = document.getElementById('exportHistoryBtn');

  // Floating Strands Circle Widget (Right Down Corner)
  const floatingVoiceWidget = document.getElementById('floatingVoiceWidget');
  const floatingStrandsCtn = document.getElementById('floatingStrandsCtn');
  const floatingChipText = document.getElementById('floatingChipText');
  
  // Status & Actions
  const currentModelDisplay = document.getElementById('currentModelDisplay');
  const fallbackBadge = document.getElementById('fallbackBadge');
  const actionAlertBanner = document.getElementById('actionAlertBanner');
  const actionAlertTitle = document.getElementById('actionAlertTitle');
  const actionAlertDesc = document.getElementById('actionAlertDesc');
  const laptopBatteryLabel = document.getElementById('laptopBatteryLabel');
  const systemStatsBtn = document.getElementById('systemStatsBtn');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');
  const audioVolumeMeter = document.getElementById('audioVolumeMeter');
  const meterBar = document.getElementById('meterBar');
  const micPermissionNotice = document.getElementById('micPermissionNotice');

  // Settings Modal Elements
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveAndCloseBtn = document.getElementById('saveAndCloseBtn');
  const settingsModal = document.getElementById('settingsModal');
  const modelSelect = document.getElementById('modelSelect');
  const sttModeSelect = document.getElementById('sttModeSelect');
  const ttsVoiceSelect = document.getElementById('ttsVoiceSelect');
  const speechSpeed = document.getElementById('speechSpeed');
  const speechPitch = document.getElementById('speechPitch');
  const speedVal = document.getElementById('speedVal');
  const pitchVal = document.getElementById('pitchVal');
  const apiKeyInput = document.getElementById('apiKeyInput');

  // --- State Variables ---
  // Dynamic API Base URL: works seamlessly whether opened via http://localhost:3000, online tunnel, or file://
  const API_BASE = (window.location.protocol === 'file:' || !window.location.port) ? 'http://localhost:3000' : '';

  let currentState = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking'
  let isHandsFree = true;
  let isRecording = false;
  let audioContext = null;
  let analyser = null;
  let micStream = null;
  let audioDataArray = null;
  let currentAudioLevel = 0;
  
  // Speech Recognition (Web Speech API)
  let recognition = null;
  let isRecognitionRunning = false;
  
  // MediaRecorder for Whisper STT
  let mediaRecorder = null;
  let audioChunks = [];

  // Conversation history
  let conversationHistory = [];

  // Voice Synthesis (TTS)
  let availableVoices = [];
  let selectedVoice = null;

  // --- Sound Effects (Web Audio Synth) ---
  function playBeep(type = 'chime') {
    try {
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.connect(gain);
      gain.connect(actx.destination);

      if (type === 'start') {
        osc.frequency.setValueAtTime(440, actx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, actx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.18);
        osc.start();
        osc.stop(actx.currentTime + 0.2);
      } else if (type === 'action') {
        osc.frequency.setValueAtTime(587.33, actx.currentTime); // D5
        osc.frequency.setValueAtTime(880, actx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.1, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.25);
        osc.start();
        osc.stop(actx.currentTime + 0.25);
      }
    } catch (e) {}
  }

  // --- UI Toast ---
  function showToast(msg, duration = 4000) {
    toastMessage.textContent = msg;
    toastNotification.style.display = 'flex';
    clearTimeout(toastNotification.timer);
    toastNotification.timer = setTimeout(() => {
      toastNotification.style.display = 'none';
    }, duration);
  }

  // --- Action Alert Banner ---
  function showActionAlert(title, desc) {
    actionAlertTitle.textContent = title;
    actionAlertDesc.textContent = desc;
    actionAlertBanner.style.display = 'flex';
    playBeep('action');
    setTimeout(() => {
      actionAlertBanner.style.display = 'none';
    }, 6000);
  }

  // --- State Transition Manager ---
  function setState(state) {
    currentState = state;
    orbGlow.className = 'orb-glow-backdrop ' + state;

    if (floatingVoiceWidget) {
      floatingVoiceWidget.className = 'floating-voice-widget ' + state;
    }
    if (floatingChipText) {
      if (state === 'listening') floatingChipText.textContent = 'Listening...';
      else if (state === 'speaking') floatingChipText.textContent = 'NOVA Speaking...';
      else if (state === 'thinking') floatingChipText.textContent = 'Thinking...';
      else floatingChipText.textContent = 'Talk to NOVA';
    }
    if (strandsInstance) {
      strandsInstance.setState(state);
    }

    switch (state) {
      case 'idle':
        stateText.textContent = isHandsFree ? 'Listening in background... (Say "Nova")' : 'Tap mic to speak';
        micBtn.classList.remove('recording');
        stopSpeechBtn.style.display = 'none';
        break;

      case 'listening':
        stateText.textContent = 'Listening to you...';
        micBtn.classList.add('recording');
        stopSpeechBtn.style.display = 'none';
        break;

      case 'thinking':
        stateText.textContent = 'NOVA is thinking...';
        micBtn.classList.remove('recording');
        stopSpeechBtn.style.display = 'none';
        break;

      case 'speaking':
        stateText.textContent = 'NOVA is speaking...';
        micBtn.classList.remove('recording');
        stopSpeechBtn.style.display = 'inline-flex';
        break;
    }
  }

  // --- Initialize WebGL Strands on Floating Widget ---
  let strandsInstance = null;
  if (floatingStrandsCtn) {
    try {
      strandsInstance = createStrands(floatingStrandsCtn, {
        colors: ['#00f2fe', '#7f00ff', '#4facfe', '#f355da'],
        count: 5,
        speed: 0.5,
        amplitude: 1.1,
        waviness: 1.8,
        thickness: 0.65,
        glow: 2.8,
        glass: true,
        refraction: 3.0,
        dispersion: 3.85,
        glassSize: 0.48
      });
    } catch (e) {
      console.warn('Strands WebGL initialization:', e);
    }
  }

  // --- Particle Orb Visualizer Canvas ---
  const particles = [];
  const PARTICLE_COUNT = 65;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2,
      distance: 85 + Math.random() * 55,
      baseDist: 85 + Math.random() * 55,
      size: 1.5 + Math.random() * 2.5,
      speed: 0.005 + Math.random() * 0.015,
      pulseSpeed: 0.02 + Math.random() * 0.03,
      pulsePhase: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.5 ? 185 : 275 // Cyan or Violet
    });
  }

  let visualizerAngle = 0;
  function renderVisualizer() {
    requestAnimationFrame(renderVisualizer);

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Read microphone frequency data if available
    let dynamicVolume = 0;
    if (analyser && (currentState === 'listening' || currentState === 'speaking')) {
      analyser.getByteFrequencyData(audioDataArray);
      let sum = 0;
      for (let i = 0; i < 32; i++) {
        sum += audioDataArray[i];
      }
      dynamicVolume = (sum / 32) / 255; // 0 to 1
    } else if (currentState === 'speaking') {
      dynamicVolume = 0.4 + Math.sin(Date.now() * 0.01) * 0.3;
    } else if (currentState === 'thinking') {
      dynamicVolume = 0.25 + Math.sin(Date.now() * 0.008) * 0.15;
    }

    currentAudioLevel += (dynamicVolume - currentAudioLevel) * 0.2;
    visualizerAngle += currentState === 'thinking' ? 0.04 : 0.012;

    // Send live audio level to Strands WebGL effect
    if (strandsInstance) {
      strandsInstance.setAudioLevel(currentAudioLevel);
    }

    // Update Live Audio Input VU Meter
    if (meterBar && audioVolumeMeter) {
      if (currentState === 'listening') {
        audioVolumeMeter.style.display = 'flex';
        const pct = Math.min(100, Math.round(currentAudioLevel * 260));
        meterBar.style.width = pct + '%';
        if (pct > 22) {
          meterBar.style.background = '#00f5a0'; // green when speaking
        } else {
          meterBar.style.background = '#00f2fe';
        }
      } else {
        audioVolumeMeter.style.display = 'none';
      }
    }

    // 1. Draw Central Fluid Core
    const baseRadius = 65 + currentAudioLevel * 45;
    const grad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, baseRadius);

    if (currentState === 'listening') {
      grad.addColorStop(0, 'rgba(0, 242, 254, 0.9)');
      grad.addColorStop(0.5, 'rgba(79, 172, 254, 0.5)');
      grad.addColorStop(1, 'rgba(0, 242, 254, 0)');
    } else if (currentState === 'speaking') {
      grad.addColorStop(0, 'rgba(127, 0, 255, 0.95)');
      grad.addColorStop(0.5, 'rgba(243, 85, 218, 0.5)');
      grad.addColorStop(1, 'rgba(127, 0, 255, 0)');
    } else if (currentState === 'thinking') {
      grad.addColorStop(0, 'rgba(255, 179, 0, 0.9)');
      grad.addColorStop(0.5, 'rgba(127, 0, 255, 0.4)');
      grad.addColorStop(1, 'rgba(255, 179, 0, 0)');
    } else {
      // Idle
      grad.addColorStop(0, 'rgba(0, 242, 254, 0.7)');
      grad.addColorStop(0.6, 'rgba(127, 0, 255, 0.3)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw Undulating Soundwave Rings
    const ringCount = 3;
    for (let r = 1; r <= ringCount; r++) {
      ctx.beginPath();
      const ringRadius = baseRadius + r * (22 + currentAudioLevel * 25);
      const ringPoints = 60;
      for (let p = 0; p <= ringPoints; p++) {
        const theta = (p / ringPoints) * Math.PI * 2;
        const wave = Math.sin(theta * (4 + r) + visualizerAngle * 2 + r) * (currentAudioLevel * 18);
        const rad = ringRadius + wave;
        const px = centerX + Math.cos(theta) * rad;
        const py = centerY + Math.sin(theta) * rad;

        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.lineWidth = 1.5;
      if (currentState === 'listening') {
        ctx.strokeStyle = `rgba(0, 242, 254, ${0.4 - r * 0.1})`;
      } else if (currentState === 'speaking') {
        ctx.strokeStyle = `rgba(243, 85, 218, ${0.45 - r * 0.1})`;
      } else if (currentState === 'thinking') {
        ctx.strokeStyle = `rgba(255, 179, 0, ${0.4 - r * 0.1})`;
      } else {
        ctx.strokeStyle = `rgba(79, 172, 254, ${0.25 - r * 0.07})`;
      }
      ctx.stroke();
    }

    // 3. Draw Orbiting Cosmic Particles
    particles.forEach(p => {
      p.angle += p.speed * (currentState === 'thinking' ? 3 : 1);
      const pulse = Math.sin(p.pulsePhase + visualizerAngle * 4) * 8;
      const dist = p.baseDist + currentAudioLevel * 60 + pulse;
      const px = centerX + Math.cos(p.angle) * dist;
      const py = centerY + Math.sin(p.angle) * dist;

      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 + currentAudioLevel), 0, Math.PI * 2);
      ctx.fillStyle = p.hue === 185 ? 'rgba(0, 242, 254, 0.85)' : 'rgba(179, 102, 255, 0.85)';
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.hue === 185 ? '#00f2fe' : '#7f00ff';
      ctx.fill();
      ctx.shadowBlur = 0; // reset
    });
  }
  renderVisualizer();

  // --- Audio Context & Microphone Setup ---
  async function initAudioAnalyser() {
    if (audioContext && micStream && micStream.active) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioContext) {
        audioContext = new AudioCtx();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        audioDataArray = new Uint8Array(analyser.frequencyBinCount);
      }
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      if (!micStream || !micStream.active) {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        const source = audioContext.createMediaStreamSource(micStream);
        source.connect(analyser);
      }
      if (micPermissionNotice) micPermissionNotice.style.display = 'none';
      return true;
    } catch (e) {
      console.warn('Microphone stream error:', e.message);
      if (micPermissionNotice) micPermissionNotice.style.display = 'flex';
      showToast('⚠️ Microphone blocked! Click the lock 🔒 icon next to localhost:3000 to Allow.', 6000);
      return false;
    }
  }

  // --- Voice Synthesis (TTS) Setup ---
  function initTTS() {
    function loadVoices() {
      availableVoices = window.speechSynthesis.getVoices();
      ttsVoiceSelect.innerHTML = '';
      
      // Look for natural English voices first
      const preferred = availableVoices.filter(v => v.lang.startsWith('en'));
      const voiceList = preferred.length > 0 ? preferred : availableVoices;

      voiceList.forEach(voice => {
        const opt = document.createElement('option');
        opt.value = voice.name;
        opt.textContent = `${voice.name} (${voice.lang})`;
        if (voice.name.includes('Natural') || voice.name.includes('Google') || voice.name.includes('David') || voice.name.includes('Zira')) {
          opt.selected = true;
          selectedVoice = voice;
        }
        ttsVoiceSelect.appendChild(opt);
      });

      if (!selectedVoice && voiceList.length > 0) {
        selectedVoice = voiceList[0];
      }
    }

    if (window.speechSynthesis) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }
  initTTS();

  function speakText(text, onDone = null) {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel(); // Stop any pending utterance
    setState('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = parseFloat(speechSpeed.value) || 1.0;
    utterance.pitch = parseFloat(speechPitch.value) || 1.0;

    utterance.onend = () => {
      setState('idle');
      if (onDone) onDone();
      // If hands-free is active, resume listening
      if (isHandsFree) {
        setTimeout(startListening, 600);
      }
    };

    utterance.onerror = () => {
      setState('idle');
      if (onDone) onDone();
    };

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setState('idle');
  }

  // --- Speech Recognition (STT) Setup ---
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported by browser. Using Groq Whisper HD mode.');
      sttModeSelect.value = 'whisper';
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isRecognitionRunning = true;
      setState('listening');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      liveTranscriptPreview.textContent = interimTranscript || finalTranscript;

      if (finalTranscript.trim()) {
        liveTranscriptPreview.textContent = finalTranscript;
        recognition.stop();
        handleUserSpeech(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      console.warn('Web Speech recognition event error:', event.error);
      if (event.error === 'not-allowed') {
        if (micPermissionNotice) micPermissionNotice.style.display = 'flex';
        showToast('⚠️ Microphone blocked! Click lock icon in browser to Allow.', 6000);
        setState('idle');
      } else if (event.error === 'network' || event.error === 'service-not-allowed') {
        showToast('🌐 WebSpeech network timeout. Switching to Groq Whisper HD mode...', 4000);
        sttModeSelect.value = 'whisper';
        startWhisperRecording();
      } else if (event.error === 'no-speech') {
        if (currentState === 'listening') {
          liveTranscriptPreview.textContent = 'Listening... Speak your command';
        }
      }
    };

    recognition.onend = () => {
      isRecognitionRunning = false;
      if (currentState === 'listening') {
        setState('idle');
      }
    };
  }
  initSpeechRecognition();

  // --- Groq Whisper Recording Mode with Voice Activity Detection (VAD) ---
  let vadInterval = null;
  let vadSilenceTimer = null;
  let vadMaxTimeout = null;

  async function startWhisperRecording() {
    const hasMic = await initAudioAnalyser();
    if (!hasMic) {
      setState('idle');
      return;
    }

    try {
      audioChunks = [];
      mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });

      let speechDetected = false;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        clearTimeout(vadSilenceTimer);
        clearTimeout(vadMaxTimeout);
        if (vadInterval) clearInterval(vadInterval);
        
        setState('thinking');
        liveTranscriptPreview.textContent = 'Transcribing voice with Groq Whisper...';

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        if (audioBlob.size < 400) {
          setState('idle');
          liveTranscriptPreview.textContent = '';
          return;
        }

        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
          const res = await fetch(API_BASE + '/api/stt', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data.text && data.text.trim()) {
            handleUserSpeech(data.text.trim());
          } else {
            setState('idle');
            liveTranscriptPreview.textContent = '';
            showToast('No speech detected. Try speaking closer to mic!');
          }
        } catch (err) {
          setState('idle');
          liveTranscriptPreview.textContent = '';
          showToast('Groq Whisper error: ' + err.message);
        }
      };

      mediaRecorder.start(250);
      isRecording = true;
      setState('listening');
      liveTranscriptPreview.textContent = '🎙️ Listening... (Speak now)';
      playBeep('start');

      // Voice Activity Detection: automatically stops when you finish speaking!
      vadInterval = setInterval(() => {
        if (currentAudioLevel > 0.08) {
          speechDetected = true;
          clearTimeout(vadSilenceTimer);
          liveTranscriptPreview.textContent = '🎙️ Hearing your voice...';
          vadSilenceTimer = setTimeout(() => {
            if (isRecording && speechDetected) {
              stopWhisperRecording();
            }
          }, 1600);
        }
      }, 150);

      // 14-second max recording limit
      vadMaxTimeout = setTimeout(() => {
        if (isRecording) stopWhisperRecording();
      }, 14000);

    } catch (err) {
      setState('idle');
      showToast('Could not start microphone: ' + err.message);
    }
  }

  function stopWhisperRecording() {
    clearTimeout(vadSilenceTimer);
    clearTimeout(vadMaxTimeout);
    if (vadInterval) clearInterval(vadInterval);

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      isRecording = false;
    }
  }

  // --- Unified Start / Stop Listening ---
  async function startListening() {
    if (currentState === 'speaking') {
      stopSpeaking();
    }
    
    // Explicitly initialize and verify microphone with user click
    const hasMic = await initAudioAnalyser();
    if (!hasMic) {
      setState('idle');
      return;
    }

    liveTranscriptPreview.textContent = 'Listening... Speak now!';

    const sttMode = sttModeSelect.value;
    if (sttMode === 'whisper') {
      startWhisperRecording();
    } else {
      if (recognition) {
        try {
          if (isRecognitionRunning) {
            recognition.stop();
          }
          recognition.start();
          playBeep('start');
        } catch (e) {
          console.warn('Recognition start caught, falling back to Whisper:', e);
          sttModeSelect.value = 'whisper';
          startWhisperRecording();
        }
      } else {
        sttModeSelect.value = 'whisper';
        startWhisperRecording();
      }
    }
  }

  function stopListening() {
    const sttMode = sttModeSelect.value;
    if (sttMode === 'whisper' || isRecording) {
      stopWhisperRecording();
    } else {
      if (recognition && isRecognitionRunning) {
        recognition.stop();
      }
    }
    setState('idle');
  }

  // --- Handle User Speech & Chat Dispatch ---
  async function handleUserSpeech(userInput) {
    if (!userInput) return;
    liveTranscriptPreview.textContent = '';
    appendMessage('user', userInput);

    conversationHistory.push({ role: 'user', content: userInput });
    // Keep sliding window of last 10 messages for context
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10);
    }

    setState('thinking');

    try {
      const activeModel = modelSelect.value;
      const res = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          model: activeModel,
          executeOnServer: true
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setState('idle');
        const errText = data.error || 'Server error occurred.';
        appendMessage('nova', 'I ran into an issue: ' + errText);
        speakText('I ran into an issue: ' + errText);
        return;
      }

      // Update model UI & check for auto-fallback notification!
      if (data.modelUsed) {
        currentModelDisplay.textContent = data.modelUsed;
        modelSelect.value = data.modelUsed;
      }

      if (data.fallbackOccurred) {
        fallbackBadge.textContent = 'SWITCHED: ' + data.modelUsed;
        showToast(`⚡ Model Token Fallback: Switched from rate-limited model to ${data.modelUsed}!`, 5000);
      }

      const replySpeech = data.speech || 'Done.';
      conversationHistory.push({ role: 'assistant', content: replySpeech });

      // Append assistant message bubble with any action metadata
      appendMessage('nova', replySpeech, data.action, data.modelUsed);

      // Handle executed command on browser side as well
      if (data.action) {
        handleClientAction(data.action);
      }

      // Voice reply through Text-to-Speech
      speakText(replySpeech);

    } catch (networkError) {
      setState('idle');
      appendMessage('nova', 'Network error connecting to NOVA server.');
      showToast('Network error: ' + networkError.message);
    }
  }

  // --- Client-Side Action Execution Helper ---
  function handleClientAction(action) {
    if (!action) return;

    if (action.type === 'open_url') {
      showActionAlert('Opening Web URL', action.target);
      // Open in browser tab
      window.open(action.target, '_blank');
    } else if (action.type === 'search_youtube') {
      const query = encodeURIComponent(action.target || '');
      const url = `https://www.youtube.com/results?search_query=${query}`;
      showActionAlert('YouTube Search', `Searching for: ${action.target}`);
      window.open(url, '_blank');
    } else if (action.type === 'search_google') {
      const query = encodeURIComponent(action.target || '');
      const url = `https://www.google.com/search?q=${query}`;
      showActionAlert('Google Search', `Searching for: ${action.target}`);
      window.open(url, '_blank');
    } else if (action.type === 'open_app') {
      showActionAlert('Desktop Application', `Launching ${action.target} on your laptop`);
    } else if (action.type === 'system_info') {
      showActionAlert('Laptop System Stats', 'Fetched battery and performance specs');
      fetchLaptopStats();
    } else if (action.type === 'adjust_volume') {
      showActionAlert('Volume Control', `Audio ${action.target}`);
    }
  }

  // --- Fetch Laptop Stats ---
  async function fetchLaptopStats() {
    try {
      const res = await fetch(API_BASE + '/api/system/stats');
      const data = await res.json();
      if (data.data) {
        laptopBatteryLabel.textContent = `${data.data.batteryPercent}`;
      }
    } catch (e) {}
  }
  fetchLaptopStats();
  setInterval(fetchLaptopStats, 30000);

  // --- Persistent Speech History in LocalStorage ---
  const STORAGE_KEY = 'nova_speech_history_v1';

  function getStoredHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveHistoryItem(item) {
    try {
      const list = getStoredHistory();
      list.push({
        sender: item.sender,
        text: item.text,
        action: item.action || null,
        model: item.model || null,
        time: item.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString()
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      updateHistoryBadge();
    } catch (e) {}
  }

  function updateHistoryBadge() {
    if (historyCountBadge) {
      const count = getStoredHistory().length;
      historyCountBadge.textContent = `${count} saved`;
    }
  }

  function loadSavedHistory() {
    const list = getStoredHistory();
    updateHistoryBadge();
    if (!list || list.length === 0) return;

    chatMessages.innerHTML = '';
    list.forEach(item => {
      appendMessage(item.sender, item.text, item.action, item.model, false, item.time);
    });
  }

  function exportSpeechHistory() {
    const list = getStoredHistory();
    if (list.length === 0) {
      showToast('No saved speech history to export.');
      return;
    }
    let txt = `========================================================\n`;
    txt += `  NOVA LIVE VOICE AI - SPEECH & COMMAND HISTORY LOG\n`;
    txt += `  Generated: ${new Date().toLocaleString()}\n`;
    txt += `========================================================\n\n`;

    list.forEach((item, idx) => {
      const sender = item.sender === 'user' ? 'YOU' : `NOVA (${item.model || 'AI'})`;
      txt += `[${item.date} ${item.time}] ${sender}:\n`;
      txt += `  "${item.text}"\n`;
      if (item.action) {
        txt += `  >> Executed Action: ${item.action.type} -> ${item.action.target || ''}\n`;
      }
      txt += `\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova_speech_history_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Speech history exported successfully!');
  }

  // --- Chat UI Messaging Helper ---
  function appendMessage(sender, text, action = null, model = null, saveToHistory = true, timeStr = null) {
    const time = timeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (saveToHistory) {
      saveHistoryItem({ sender, text, action, model, time });
    }

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${sender === 'user' ? 'user-bubble' : 'nova-bubble'}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = sender === 'user' ? 'U' : 'N';

    const body = document.createElement('div');
    body.className = 'msg-body';

    const senderLabel = document.createElement('div');
    senderLabel.className = 'msg-sender';
    senderLabel.textContent = sender === 'user' ? `You • ${time}` : `NOVA (${model || 'AI'}) • ${time}`;

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = text;

    body.appendChild(senderLabel);
    body.appendChild(textEl);

    if (action) {
      const actionTag = document.createElement('div');
      actionTag.className = 'msg-action-tag';
      actionTag.innerHTML = `<span>⚡</span> <span>Action: ${action.type} (${action.target || ''})</span>`;
      body.appendChild(actionTag);
    }

    if (sender === 'nova') {
      const footer = document.createElement('div');
      footer.className = 'msg-footer';

      const replayBtn = document.createElement('button');
      replayBtn.className = 'replay-audio-btn';
      replayBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Replay Audio
      `;
      replayBtn.onclick = () => speakText(text);

      footer.appendChild(replayBtn);
      body.appendChild(footer);
    }

    bubble.appendChild(avatar);
    bubble.appendChild(body);

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Load existing persistent history on startup
  loadSavedHistory();

  // --- Event Listeners ---

  // Floating Right-Down Strands Circle Widget Click Listener
  if (floatingVoiceWidget) {
    floatingVoiceWidget.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentState === 'listening') {
        stopListening();
      } else {
        startListening();
      }
    });
  }

  // Export History Button
  if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener('click', exportSpeechHistory);
  }

  // Microphone Main Button
  micBtn.addEventListener('click', () => {
    if (currentState === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  });

  // Stop Speaking Button
  stopSpeechBtn.addEventListener('click', stopSpeaking);

  // Hands-free Mode Toggle
  handsFreeBtn.addEventListener('click', () => {
    isHandsFree = !isHandsFree;
    handsFreeBtn.classList.toggle('active', isHandsFree);
    showToast(isHandsFree ? 'Hands-Free Continuous Mode Activated' : 'Push-to-Talk Mode Activated', 2500);
    setState(currentState);
  });

  // Chat Form (Text Submission)
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = textInput.value.trim();
    if (!query) return;
    textInput.value = '';
    handleUserSpeech(query);
  });

  // Quick Command Chips
  document.querySelectorAll('.cmd-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-command');
      if (cmd) handleUserSpeech(cmd);
    });
  });

  // Laptop Stats Button
  systemStatsBtn.addEventListener('click', () => {
    handleUserSpeech('Check laptop battery and specs');
  });

  // Clear Chat History
  clearChatBtn.addEventListener('click', () => {
    conversationHistory = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    chatMessages.innerHTML = '';
    updateHistoryBadge();
    appendMessage('nova', 'History cleared. Ready for your next command!', null, null, false);
  });

  // Settings Modal Controls
  openSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  saveAndCloseBtn.addEventListener('click', async () => {
    const selectedVoiceName = ttsVoiceSelect.value;
    selectedVoice = availableVoices.find(v => v.name === selectedVoiceName) || selectedVoice;
    
    currentModelDisplay.textContent = modelSelect.value;

    // Send updated settings to server
    try {
      await fetch(API_BASE + '/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKeyInput.value.trim(),
          activeModel: modelSelect.value
        })
      });
      showToast('Settings saved successfully!');
    } catch (e) {}

    settingsModal.style.display = 'none';
  });

  // Sliders input events
  speechSpeed.addEventListener('input', (e) => {
    speedVal.textContent = e.target.value;
  });

  speechPitch.addEventListener('input', (e) => {
    pitchVal.textContent = e.target.value;
  });

  // Close modal on click outside
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });
});

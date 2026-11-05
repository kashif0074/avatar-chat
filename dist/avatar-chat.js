(function (root, factory) {
  if (typeof exports === "object" && typeof module !== "undefined") {
    factory(exports);
  } else {
    factory(typeof window !== "undefined" ? window : globalThis);
  }
})(this, function (g) {
class AvatarSpeaker {
  #muted = false;
  #utterances = [];
  #generation = 0;
  #audioCtx = null;
  #source = null;
  #raf = 0;
  #browserRaf = 0;

  constructor({
    onAsk,
    idleVideo,
    talkingVideo,
    idleImage,
    canvas,
    onState = () => {},
    onAnswer = () => {},
    onVolume = () => {},
    onSpeechProgress = () => {},
    lang = "en-US",
    voiceName,
    speakUrl = "/speak",
  } = {}) {
    if (typeof onAsk !== "function") throw new Error("AvatarSpeaker: onAsk is required");
    this.onAsk = onAsk;
    this.onAnswer = onAnswer;
    this.onState = onState;
    this.onVolume = onVolume;
    this.onSpeechProgress = onSpeechProgress;
    this.idleVideo = idleVideo;
    this.talkingVideo = talkingVideo;
    this.idleImage = idleImage;
    this.canvas = canvas;
    this.lang = lang;
    this.voiceName = voiceName;
    this.speakUrl = speakUrl;

    this.#prep(idleVideo, true);
    this.#prep(talkingVideo, false);
    this.#state("idle");
  }

  get muted() {
    return this.#muted;
  }

  set muted(value) {
    this.#muted = !!value;
    if (this.#muted) this.stop();
  }

  async ask(question) {
    const generation = ++this.#generation;
    this.#primeAudio();
    this.#cancelSpeech();
    this.#state("thinking");
    try {
      const answer = await this.onAsk(question);
      if (generation !== this.#generation) return answer;
      await this.say(answer, generation);
      if (generation === this.#generation) {
        this.onAnswer(answer);
      }
      return answer;
    } catch (error) {
      if (generation === this.#generation) this.#state("idle");
      throw error;
    }
  }

  async say(text, generation = this.#generation) {
    const spoken = String(text ?? "").replace(/\s+/g, " ").trim();
    if (this.#muted || !spoken) {
      this.#state("idle");
      return;
    }

    this.#cancelSpeech();
    try {
      const audioBuffer = await this.#fetchSpeech(spoken);
      if (generation !== this.#generation) return;
      this.#state("speaking");
      await this.#playSynced(audioBuffer, generation, spoken);
    } catch {
      if (generation !== this.#generation) return;
      await this.#sayBrowser(spoken, generation);
    }
  }

  stop() {
    this.#generation += 1;
    this.#cancelSpeech();
    this.#state("idle");
  }

  #primeAudio() {
    try {
      const ctx = this.#context();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  #prep(video, shouldPlay) {
    if (!video) return;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    if (shouldPlay) {
      this.#play(video);
    } else {
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }

  #play(video) {
    if (!video) return;
    const play = video.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
  }

  async #fetchSpeech(text) {
    const response = await fetch(this.speakUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("tts_failed");
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error("tts_empty");
    return buffer;
  }

  async #playSynced(arrayBuffer, generation, spokenText = "") {
    const ctx = this.#context();
    if (ctx.state === "suspended") await ctx.resume();
    const audio = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (generation !== this.#generation) return;

    const envelope = buildEnvelope(audio);
    const source = ctx.createBufferSource();
    source.buffer = audio;

    let analyser = null;
    let dataArray = null;
    try {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      analyser.connect(ctx.destination);
    } catch {
      source.connect(ctx.destination);
    }

    this.#source = source;

    const video = this.talkingVideo;
    if (video) {
      video.loop = true;
      video.playbackRate = 1.0;
      this.#play(video);
    }

    const words = String(spokenText || "").trim().split(/\s+/).filter(Boolean);
    const wordTimings = calculateWordTimings(spokenText, audio.duration);
    let nextWordIdx = -1;

    const started = ctx.currentTime;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(this.#raf);
      this.onVolume(0);
      if (video) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      }
      if (words.length > 0) {
        this.onSpeechProgress({
          text: spokenText,
          words,
          currentWordIndex: words.length - 1,
          currentWord: words[words.length - 1],
          isComplete: true,
        });
      }
      if (generation === this.#generation) this.#state("idle");
    };

    source.onended = finish;
    source.start();

    let pauseCounter = 0;

    const tick = () => {
      if (settled || generation !== this.#generation) {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
        finish();
        return;
      }
      const t = ctx.currentTime - started;
      if (t >= audio.duration) {
        finish();
        return;
      }

      // Live word-by-word subtitle and speech progression
      if (wordTimings.length > 0) {
        while (nextWordIdx + 1 < wordTimings.length && wordTimings[nextWordIdx + 1].time <= t) {
          nextWordIdx += 1;
          this.onSpeechProgress({
            text: spokenText,
            words,
            currentWordIndex: nextWordIdx,
            currentWord: words[nextWordIdx],
            isComplete: false,
          });
        }
      }

      const openness = envelope.at(t);
      const isSpeaking = envelope.isSpeaking(t);

      // Volume feedback for live waveform
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) sum += dataArray[i];
        const vol = sum / (dataArray.length * 255);
        this.onVolume(Math.max(vol, openness * 0.75));
      } else {
        this.onVolume(openness);
      }

      // Synchronize talking video with natural speech cadence
      if (video) {
        if (isSpeaking) {
          pauseCounter = 0;
          if (video.paused) {
            this.#play(video);
          }
          video.playbackRate = 0.94 + openness * 0.16;
        } else {
          pauseCounter += 1;
          // Natural pause between words / sentences (rest mouth)
          if (pauseCounter > 6 && !video.paused) {
            video.playbackRate = 0.3;
          }
          if (pauseCounter > 16 && !video.paused) {
            try {
              video.pause();
            } catch {
              /* ignore */
            }
          }
        }
      }

      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);

    await new Promise((resolve) => {
      const wait = () => {
        if (settled) resolve();
        else requestAnimationFrame(wait);
      };
      wait();
    });
  }

  #context() {
    if (!this.#audioCtx) {
      const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AudioCtx) this.#audioCtx = new AudioCtx();
    }
    return this.#audioCtx;
  }

  #sayBrowser(spoken, generation) {
    if (!("speechSynthesis" in globalThis)) {
      this.#state("idle");
      return Promise.resolve();
    }
    const words = String(spoken || "").trim().split(/\s+/).filter(Boolean);
    const estimatedDuration = Math.max(1.5, words.length * 0.38);
    const wordTimings = calculateWordTimings(spoken, estimatedDuration);
    let nextWordIdx = -1;
    let speechStartTime = 0;

    const parts = spoken.match(/[^.!?]+[.!?]*/g)?.map((part) => part.trim()).filter(Boolean) || [spoken];
    const voice = this.#pickVoice();
    const video = this.talkingVideo;

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled || generation !== this.#generation) return;
        settled = true;
        cancelAnimationFrame(this.#browserRaf);
        this.onVolume(0);
        if (video) {
          try {
            video.pause();
          } catch {
            /* ignore */
          }
        }
        if (words.length > 0) {
          this.onSpeechProgress({
            text: spoken,
            words,
            currentWordIndex: words.length - 1,
            currentWord: words[words.length - 1],
            isComplete: true,
          });
        }
        this.#state("idle");
        resolve();
      };

      const startSpeechAnimation = () => {
        speechStartTime = performance.now();
        let t = 0;
        if (video) {
          video.playbackRate = 1.0;
          this.#play(video);
        }
        const tick = () => {
          if (settled || generation !== this.#generation) return;
          const elapsed = (performance.now() - speechStartTime) / 1000;
          if (wordTimings.length > 0) {
            while (nextWordIdx + 1 < wordTimings.length && wordTimings[nextWordIdx + 1].time <= elapsed) {
              nextWordIdx += 1;
              this.onSpeechProgress({
                text: spoken,
                words,
                currentWordIndex: nextWordIdx,
                currentWord: words[nextWordIdx],
                isComplete: false,
              });
            }
          }

          t += 0.12;
          const energy = (Math.sin(t * 3.8) + 1) * 0.35 + (Math.sin(t * 1.6) + 1) * 0.15;
          this.onVolume(energy);
          if (video) {
            if (energy > 0.15 && video.paused) {
              this.#play(video);
            }
          }
          this.#browserRaf = requestAnimationFrame(tick);
        };
        this.#browserRaf = requestAnimationFrame(tick);
      };

      parts.forEach((part, index) => {
        const utterance = new SpeechSynthesisUtterance(part);
        utterance.lang = this.lang;
        utterance.rate = 1;
        utterance.pitch = 1;
        if (voice) utterance.voice = voice;
        if (index === 0) {
          utterance.onstart = () => {
            this.#state("speaking");
            startSpeechAnimation();
          };
        }
        if (index === parts.length - 1) {
          utterance.onend = finish;
          utterance.onerror = finish;
        }
        this.#utterances.push(utterance);
        speechSynthesis.speak(utterance);
      });
      try {
        speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    });
  }

  #cancelSpeech() {
    this.#utterances = [];
    cancelAnimationFrame(this.#raf);
    cancelAnimationFrame(this.#browserRaf);
    this.onVolume(0);
    this.onSpeechProgress({ isCancelled: true });
    if (this.#source) {
      try {
        this.#source.stop();
      } catch {
        /* already stopped */
      }
      this.#source = null;
    }
    if (this.talkingVideo) {
      try {
        this.talkingVideo.pause();
      } catch {
        /* ignore */
      }
    }
    if ("speechSynthesis" in globalThis) speechSynthesis.cancel();
  }

  #pickVoice() {
    if (!("speechSynthesis" in globalThis)) return null;
    const voices = speechSynthesis.getVoices();
    const prefix = this.lang.split("-")[0];
    if (this.voiceName) {
      const named = voices.find((voice) => voice.name === this.voiceName);
      if (named) return named;
    }
    return (
      voices.find((voice) => voice.lang?.startsWith(prefix) && voice.localService) ||
      voices.find((voice) => voice.lang?.startsWith(prefix)) ||
      null
    );
  }

  #state(state) {
    const speaking = state === "speaking";
    const idle = this.idleVideo;
    const talking = this.talkingVideo;
    const image = this.idleImage;
    const canvas = this.canvas;

    if (image) {
      if (speaking && talking) {
        image.classList.remove("active");
      } else {
        image.classList.add("active");
      }
    }

    if (idle) {
      if (speaking) {
        idle.classList.remove("active");
        idle.pause();
      } else {
        idle.classList.add("active");
        this.#play(idle);
      }
    }

    if (talking) {
      if (speaking) {
        talking.classList.add("active");
        this.#play(talking);
      } else {
        if (image || idle) {
          talking.classList.remove("active");
          talking.pause();
        } else {
          talking.classList.add("active");
          talking.pause();
        }
        try {
          talking.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    }

    if (canvas && !talking && !image && !idle) {
      if (speaking) {
        canvas.classList.add("active");
      } else {
        canvas.classList.remove("active");
      }
    }

    this.onState(state);
  }
}

function calculateWordTimings(text, duration) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (duration <= 0) return words.map((w, i) => ({ word: w, time: 0, index: i }));

  const weights = words.map((w) => {
    let weight = Math.max(2.2, w.replace(/[^\w]/g, "").length);
    if (/[,;:]$/.test(w)) weight += 3.2;
    if (/[.!?]$/.test(w)) weight += 5.5;
    return weight;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const leadIn = Math.min(0.18, duration * 0.05);
  const available = Math.max(0.1, duration - leadIn - 0.2);

  let cumulative = 0;
  return words.map((word, i) => {
    const time = leadIn + (cumulative / totalWeight) * available;
    cumulative += weights[i];
    return { word, time: Math.round(time * 1000) / 1000, index: i };
  });
}

function buildEnvelope(buffer) {
  const samples = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const hop = Math.max(1, Math.floor(sr * 0.01)); // 10ms frame step
  const win = Math.max(8, Math.floor(sr * 0.025)); // 25ms energy window
  const frames = [];
  let peak = 1e-6;

  for (let i = 0; i < samples.length; i += hop) {
    let sum = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j += 1) {
      const v = samples[j];
      sum += v * v;
    }
    const n = end - i || 1;
    const rms = Math.sqrt(sum / n);
    if (rms > peak) peak = rms;
    frames.push(rms);
  }

  if (!frames.length) {
    return {
      duration: 0,
      at: () => 0,
      isSpeaking: () => false,
    };
  }

  // Biomechanical asymmetric follower: fast attack (~40ms), realistic release (~90ms)
  const smoothed = new Float32Array(frames.length);
  let current = 0;
  const attack = 0.35;
  const decay = 0.12;

  for (let i = 0; i < frames.length; i += 1) {
    const raw = frames[i] / peak;
    const gated = raw < 0.05 ? 0 : raw;
    const target = Math.min(1, Math.pow(gated * 1.35, 1.2));
    if (target > current) {
      current += (target - current) * attack;
    } else {
      current += (target - current) * decay;
    }
    smoothed[i] = current;
  }

  return {
    duration: samples.length / sr,
    at(time) {
      const idx = Math.max(0, Math.min(smoothed.length - 1, Math.round(time / 0.01)));
      return smoothed[idx] || 0;
    },
    isSpeaking(time) {
      const idx = Math.max(0, Math.min(smoothed.length - 1, Math.round(time / 0.01)));
      return (smoothed[idx] || 0) > 0.08;
    },
  };
}


const STYLES = `
:host {
  all: initial;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #0f172a;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after {
  box-sizing: border-box;
}

.wrap {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 24px;
  box-shadow: 0 20px 48px -12px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Floating Widget Mode */
.wrap.floating {
  position: fixed;
  bottom: 84px;
  right: 24px;
  width: 380px;
  max-width: calc(100vw - 32px);
  height: min(520px, calc(100vh - 100px));
  max-height: calc(100vh - 98px);
  margin: 0;
  z-index: 99999;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(24px) scale(0.95);
  transform-origin: bottom right;
  transition: opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
              visibility 0.28s;
  box-shadow: 0 24px 64px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.9);
}

.wrap.floating.pos-left {
  right: auto;
  left: 24px;
  transform-origin: bottom left;
}

.wrap.floating.is-open {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #f1f5f9;
  z-index: 10;
}

.avatar-badge-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.avatar-thumb {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 13.5px;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.22);
  flex-shrink: 0;
  position: relative;
}

.avatar-thumb::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: inherit;
  filter: blur(4px);
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: -1;
}

.wrap[data-state="speaking"] .avatar-thumb::after {
  opacity: 0.6;
  animation: pulse-ring 1.8s infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 0.2; }
  100% { transform: scale(1); opacity: 0.6; }
}

.who {
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: #0f172a;
  line-height: 1.2;
}

.badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 20px;
  background: #f1f5f9;
  color: #475569;
}

.meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 1px;
  color: #64748b;
  font-size: 11.5px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  transition: background 0.2s ease, box-shadow 0.2s ease;
}

.dot[data-state="thinking"] {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25);
  animation: dot-pulse 1s infinite alternate;
}

.dot[data-state="speaking"] {
  background: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
  animation: dot-pulse 0.7s infinite alternate;
}

@keyframes dot-pulse {
  from { transform: scale(0.9); }
  to { transform: scale(1.25); }
}

/* Sound Wave Bars */
.sound-bars {
  display: none;
  align-items: center;
  gap: 2px;
  height: 12px;
  margin-left: 2px;
}

.wrap[data-state="speaking"] .sound-bars {
  display: flex;
}

.sound-bars span {
  width: 2.5px;
  background: #6366f1;
  border-radius: 2px;
  animation: bar-dance 0.7s ease-in-out infinite alternate;
}

.sound-bars span:nth-child(1) { height: 6px; animation-delay: 0.1s; }
.sound-bars span:nth-child(2) { height: 12px; animation-delay: 0.25s; }
.sound-bars span:nth-child(3) { height: 8px; animation-delay: 0.4s; }

@keyframes bar-dance {
  0% { transform: scaleY(0.3); }
  100% { transform: scaleY(1); }
}

/* Header Action Controls */
.controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  padding: 0;
}

.icon-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
}

.icon-btn:active {
  transform: scale(0.96);
}

.icon-btn:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}

.icon-btn[aria-pressed="true"] {
  background: #0f172a;
  border-color: #0f172a;
  color: #ffffff;
}

.icon-btn.stop-btn {
  display: none;
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}

.wrap[data-state="speaking"] .icon-btn.stop-btn {
  display: inline-flex;
}

.icon-btn.stop-btn:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.icon-btn.close-btn {
  background: #f1f5f9;
  color: #475569;
}

.icon-btn.close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.icon-btn.pos-btn {
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
}

.icon-btn.pos-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

/* Floating Launcher Component */
.launcher {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 99998;
  display: flex;
  align-items: center;
  gap: 12px;
}

.launcher.pos-left {
  right: auto;
  left: 24px;
  flex-direction: row-reverse;
}

.launcher-btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2.5px solid #ffffff;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 14px 34px -4px rgba(15, 23, 42, 0.35), 0 4px 12px rgba(99, 102, 241, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 0;
  outline: none;
}

.launcher-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 18px 40px -4px rgba(15, 23, 42, 0.42), 0 6px 18px rgba(99, 102, 241, 0.35);
}

.launcher-btn:active {
  transform: scale(0.95);
}

.launcher-btn:focus-visible {
  outline: 3px solid #6366f1;
  outline-offset: 3px;
}

.launcher-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  object-position: center 25%;
  display: block;
}

.launcher-status {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #10b981;
  border: 2.5px solid #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.launcher-status::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: #10b981;
  animation: launcher-pulse 2s infinite ease-out;
  opacity: 0.7;
  z-index: -1;
}

@keyframes launcher-pulse {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(2.4); opacity: 0; }
}

.launcher-icon-open,
.launcher-icon-close {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.launcher-icon-open {
  border-radius: 50%;
  overflow: hidden;
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

.launcher-icon-close {
  opacity: 0;
  transform: scale(0.5) rotate(-90deg);
  color: #ffffff;
}

.launcher[data-open="true"] .launcher-icon-open {
  opacity: 0;
  transform: scale(0.5) rotate(90deg);
}

.launcher[data-open="true"] .launcher-icon-close {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

.launcher-tooltip {
  background: #ffffff;
  color: #0f172a;
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.14), 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
  white-space: nowrap;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.2s ease, transform 0.2s ease;
  animation: float-tip 3.5s infinite ease-in-out;
}

@keyframes float-tip {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.launcher[data-open="true"] .launcher-tooltip {
  opacity: 0;
  transform: scale(0.85);
  pointer-events: none;
}

/* Stage & Corporate Office Background */
.stage {
  position: relative;
  width: 100%;
  flex: 0 0 230px;
  height: 230px;
  min-height: 220px;
  max-height: 240px;
  background: #edeae3;
  overflow: hidden;
  border-bottom: 1px solid #f1f5f9;
}

/* Office Ambient Backdrop */
.stage-bg {
  position: absolute;
  inset: -10px;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
  background: #edeae3 url('/assets/avatar_idle.png') center 35% / cover no-repeat;
  filter: blur(16px);
  opacity: 0.95;
  transform: scale(1.06);
}

/* Soft Natural Office Lighting Glow behind Avatar */
.stage-aura {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 40%, rgba(99, 102, 241, 0.08) 0%, rgba(255, 235, 200, 0.05) 50%, transparent 75%);
  opacity: 0;
  filter: blur(20px);
  z-index: 2;
  pointer-events: none;
  transition: opacity 0.35s ease;
}

.wrap[data-state="speaking"] .stage-aura {
  opacity: 1;
  animation: aura-glow 2.4s infinite ease-in-out;
}

@keyframes aura-glow {
  0%, 100% { opacity: 0.6; transform: scale(0.98); }
  50% { opacity: 0.9; transform: scale(1.02); }
}

/* Avatar Media: Centered naturally, comfortable head/shoulders bust framing, full and clear */
.stage-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 35%;
  opacity: 0;
  z-index: 3;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

/* Live Subtitles overlay at bottom of stage */
.stage-subtitles {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 6;
  pointer-events: none;
}

.subtitle-pill {
  max-width: 95%;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #f8fafc;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1);
  text-align: center;
  word-break: break-word;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.subtitle-pill.active {
  opacity: 1;
  transform: translateY(0);
}

.subtitle-pill .sub-prev {
  color: #94a3b8;
  margin-right: 4px;
}

.subtitle-pill .sub-cur {
  color: #38bdf8;
  font-weight: 700;
  text-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
}

.stage-media.active {
  opacity: 1;
  pointer-events: auto;
}

.fallback {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity 0.28s ease;
  pointer-events: none;
  transform: translateY(2%) scale(0.88);
  transform-origin: center bottom;
}

.fallback.active {
  opacity: 1;
  pointer-events: auto;
}

.face {
  width: 44%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffffff, #e2e8f0);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12), inset 0 2px 4px rgba(255, 255, 255, 0.8);
  position: relative;
}

.face::before,
.face::after {
  content: "";
  position: absolute;
  top: 38%;
  width: 8%;
  height: 8%;
  border-radius: 50%;
  background: #334155;
}

.face::before { left: 28%; }
.face::after { right: 28%; }

.mouth {
  position: absolute;
  left: 50%;
  bottom: 26%;
  width: 24%;
  height: 8%;
  border: 2.5px solid #334155;
  border-top: 0;
  border-radius: 0 0 14px 14px;
  transform: translateX(-50%);
  transition: height 0.08s ease, border-radius 0.08s ease;
}

.wrap[data-state="speaking"] .fallback.active .mouth {
  animation: talk-anim 0.32s ease-in-out infinite alternate;
}

@keyframes talk-anim {
  0% { height: 8%; border-radius: 0 0 12px 12px; }
  100% { height: 18%; border-radius: 0 0 18px 18px; }
}

/* Chat Log */
.log {
  flex: 1 1 auto;
  min-height: 100px;
  max-height: none;
  overflow-y: auto;
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f8fafc;
  scroll-behavior: smooth;
}

.log::-webkit-scrollbar {
  width: 5px;
}
.log::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

/* Empty State / Quick Suggestions */
.empty-box {
  margin: auto;
  text-align: center;
  padding: 6px 4px;
}

.empty-title {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  margin: 0 0 2px;
}

.empty-sub {
  font-size: 11.5px;
  color: #94a3b8;
  margin: 0 0 8px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
}

.chip {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 4px 10px;
  font-size: 11.5px;
  color: #334155;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.chip:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #0f172a;
  transform: translateY(-1px);
}

/* Message Rows */
.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
}

.row.user {
  justify-content: flex-end;
}

.bot-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
}

.bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 82%;
}

.row.user .bubble-wrap {
  align-items: flex-end;
}

.bubble {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 13.5px;
  line-height: 1.45;
  word-break: break-word;
  position: relative;
  transition: box-shadow 0.2s ease;
}

.row.user .bubble {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #ffffff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
}

.row.bot .bubble {
  background: #ffffff;
  color: #1e293b;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.row.bot.speaking-live .bubble {
  border-color: #cbd5e1;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.08);
}

.live-cursor {
  display: inline-block;
  width: 2px;
  height: 13px;
  background: #6366f1;
  margin-left: 2px;
  vertical-align: -1px;
  animation: cursor-blink 0.8s infinite;
}

@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.row.error .bubble {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}

.bubble-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  padding: 0 4px;
  font-size: 11px;
  color: #94a3b8;
}

.copy-btn {
  background: none;
  border: 0;
  padding: 0;
  color: #94a3b8;
  cursor: pointer;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  transition: color 0.15s ease;
}

.copy-btn:hover {
  color: #475569;
}

/* Typing Indicator */
.typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
}

.typing span {
  width: 6px;
  height: 6px;
  background: #94a3b8;
  border-radius: 50%;
  animation: typing-bounce 1.2s infinite ease-in-out;
}

.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* Composer / Input */
.composer-wrap {
  padding: 8px 12px;
  background: #ffffff;
  border-top: 1px solid #f1f5f9;
}

.composer {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 3px 6px 3px 12px;
  transition: all 0.2s ease;
}

.composer:focus-within {
  background: #ffffff;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.field {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 6px 0;
  font: inherit;
  font-size: 13.5px;
  color: #0f172a;
}

.field:focus {
  outline: none;
}

.field::placeholder {
  color: #94a3b8;
}

.mic-btn {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.mic-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.mic-btn[aria-pressed="true"] {
  background: #ef4444;
  color: #ffffff;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.25);
  animation: mic-pulse 1s infinite alternate;
}

@keyframes mic-pulse {
  from { transform: scale(0.96); }
  to { transform: scale(1.08); }
}

.send-btn {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: #0f172a;
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.send-btn:hover {
  background: #1e293b;
  transform: translateY(-1px);
}

.send-btn:active {
  transform: scale(0.96);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.composer-hint {
  margin-top: 4px;
  text-align: center;
  font-size: 10.5px;
  color: #94a3b8;
}

/* Responsive Breakpoints */
@media (max-width: 640px) {
  .launcher {
    bottom: 18px;
    right: 18px;
  }
  .launcher.pos-left {
    left: 18px;
    right: auto;
  }
  .launcher-btn {
    width: 56px;
    height: 56px;
  }
  .launcher-tooltip {
    display: none;
  }

  .wrap.floating {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    max-width: 100vw;
    max-height: 100dvh;
    border-radius: 0;
    border: 0;
    bottom: 0;
    right: 0;
    left: 0;
    top: 0;
    transform-origin: center bottom;
    transform: translateY(100%);
    box-shadow: none;
    z-index: 100000;
  }

  .wrap.floating.is-open {
    transform: translateY(0);
  }

  .wrap {
    max-width: 100%;
    border-radius: 0;
    border: 0;
    box-shadow: none;
  }

  .stage {
    flex: 0 0 240px;
    width: 100%;
    height: 240px;
    max-height: 240px;
    aspect-ratio: auto;
    border-radius: 0;
  }

  .stage-media {
    object-position: center 35%;
  }

  .log {
    flex: 1 1 auto;
    max-height: none;
    min-height: 120px;
    padding: 12px;
  }

  .bubble {
    font-size: 13.5px;
    padding: 9px 13px;
  }

  .header {
    padding: 12px 14px;
    border-radius: 0;
    flex-shrink: 0;
  }

  .composer-wrap {
    flex-shrink: 0;
    padding: 10px 12px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  }
}

@media (min-width: 641px) and (max-width: 1024px) {
  .wrap.floating {
    width: 390px;
    max-height: calc(100vh - 110px);
    bottom: 92px;
    right: 20px;
  }
  .wrap.floating.pos-left {
    left: 20px;
    right: auto;
  }
  .stage {
    flex: 0 0 230px;
    height: 230px;
    max-height: 240px;
  }
}
`;

const ICONS = {
  mic: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  mute: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  muted: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>`,
  stop: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  clear: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  chat: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  dock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>`,
};

class AvatarChat {
  static mount(target, options) {
    return new AvatarChat(target, options);
  }

  constructor(target, options = {}) {
    const host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host) throw new Error("AvatarChat: mount target not found");

    this.options = {
      title: "Ava",
      subtitle: "Voice assistant",
      badge: options.badge || "",
      endpoint: "/ask",
      placeholder: "Ask Ava anything…",
      idleSrc: options.idleSrc || options.idleVideo || "",
      talkingSrc: options.talkingSrc || options.talkingVideo || "",
      speakUrl: options.speakUrl || "/speak",
      lang: "en-US",
      floating: options.floating !== false,
      position: options.position === "bottom-left" ? "bottom-left" : "bottom-right",
      startOpen: options.startOpen === true,
      ...options,
    };

    this.isOpen = this.options.startOpen;
    this.position = this.options.position;

    const hasIdleImg = isImageSrc(this.options.idleSrc);
    const hasIdleVid = isVideoSrc(this.options.idleSrc);
    const hasTalkVid = Boolean(this.options.talkingSrc);

    // Initial visibility state
    const stillActive = hasIdleImg ? "active" : "";
    const idleVidActive = !hasIdleImg && hasIdleVid ? "active" : "";
    const talkVidActive = !hasIdleImg && !hasIdleVid && hasTalkVid ? "active" : "";
    const fallbackActive = !hasIdleImg && !hasIdleVid && !hasTalkVid ? "active" : "";

    const wrapFloatingClass = this.options.floating ? "floating" : "";
    const wrapPosClass = this.position === "bottom-left" ? "pos-left" : "";
    const wrapOpenClass = this.isOpen ? "is-open" : "";

    this.root = host.attachShadow({ mode: "open" });
    this.root.innerHTML = `
      <style>${STYLES}</style>
      <div class="wrap ${wrapFloatingClass} ${wrapPosClass} ${wrapOpenClass}" data-state="idle">
        <!-- Header -->
        <div class="header">
          <div class="avatar-badge-wrap">
            <div class="avatar-thumb" aria-hidden="true">A</div>
            <div class="who">
              <div class="title-row">
                <h2 class="title">${escapeHtml(this.options.title)}</h2>
                ${this.options.badge ? `<span class="badge">${escapeHtml(this.options.badge)}</span>` : ""}
              </div>
              <div class="meta">
                <span class="dot" data-state="idle"></span>
                <span class="status-text">${escapeHtml(this.options.subtitle)}</span>
                <div class="sound-bars" aria-hidden="true">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          </div>
          <div class="controls">
            <button class="icon-btn stop-btn" type="button" title="Stop speech" aria-label="Stop speech">${ICONS.stop}</button>
            <button class="icon-btn mute-btn" type="button" title="Mute voice" aria-pressed="false" aria-label="Mute voice">${ICONS.mute}</button>
            <button class="icon-btn clear-btn" type="button" title="Clear chat" aria-label="Clear chat">${ICONS.clear}</button>
            ${this.options.floating ? `<button class="icon-btn close-btn" type="button" title="Close chat" aria-label="Close chat">${ICONS.close}</button>` : ""}
          </div>
        </div>

        <!-- Stage with Corporate Office Background -->
        <div class="stage">
          <div class="stage-bg" aria-hidden="true"></div>
          <div class="stage-aura" aria-hidden="true"></div>
          ${hasIdleImg ? `<img class="stage-media idle-still ${stillActive}" src="${escapeAttr(this.options.idleSrc)}" alt="${escapeAttr(this.options.title)}">` : ""}
          ${hasIdleVid ? `<video class="stage-media idle-video ${idleVidActive}" src="${escapeAttr(this.options.idleSrc)}" autoplay loop muted playsinline></video>` : ""}
          ${hasTalkVid ? `<video class="stage-media talk-video ${talkVidActive}" src="${escapeAttr(this.options.talkingSrc)}" loop muted playsinline preload="auto"></video>` : ""}
          <canvas class="stage-media lips-canvas"></canvas>
          <div class="fallback ${fallbackActive}"><div class="face"><span class="mouth"></span></div></div>
          <div class="stage-subtitles" aria-live="polite">
            <div class="subtitle-pill" hidden>
              <span class="sub-prev"></span>
              <span class="sub-cur"></span>
            </div>
          </div>
        </div>

        <!-- Log -->
        <div class="log" role="log" aria-live="polite">
          <div class="empty-box">
            <p class="empty-title">Ready for conversation</p>
            <p class="empty-sub">Tap a topic or type below to speak with ${escapeHtml(this.options.title)}</p>
            <div class="chips">
              <button class="chip" type="button">👋 Who are you?</button>
              <button class="chip" type="button">💡 Fun fact</button>
              <button class="chip" type="button">🎤 Public speaking tip</button>
            </div>
          </div>
        </div>

        <!-- Composer -->
        <div class="composer-wrap">
          <form class="composer">
            <input class="field" name="q" autocomplete="off" placeholder="${escapeAttr(this.options.placeholder)}" aria-label="Type message">
            <button class="mic-btn" type="button" title="Speak through microphone" aria-label="Voice input">${ICONS.mic}</button>
            <button class="send-btn" type="submit" title="Send message" aria-label="Send">${ICONS.send}</button>
          </form>
          <div class="composer-hint">Press Enter to send · Click mic for voice input</div>
        </div>
      </div>

      ${this.options.floating ? `
        <!-- Floating Launcher Button -->
        <div class="launcher ${wrapPosClass}" data-open="${this.isOpen ? "true" : "false"}">
          <div class="launcher-tooltip">Chat with ${escapeHtml(this.options.title)} 👋</div>
          <button class="launcher-btn" type="button" title="Chat with ${escapeHtml(this.options.title)}" aria-label="Toggle chat" aria-expanded="${this.isOpen ? "true" : "false"}">
            <div class="launcher-icon-open">
              ${hasIdleImg ? `<img class="launcher-avatar" src="${escapeAttr(this.options.idleSrc)}" alt="${escapeAttr(this.options.title)}">` : ICONS.chat}
              <span class="launcher-status" aria-hidden="true"></span>
            </div>
            <div class="launcher-icon-close" aria-hidden="true">
              ${ICONS.close}
            </div>
          </button>
        </div>
      ` : ""}
    `;

    this.els = {
      wrap: this.root.querySelector(".wrap"),
      launcher: this.root.querySelector(".launcher"),
      launcherBtn: this.root.querySelector(".launcher-btn"),
      closeBtn: this.root.querySelector(".close-btn"),
      posBtn: this.root.querySelector(".pos-btn"),
      status: this.root.querySelector(".status-text"),
      dot: this.root.querySelector(".dot"),
      log: this.root.querySelector(".log"),
      subtitles: this.root.querySelector(".stage-subtitles"),
      subPill: this.root.querySelector(".subtitle-pill"),
      form: this.root.querySelector(".composer"),
      input: this.root.querySelector(".field"),
      send: this.root.querySelector(".send-btn"),
      mic: this.root.querySelector(".mic-btn"),
      mute: this.root.querySelector(".mute-btn"),
      stop: this.root.querySelector(".stop-btn"),
      clear: this.root.querySelector(".clear-btn"),
      still: this.root.querySelector(".idle-still"),
      idleVid: this.root.querySelector(".idle-video"),
      talkVid: this.root.querySelector(".talk-video"),
      lips: this.root.querySelector(".lips-canvas"),
      fallback: this.root.querySelector(".fallback"),
    };

    this.busy = false;
    this.hasVideo = hasTalkVid;
    this.hasIdleImageLoaded = false;
    this.activeLiveRow = null;
    this.hasStreamedLiveAnswer = false;

    this.#initMediaElements();

    this.avatar = new AvatarSpeaker({
      idleVideo: hasIdleVid ? this.els.idleVid : null,
      idleImage: hasIdleImg ? this.els.still : null,
      talkingVideo: hasTalkVid ? this.els.talkVid : null,
      canvas: this.els.lips,
      lang: this.options.lang,
      voiceName: this.options.voiceName,
      speakUrl: this.options.speakUrl,
      onAsk: (question) => this.#ask(question),
      onSpeechProgress: (progress) => this.#handleSpeechProgress(progress),
      onAnswer: (answer) => {
        if (this.hasStreamedLiveAnswer) {
          this.#finalizeLiveMessage(answer);
        } else {
          this.#addMessage("bot", answer);
        }
        this.#hideSubtitles();
      },
      onState: (state) => this.#renderState(state),
    });

    this.#bindEvents();
    this.#setupMic();

    if ("speechSynthesis" in globalThis) {
      speechSynthesis.getVoices();
    }
  }

  #initMediaElements() {
    if (this.els.talkVid) {
      const onTalkReady = () => {
        // If there's no idle image loaded yet, ensure talking video is visible paused at 0
        if (!this.hasIdleImageLoaded && !this.els.idleVid) {
          try {
            this.els.talkVid.currentTime = 0;
            this.els.talkVid.pause();
          } catch {
            /* ignore */
          }
          this.els.talkVid.classList.add("active");
          if (this.els.still) this.els.still.classList.remove("active");
          if (this.els.fallback) this.els.fallback.classList.remove("active");
        }
      };

      this.els.talkVid.addEventListener("loadeddata", onTalkReady);
      this.els.talkVid.addEventListener("canplay", onTalkReady);
      this.els.talkVid.addEventListener("error", () => {
        this.hasVideo = false;
        if (this.avatar) this.avatar.talkingVideo = null;
        if (!this.hasIdleImageLoaded && !this.els.idleVid) {
          if (this.els.fallback) this.els.fallback.classList.add("active");
        }
      });

      if (this.els.talkVid.readyState >= 2) {
        onTalkReady();
      }
    }

    if (this.els.still) {
      this.els.still.addEventListener("load", () => {
        this.hasIdleImageLoaded = true;
        this.els.still.classList.add("active");
        if (this.els.fallback) this.els.fallback.classList.remove("active");
        if (this.els.talkVid && this.avatar?.state !== "speaking") {
          this.els.talkVid.classList.remove("active");
        }
      });

      this.els.still.addEventListener("error", () => {
        this.hasIdleImageLoaded = false;
        if (this.els.still) this.els.still.classList.remove("active");
        if (this.avatar) this.avatar.idleImage = null;

        // Fallback to talking video paused at 0
        if (this.hasVideo && this.els.talkVid) {
          try {
            this.els.talkVid.currentTime = 0;
            this.els.talkVid.pause();
          } catch {
            /* ignore */
          }
          this.els.talkVid.classList.add("active");
          if (this.els.fallback) this.els.fallback.classList.remove("active");
        } else {
          if (this.els.fallback) this.els.fallback.classList.add("active");
        }
      });
    }

    if (this.els.idleVid) {
      this.els.idleVid.addEventListener("error", () => {
        if (this.avatar) this.avatar.idleVideo = null;
        if (this.els.idleVid) this.els.idleVid.classList.remove("active");
        if (this.hasVideo && this.els.talkVid) {
          this.els.talkVid.classList.add("active");
        } else {
          if (this.els.fallback) this.els.fallback.classList.add("active");
        }
      });
    }
  }

  #bindEvents() {
    this.els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#submit(this.els.input.value);
    });

    this.els.mute.addEventListener("click", () => {
      this.avatar.muted = !this.avatar.muted;
      this.els.mute.setAttribute("aria-pressed", String(this.avatar.muted));
      this.els.mute.innerHTML = this.avatar.muted ? ICONS.muted : ICONS.mute;
      this.els.mute.title = this.avatar.muted ? "Unmute voice" : "Mute voice";
      this.els.mute.setAttribute("aria-label", this.avatar.muted ? "Unmute voice" : "Mute voice");
    });

    this.els.stop.addEventListener("click", () => {
      this.avatar.stop();
      this.#finalizeLiveMessage();
      this.#hideSubtitles();
    });

    this.els.clear.addEventListener("click", () => {
      this.avatar.stop();
      this.#finalizeLiveMessage();
      this.#hideSubtitles();
      this.els.log.innerHTML = `
        <div class="empty-box">
          <p class="empty-title">Conversation cleared</p>
          <p class="empty-sub">Ask a new question below</p>
          <div class="chips">
            <button class="chip" type="button">👋 Who are you?</button>
            <button class="chip" type="button">💡 Fun fact</button>
            <button class="chip" type="button">🎤 Public speaking tip</button>
          </div>
        </div>
      `;
      this.#bindChips();
    });

    this.#bindChips();

    if (this.els.launcherBtn) {
      this.els.launcherBtn.addEventListener("click", () => this.toggle());
    }

    if (this.els.closeBtn) {
      this.els.closeBtn.addEventListener("click", () => this.close());
    }

    if (this.els.posBtn) {
      this.els.posBtn.addEventListener("click", () => this.togglePosition());
    }

    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.options.floating && this.isOpen) {
          this.close();
        } else {
          this.avatar.stop();
        }
      }
    });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.isOpen = true;
    this.els.wrap?.classList.add("is-open");
    if (this.els.launcher) this.els.launcher.dataset.open = "true";
    this.els.launcherBtn?.setAttribute("aria-expanded", "true");

    if (this.els.talkVid && !this.els.idleVid && !this.hasIdleImageLoaded) {
      try {
        this.els.talkVid.currentTime = 0;
        this.els.talkVid.pause();
      } catch {
        /* ignore */
      }
    }

    if (window.matchMedia && !window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
      setTimeout(() => this.els.input?.focus(), 250);
    }
  }

  close() {
    this.isOpen = false;
    this.els.wrap?.classList.remove("is-open");
    if (this.els.launcher) this.els.launcher.dataset.open = "false";
    this.els.launcherBtn?.setAttribute("aria-expanded", "false");
  }

  togglePosition() {
    this.position = this.position === "bottom-left" ? "bottom-right" : "bottom-left";
    const isLeft = this.position === "bottom-left";
    this.els.wrap?.classList.toggle("pos-left", isLeft);
    this.els.launcher?.classList.toggle("pos-left", isLeft);
  }

  #bindChips() {
    const chips = this.els.log.querySelectorAll(".chip");
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const text = chip.textContent.replace(/^[^\w\s]+/, "").trim();
        this.#submit(text);
      });
    });
  }

  async #submit(raw) {
    const question = String(raw || "").trim();
    if (!question || this.busy) return;

    this.els.input.value = "";
    this.hasStreamedLiveAnswer = false;
    this.#finalizeLiveMessage();
    this.#hideSubtitles();
    this.#addMessage("user", question);
    this.busy = true;
    this.els.send.disabled = true;
    this.els.input.disabled = true;

    const thinkingEl = this.#showThinking();

    try {
      await this.avatar.ask(question);
    } catch (error) {
      console.error("Avatar error:", error);
      this.avatar.stop();
      this.#finalizeLiveMessage();
      this.#hideSubtitles();
      this.#addMessage("error", "Sorry, I could not get an answer. Please try again.");
    } finally {
      thinkingEl?.remove();
      this.busy = false;
      this.els.send.disabled = false;
      this.els.input.disabled = false;
      this.els.input.focus();
    }
  }

  #handleSpeechProgress({ text, words, currentWordIndex, currentWord, isComplete, isCancelled }) {
    if (isCancelled) {
      this.#finalizeLiveMessage();
      this.#hideSubtitles();
      return;
    }

    this.hasStreamedLiveAnswer = true;

    // Clear thinking bubble as soon as speech starts
    this.els.log.querySelector(".thinking-row")?.remove();

    if (!this.activeLiveRow) {
      this.els.log.querySelector(".empty-box")?.remove();
      const row = document.createElement("div");
      row.className = "row bot speaking-live";
      row.innerHTML = `
        <div class="bot-avatar" aria-hidden="true">A</div>
        <div class="bubble-wrap">
          <div class="bubble"><span class="live-text"></span><span class="live-cursor"></span></div>
          <div class="bubble-footer" style="display: none;">
            <span class="bubble-time"></span>
            <button class="copy-btn" type="button" title="Copy text">${ICONS.copy} Copy</button>
          </div>
        </div>
      `;
      this.els.log.append(row);
      this.activeLiveRow = row;
    }

    const liveTextEl = this.activeLiveRow.querySelector(".live-text");
    if (liveTextEl && words) {
      const revealedWords = words.slice(0, currentWordIndex + 1).join(" ");
      liveTextEl.textContent = revealedWords;
    }
    this.els.log.scrollTop = this.els.log.scrollHeight;

    // Real-time live subtitle pill on stage
    if (this.els.subPill && words) {
      this.els.subPill.hidden = false;
      this.els.subPill.classList.add("active");
      const subPrev = this.els.subPill.querySelector(".sub-prev");
      const subCur = this.els.subPill.querySelector(".sub-cur");

      // Show recent window of up to 4 words before current word
      const startIdx = Math.max(0, currentWordIndex - 4);
      const prevWords = words.slice(startIdx, currentWordIndex).join(" ");
      if (subPrev) subPrev.textContent = prevWords ? prevWords + " " : "";
      if (subCur) subCur.textContent = currentWord || "";
    }

    if (isComplete) {
      this.#finalizeLiveMessage(text);
      this.#hideSubtitles();
    }
  }

  #finalizeLiveMessage(fullText) {
    if (!this.activeLiveRow) return;
    const row = this.activeLiveRow;
    this.activeLiveRow = null;

    row.classList.remove("speaking-live");
    row.querySelector(".live-cursor")?.remove();

    const liveTextEl = row.querySelector(".live-text");
    if (fullText && liveTextEl) {
      liveTextEl.textContent = fullText;
    }

    const footer = row.querySelector(".bubble-footer");
    if (footer) {
      footer.style.display = "flex";
      const timeEl = footer.querySelector(".bubble-time");
      if (timeEl) {
        timeEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      const copyBtn = footer.querySelector(".copy-btn");
      const textToCopy = fullText || liveTextEl?.textContent || "";
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          navigator.clipboard?.writeText(textToCopy).then(() => {
            copyBtn.textContent = "Copied!";
            setTimeout(() => {
              copyBtn.innerHTML = `${ICONS.copy} Copy`;
            }, 1800);
          });
        });
      }
    }
    this.els.log.scrollTop = this.els.log.scrollHeight;
  }

  #hideSubtitles() {
    if (this.els.subPill) {
      this.els.subPill.classList.remove("active");
      setTimeout(() => {
        if (!this.avatar || this.avatar.state !== "speaking") {
          this.els.subPill.hidden = true;
        }
      }, 300);
    }
  }

  async #ask(question) {
    if (typeof this.options.onAsk === "function") return this.options.onAsk(question);
    const response = await fetch(this.options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "request failed");
    if (!data.answer) throw new Error("empty answer");
    return data.answer;
  }

  #showThinking() {
    this.els.log.querySelector(".empty-box")?.remove();
    const row = document.createElement("div");
    row.className = "row bot thinking-row";
    row.innerHTML = `
      <div class="bot-avatar" aria-hidden="true">A</div>
      <div class="bubble-wrap">
        <div class="bubble typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    this.els.log.append(row);
    this.els.log.scrollTop = this.els.log.scrollHeight;
    return row;
  }

  #addMessage(role, text) {
    if (role === "bot") {
      this.hasStreamedLiveAnswer = true;
    }
    this.#finalizeLiveMessage();
    this.#hideSubtitles();
    this.els.log.querySelector(".empty-box")?.remove();
    this.els.log.querySelector(".thinking-row")?.remove();

    const row = document.createElement("div");
    row.className = `row ${role === "user" ? "user" : role === "error" ? "bot error" : "bot"}`;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (role === "user") {
      row.innerHTML = `
        <div class="bubble-wrap">
          <div class="bubble">${escapeHtml(text)}</div>
          <div class="bubble-footer">${time}</div>
        </div>
      `;
    } else {
      row.innerHTML = `
        <div class="bot-avatar" aria-hidden="true">A</div>
        <div class="bubble-wrap">
          <div class="bubble">${escapeHtml(text)}</div>
          <div class="bubble-footer">
            <span>${time}</span>
            <button class="copy-btn" type="button" title="Copy text">${ICONS.copy} Copy</button>
          </div>
        </div>
      `;

      const copyBtn = row.querySelector(".copy-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          navigator.clipboard?.writeText(text).then(() => {
            copyBtn.textContent = "Copied!";
            setTimeout(() => {
              copyBtn.innerHTML = `${ICONS.copy} Copy`;
            }, 1800);
          });
        });
      }
    }

    this.els.log.append(row);
    this.els.log.scrollTop = this.els.log.scrollHeight;
  }

  #renderState(state) {
    const labels = {
      thinking: "Thinking…",
      speaking: "Speaking…",
      idle: this.options.subtitle || "Ready",
    };
    this.els.wrap.dataset.state = state;
    this.els.dot.dataset.state = state;
    this.els.status.textContent = labels[state] || this.options.subtitle || "Ready";
  }

  #setupMic() {
    const Rec = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Rec) {
      this.els.mic.hidden = true;
      return;
    }
    const recognition = new Rec();
    recognition.lang = this.options.lang;
    recognition.interimResults = false;

    let listening = false;
    const setListening = (val) => {
      listening = val;
      this.els.mic.setAttribute("aria-pressed", String(val));
    };

    this.els.mic.addEventListener("click", () => {
      if (this.busy) return;
      if (listening) {
        try {
          recognition.stop();
        } catch {
          /* ignore */
        }
        setListening(false);
        return;
      }
      try {
        recognition.start();
        setListening(true);
      } catch {
        /* already started */
      }
    });

    recognition.onresult = (event) => {
      setListening(false);
      const text = event.results[0]?.[0]?.transcript || "";
      this.#submit(text);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function isVideoSrc(src) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(src || "");
}

function isImageSrc(src) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(src || "");
}


  g.AvatarSpeaker = AvatarSpeaker;
  g.AvatarChat = AvatarChat;
});

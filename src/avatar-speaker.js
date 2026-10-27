export class AvatarSpeaker {
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
    lang = "en-US",
    voiceName,
    speakUrl = "/speak",
  } = {}) {
    if (typeof onAsk !== "function") throw new Error("AvatarSpeaker: onAsk is required");
    this.onAsk = onAsk;
    this.onAnswer = onAnswer;
    this.onState = onState;
    this.onVolume = onVolume;
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
      this.onAnswer(answer);
      await this.say(answer, generation);
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
      await this.#playSynced(audioBuffer, generation);
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

  async #playSynced(arrayBuffer, generation) {
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
        this.#state("idle");
        resolve();
      };

      const startSpeechAnimation = () => {
        let t = 0;
        if (video) {
          video.playbackRate = 1.0;
          this.#play(video);
        }
        const tick = () => {
          if (settled || generation !== this.#generation) return;
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
          try {
            talking.currentTime = 0;
          } catch {
            /* ignore */
          }
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

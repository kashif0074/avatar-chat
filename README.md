# avatar-chat

Lightweight, zero-GPU talking avatar voice assistant core. Bring your own LLM, idle image/video, and talking head video clip.

## Features

- **No GPU required**: Lip-syncing runs client-side via Web Audio envelope detection and canvas frame blitting.
- **Natural Voice**: Free high-quality neural voice synthesis via Microsoft Edge TTS with automatic fallback to browser speech synthesis.
- **Fast LLM response**: Pre-configured with Groq API for rapid streaming/answers.
- **Zero dependencies**: Pure vanilla JavaScript and native Node.js HTTP/WebSocket APIs.
- **Flexible UI**: Web component widget (`AvatarChat`) with speech-to-text mic input, mute toggle, and status indicators.

## Quick Start

1. Set your Groq API key in `.env`:
   ```bash
   GROQ_API_KEY=gsk_...
   GROQ_MODEL=openai/gpt-oss-20b
   TTS_VOICE=en-US-AvaNeural
   PORT=3000
   ```

2. Build the distribution bundle:
   ```bash
   npm run build
   ```

3. Start the server:
   ```bash
   npm run server
   ```
   or both:
   ```bash
   npm start
   ```

4. Open `http://localhost:3000` in your browser.

## Project Structure

```text
├── src/
│   ├── avatar-speaker.js   # Core audio playback & lip-sync controller
│   ├── widget.js           # AvatarChat web component widget
│   └── index.js            # Library export entry point
├── dist/
│   ├── avatar-chat.js      # UMD bundle (for script tags or CommonJS)
│   └── avatar-chat.esm.js  # ESM bundle (for ES module imports)
├── examples/basic/         # Ready-to-run demo application
├── scripts/build.js        # Build script bundling src into dist
├── server.js               # Node.js backend handling /ask and /speak
└── tts.js                  # Microsoft Edge Neural TTS client
```

## API Endpoints

- `GET /health`: Health check (`200 OK`).
- `POST /ask`: JSON `{ "question": "..." }` → `{ "answer": "..." }`.
- `POST /speak`: JSON `{ "text": "..." }` → returns `audio/mpeg` MP3 stream.

## License

MIT

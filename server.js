import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { edgeSpeak } from "./tts.js";

if (!process.env.GROQ_API_KEY && fs.existsSync(".env") && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

const {
  GROQ_API_KEY,
  GROQ_MODEL = "openai/gpt-oss-20b",
  GROQ_TTS_MODEL = "canopylabs/orpheus-v1-english",
  GROQ_TTS_VOICE = "hannah",
  TTS_VOICE = "en-US-AvaNeural",
  PORT = 3000,
  ALLOWED_ORIGIN = "*",
} = process.env;

if (!GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY in .env");
  process.exit(1);
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

const SYSTEM =
  "You are a friendly voice assistant named Ava. Answer in 1 to 3 short, plain sentences. " +
  "No markdown, lists, emojis or links, because your answer will be read aloud.";

async function getContext(_question) {
  return "";
}

async function answer(question) {
  const context = await getContext(question);
  const messages = [
    { role: "system", content: SYSTEM + (context ? `\n\nUse this information:\n${context}` : "") },
    { role: "user", content: question },
  ];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.4,
      max_completion_tokens: 400,
      ...(String(GROQ_MODEL).includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
    }),
  });
  if (!response.ok) {
    console.error("Groq error", response.status, await response.text());
    throw new Error("llm_failed");
  }
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.message?.reasoning;
  if (!text) throw new Error("llm_empty");
  return String(text).trim();
}

const TTS_LIMIT = 190;

function chunkSpeech(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const pieces = clean.match(/[^.!?]+[.!?]*|\S+/g) || [clean];
  const chunks = [];
  let current = "";
  const pushCurrent = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (const raw of pieces) {
    const piece = raw.trim();
    if (!piece) continue;
    if (piece.length > TTS_LIMIT) {
      pushCurrent();
      for (const word of piece.split(" ")) {
        if (!word) continue;
        if ((current + " " + word).trim().length <= TTS_LIMIT) {
          current = (current + " " + word).trim();
        } else {
          pushCurrent();
          current = word.slice(0, TTS_LIMIT);
        }
      }
      continue;
    }
    if (!current) {
      current = piece;
    } else if ((current + " " + piece).length <= TTS_LIMIT) {
      current = `${current} ${piece}`;
    } else {
      pushCurrent();
      current = piece;
    }
  }
  pushCurrent();
  return chunks;
}

function findChunk(buffer, id) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) break;
    if (name === id) return { start, end, size };
    offset = end + (size % 2);
  }
  return null;
}

function parseWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("tts_not_wav");
  }
  const fmt = findChunk(buffer, "fmt ");
  const data = findChunk(buffer, "data");
  if (!fmt || !data) throw new Error("tts_bad_wav");
  return {
    audioFormat: buffer.readUInt16LE(fmt.start),
    channels: buffer.readUInt16LE(fmt.start + 2),
    sampleRate: buffer.readUInt32LE(fmt.start + 4),
    bitsPerSample: buffer.readUInt16LE(fmt.start + 14),
    pcm: buffer.subarray(data.start, data.end),
  };
}

function concatWav(buffers) {
  const parts = buffers.map(parseWav);
  const first = parts[0];
  const compatible = parts.every(
    (part) =>
      part.audioFormat === first.audioFormat &&
      part.channels === first.channels &&
      part.sampleRate === first.sampleRate &&
      part.bitsPerSample === first.bitsPerSample,
  );
  if (!compatible) throw new Error("tts_format_mismatch");
  const pcm = Buffer.concat(parts.map((part) => part.pcm));
  const byteRate = first.sampleRate * first.channels * (first.bitsPerSample / 8);
  const blockAlign = first.channels * (first.bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(first.audioFormat, 20);
  header.writeUInt16LE(first.channels, 22);
  header.writeUInt32LE(first.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(first.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function synthesizeChunk(text) {
  const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_TTS_MODEL,
      voice: GROQ_TTS_VOICE,
      input: text,
      response_format: "wav",
    }),
  });
  if (!response.ok) {
    console.error("Groq TTS error", response.status, await response.text());
    throw new Error("tts_failed");
  }
  return Buffer.from(await response.arrayBuffer());
}

async function speakGroq(text) {
  const chunks = chunkSpeech(text);
  if (!chunks.length) throw new Error("empty_speech");
  const wavs = [];
  for (const chunk of chunks) {
    wavs.push(await synthesizeChunk(chunk));
  }
  return wavs.length === 1 ? wavs[0] : concatWav(wavs);
}

async function speak(text) {
  try {
    return { buffer: await edgeSpeak(text, TTS_VOICE), type: "audio/mpeg" };
  } catch (edgeError) {
    console.error("Edge TTS failed, trying Groq fallback:", edgeError?.message || edgeError);
    return { buffer: await speakGroq(text), type: "audio/wav" };
  }
}

function safeJoin(relativePath) {
  const absolute = path.normalize(path.join(ROOT, relativePath));
  const allowed = [path.join(ROOT, "examples", "basic"), path.join(ROOT, "dist")];
  const inside = allowed.some((dir) => absolute === dir || absolute.startsWith(dir + path.sep));
  if (!inside) return null;
  return absolute;
}

function sendFile(req, res, relativePath) {
  const absolute = safeJoin(relativePath);
  if (!absolute) {
    res.statusCode = 403;
    return res.end();
  }
  fs.stat(absolute, (error, stats) => {
    if (error || !stats.isFile()) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    const type = MIME[path.extname(absolute)] || "application/octet-stream";
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${stats.size}`);
        return res.end();
      }
      let start = match[1] ? Number(match[1]) : NaN;
      let end = match[2] ? Number(match[2]) : NaN;

      if (Number.isNaN(start) && Number.isNaN(end)) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${stats.size}`);
        return res.end();
      }
      if (Number.isNaN(start)) {
        start = Math.max(0, stats.size - end);
        end = stats.size - 1;
      } else if (Number.isNaN(end)) {
        end = stats.size - 1;
      }

      if (start >= stats.size || start > end || start < 0) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${stats.size}`);
        return res.end();
      }

      res.statusCode = 206;
      res.setHeader("Content-Type", type);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`);
      res.setHeader("Content-Length", end - start + 1);
      const stream = fs.createReadStream(absolute, { start, end });
      stream.on("error", () => {});
      stream.pipe(res);
      return;
    }
    res.setHeader("Content-Type", type);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", stats.size);
    const stream = fs.createReadStream(absolute);
    stream.on("error", () => {});
    stream.pipe(res);
  });
}

function publicFile(urlPath) {
  if (urlPath === "/" || urlPath === "/index.html") return "examples/basic/index.html";
  if (urlPath === "/main.js") return "examples/basic/main.js";
  if (urlPath.startsWith("/assets/")) return path.join("examples/basic", urlPath.slice(1));
  if (urlPath.startsWith("/dist/")) return urlPath.slice(1);
  return null;
}

const server = http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return res.end("ok");

    if (req.method === "POST" && url.pathname === "/ask") {
      res.setHeader("Content-Type", "application/json");
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 20_000) {
            res.statusCode = 413;
            return res.end(JSON.stringify({ error: "question too long" }));
          }
        }
        const { question } = JSON.parse(body || "{}");
        const text = String(question || "").trim();
        if (!text) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: "empty question" }));
        }
        return res.end(JSON.stringify({ answer: await answer(text.slice(0, 1000)) }));
      } catch (error) {
        console.error("Ask endpoint error:", error);
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: "Sorry, I could not get an answer." }));
      }
    }

    if (req.method === "POST" && url.pathname === "/speak") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 20_000) {
            res.statusCode = 413;
            return res.end();
          }
        }
        const { text } = JSON.parse(body || "{}");
        const spoken = String(text || "").trim();
        if (!spoken) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: "empty speech" }));
        }
        const audio = await speak(spoken.slice(0, 2000));
        res.setHeader("Content-Type", audio.type);
        res.setHeader("Content-Length", audio.buffer.length);
        res.setHeader("Cache-Control", "no-store");
        return res.end(audio.buffer);
      } catch (error) {
        console.error("Speak endpoint error:", error);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Sorry, I could not speak that." }));
      }
    }

    if (req.method === "GET") {
      const file = publicFile(decodeURIComponent(url.pathname));
      if (file) return sendFile(req, res, file);
    }

    res.statusCode = 404;
    res.end("Not found");
  })
  .listen(PORT, () => {
    console.log(`Open http://localhost:${PORT}  (model: ${GROQ_MODEL}, voice: ${TTS_VOICE})`);
  });

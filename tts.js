import { createHash, randomBytes } from "node:crypto";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_URL = "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1";
const CHROME = "130.0.2849.68";
const WIN_EPOCH = 11644473600;
const GEC_PREFIX_WORDS = [
  0x79706f43, 0x68676972, 0x43282074, 0x694d2029, 0x736f7263, 0x2074666f, 0x70726f43, 0x7461726f,
  0x2e6e6f69, 0x6c6c4120, 0x67697220, 0x20737468, 0x65736572, 0x64657672, 0x0000002e,
];
const GEC_PREFIX_LENGTH = 57;

function uuid() {
  return randomBytes(16).toString("hex").toUpperCase();
}

function xmlEscape(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function rol16(x) {
  return ((x << 16) | (x >>> 16)) >>> 0;
}

function toWords(bytes) {
  const padded = new Uint8Array(Math.ceil(bytes.length / 8) * 8);
  padded.set(bytes);
  const view = new DataView(padded.buffer);
  return Array.from({ length: padded.length / 4 }, (_, i) => view.getUint32(i * 4, true));
}

function cs64WordSwap(words, a, b) {
  let acc = 0;
  let last = 0;
  for (let i = 0; i < words.length; i += 2) {
    const x = words[i];
    const y = words[i + 1];
    let t = rol16((Math.imul(rol16(x), 0xef0569fb) + Math.imul(x, a)) >>> 0);
    let q = Math.imul(t, 0x76f50f34) >>> 0;
    acc = (acc + Math.imul(rol16(q), 0xc3efea97) + q) >>> 0;
    t = rol16((Math.imul(rol16(y), 0xc31713db) + Math.imul(y, b)) >>> 0);
    q = Math.imul(t, 0x1881ce3c) >>> 0;
    last = (Math.imul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    acc = (acc + last) >>> 0;
  }
  return [last, acc];
}

function cs64Reversible(words, a, b) {
  let state = 0;
  let acc = 0;
  for (let i = 0; i < words.length; i += 2) {
    state = Math.imul(state + words[i], a) >>> 0;
    for (const c of [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83]) {
      state = Math.imul(rol16(state), c) >>> 0;
    }
    let t = Math.imul(words[i + 1] + state, b) >>> 0;
    t = Math.imul(rol16(t), 0xa27416f5) >>> 0;
    t = rol16(Math.imul(rol16(t), 0xd38396ff) >>> 0);
    acc = (acc + state) >>> 0;
    state = Math.imul(rol16(Math.imul(t, 0x7c932b89) >>> 0), 0xbfa49f69) >>> 0;
    acc = (acc + state) >>> 0;
  }
  return [state, acc];
}

function windowsTicks() {
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  return ticks * (1_000_000_000 / 100);
}

function generateSecMsGecV1() {
  return createHash("sha256").update(`${windowsTicks().toFixed(0)}${TOKEN}`, "ascii").digest("hex").toUpperCase();
}

async function generateSecMsGecV2() {
  const suffix = new TextEncoder().encode(`${windowsTicks().toFixed(0)}${TOKEN}`);
  const data = new Uint8Array(GEC_PREFIX_LENGTH + suffix.length);
  const view = new DataView(data.buffer);
  GEC_PREFIX_WORDS.forEach((word, i) => view.setUint32(i * 4, word, true));
  data.set(suffix, GEC_PREFIX_LENGTH);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const words = toWords(data);
  const [key0, key1] = toWords(digest);
  const a = (key0 | 1) >>> 0;
  const b = (key1 | 1) >>> 0;
  const [s0, s1] = cs64WordSwap(words, a, b);
  const [r0, r1] = cs64Reversible(words, a, b);
  const cs64 = new DataView(new ArrayBuffer(8));
  cs64.setUint32(0, s0 ^ r0, true);
  cs64.setUint32(4, s1 ^ r1, true);
  return `${toHex(new Uint8Array(cs64.buffer))}-${toHex(digest)}`;
}

function message(headers, body) {
  return `${Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\r\n")}\r\n\r\n${body}`;
}

function parseTextFrame(text) {
  const split = text.indexOf("\r\n\r\n");
  const head = split === -1 ? text : text.slice(0, split);
  const body = split === -1 ? "" : text.slice(split + 4);
  const headers = {};
  for (const line of head.split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body };
}

async function edgeSpeakOnce(text, { voice, gec, version }) {
  const connectId = uuid();
  const params = new URLSearchParams({
    ConnectionId: connectId,
    "Ocp-Apim-Subscription-Key": TOKEN,
    "Sec-MS-GEC": gec,
    "Sec-MS-GEC-Version": version,
  });
  const url = `${EDGE_URL}?${params}`;
  const ws = new WebSocket(url, {
    headers: {
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME} Safari/537.36 Edg/${CHROME}`,
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    },
  });
  ws.binaryType = "arraybuffer";

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      try {
        ws.close();
      } catch {}
      reject(new Error("tts_timeout"));
    }, 20_000);

    const cleanup = () => {
      clearTimeout(timer);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        ws.close();
      } catch {}
      reject(err);
    };

    const done = (buffer) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        ws.close();
      } catch {}
      if (!buffer?.length) reject(new Error("tts_empty"));
      else resolve(buffer);
    };

    const chunks = [];

    ws.addEventListener("open", () => {
      const stamp = new Date().toString();
      ws.send(
        message(
          { "Content-Type": "application/json; charset=utf-8", Path: "speech.config", "X-Timestamp": stamp },
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                },
              },
            },
          }),
        ),
      );
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
        `<voice name="${xmlEscape(voice)}"><prosody rate="+0%">${xmlEscape(text)}</prosody></voice></speak>`;
      ws.send(
        message(
          {
            "Content-Type": "application/ssml+xml",
            Path: "ssml",
            "X-RequestId": connectId,
            "X-Timestamp": stamp,
          },
          ssml,
        ),
      );
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        const { headers } = parseTextFrame(event.data);
        if (headers.path === "turn.end") {
          done(Buffer.concat(chunks));
        }
        return;
      }
      const buffer = Buffer.from(event.data);
      if (buffer.length < 2) return;
      const headerLength = buffer.readUInt16BE(0);
      if (buffer.length > headerLength + 2) chunks.push(buffer.subarray(2 + headerLength));
    });

    ws.addEventListener("close", () => {
      if (chunks.length) done(Buffer.concat(chunks));
      else fail(new Error("tts_closed"));
    });

    ws.addEventListener("error", () => fail(new Error("tts_socket")));
  });
}

export async function edgeSpeak(text, voice = "en-US-AvaNeural") {
  const spoken = String(text || "").replace(/\s+/g, " ").trim();
  if (!spoken) throw new Error("empty_speech");
  try {
    return await edgeSpeakOnce(spoken, {
      voice,
      gec: await generateSecMsGecV2(),
      version: `2-${CHROME}`,
    });
  } catch (error) {
    return await edgeSpeakOnce(spoken, {
      voice,
      gec: generateSecMsGecV1(),
      version: `1-${CHROME}`,
    });
  }
}

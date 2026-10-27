import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const speaker = readFileSync(new URL("../src/avatar-speaker.js", import.meta.url), "utf8");
const widget = readFileSync(new URL("../src/widget.js", import.meta.url), "utf8").replace(
  /import \{ AvatarSpeaker \} from ["'][^"']+["'];\r?\n/,
  "",
);
const bundled = `${speaker}\n${widget}\n`;

const dist = new URL("../dist/", import.meta.url);
mkdirSync(dist, { recursive: true });
writeFileSync(new URL("avatar-chat.esm.js", dist), bundled);
writeFileSync(
  new URL("avatar-chat.js", dist),
  `(function (root, factory) {
  if (typeof exports === "object" && typeof module !== "undefined") {
    factory(exports);
  } else {
    factory(typeof window !== "undefined" ? window : globalThis);
  }
})(this, function (g) {
${bundled.replace(/^export /gm, "")}
  g.AvatarSpeaker = AvatarSpeaker;
  g.AvatarChat = AvatarChat;
});
`,
);
console.log("built dist/avatar-chat.esm.js and dist/avatar-chat.js");

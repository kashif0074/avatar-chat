# Integration Guide

You can integrate `avatar-chat` as a script tag, ES module, or headless controller.

## 1. Script Tag (UMD)

```html
<div id="avatar-container"></div>

<script src="/dist/avatar-chat.js"></script>
<script>
  AvatarChat.mount("#avatar-container", {
    title: "Ava",
    subtitle: "AI Assistant",
    endpoint: "/ask",
    speakUrl: "/speak",
    idleSrc: "/assets/avatar_idle.png",
    talkingSrc: "/assets/avatar_talking.mp4",
  });
</script>
```

## 2. ES Module

```javascript
import { AvatarChat, AvatarSpeaker } from "./dist/avatar-chat.esm.js";

const chat = AvatarChat.mount("#app", {
  title: "Ava",
  idleSrc: "/assets/avatar_idle.png",
  talkingSrc: "/assets/avatar_talking.mp4",
  onAsk: async (question) => {
    // Custom backend or LLM handler
    const res = await fetch("/my-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: question }),
    });
    const data = await res.json();
    return data.reply;
  },
});
```

## 3. Headless Mode (`AvatarSpeaker`)

If you want to design your own custom UI and only use the audio & lip-syncing engine:

```javascript
import { AvatarSpeaker } from "./dist/avatar-chat.esm.js";

const speaker = new AvatarSpeaker({
  talkingVideo: document.querySelector("#my-video"),
  canvas: document.querySelector("#my-canvas"),
  onAsk: async (question) => {
    return "This is an answer.";
  },
  onState: (state) => {
    console.log("Avatar state:", state); // 'idle' | 'thinking' | 'speaking'
  },
});

await speaker.ask("What is the weather?");
```

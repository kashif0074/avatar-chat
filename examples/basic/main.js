AvatarChat.mount("#app", {
  title: "Ava",
  subtitle: "Voice assistant",
  endpoint: "/ask",
  speakUrl: "/speak",
  idleSrc: "/assets/avatar_idle.png",
  talkingSrc: "/assets/avatar_talking.mp4",
  placeholder: "Ask Ava anything…",
  floating: true,
  position: "bottom-right",
  startOpen: false,
});

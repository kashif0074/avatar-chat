import { AvatarSpeaker } from "./avatar-speaker.js";

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
  gap: 12px;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #f1f5f9;
  z-index: 10;
}

.avatar-badge-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.avatar-thumb {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 15px;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
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
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: #0f172a;
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
  gap: 6px;
  margin-top: 1px;
  color: #64748b;
  font-size: 12px;
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
  width: 36px;
  height: 36px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
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
  flex: 0 0 auto;
  height: clamp(260px, 42vh, 340px);
  max-height: 360px;
  aspect-ratio: 1 / 1;
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
  background: #edeae3 url('/assets/avatar_idle.png') center top / cover no-repeat;
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
  object-position: center top;
  opacity: 0;
  z-index: 3;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
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
  min-height: 60px;
  max-height: none;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  padding: 12px 14px;
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
  padding: 4px 6px 4px 14px;
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
  padding: 8px 0;
  font: inherit;
  font-size: 14px;
  color: #0f172a;
}

.field:focus {
  outline: none;
}

.field::placeholder {
  color: #94a3b8;
}

.mic-btn {
  width: 34px;
  height: 34px;
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
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 12px;
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
  margin-top: 6px;
  text-align: center;
  font-size: 11px;
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
    flex: 0 0 auto;
    width: 100%;
    height: min(44vh, 320px);
    aspect-ratio: auto;
    border-radius: 0;
  }

  .stage-media {
    object-position: center top;
  }

  .log {
    flex: 1 1 auto;
    max-height: none;
    min-height: 80px;
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
    max-height: 340px;
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

export class AvatarChat {
  static mount(target, options) {
    return new AvatarChat(target, options);
  }

  constructor(target, options = {}) {
    const host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host) throw new Error("AvatarChat: mount target not found");

    this.options = {
      title: "Ava",
      subtitle: "Voice Assistant",
      badge: "AI",
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
                <span class="badge">${escapeHtml(this.options.badge)}</span>
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
            ${this.options.floating ? `<button class="icon-btn pos-btn" type="button" title="Switch side (Left / Right)" aria-label="Switch side">${ICONS.dock}</button>` : ""}
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
      onAnswer: (answer) => this.#addMessage("bot", answer),
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
    });

    this.els.clear.addEventListener("click", () => {
      this.avatar.stop();
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
      this.#addMessage("error", "Sorry, I could not get an answer. Please try again.");
    } finally {
      thinkingEl?.remove();
      this.busy = false;
      this.els.send.disabled = false;
      this.els.input.disabled = false;
      this.els.input.focus();
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

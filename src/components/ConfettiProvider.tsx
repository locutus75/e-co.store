"use client";

import React, { useEffect, useState, useRef } from "react";
import confetti from "canvas-confetti";
import { checkConfettiStatus, SurpriseType } from "@/app/actions/confetti";

export default function ConfettiProvider() {
  const [showToast, setShowToast] = useState(false);
  const [toastMessages, setToastMessages] = useState<string[]>([]);
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoopingRef = useRef(false);
  
  // Track current type so we don't mix animations if both trigger at once, we just pick fireworks if any
  const [currentSurpriseType, setCurrentSurpriseType] = useState<SurpriseType>("confetti");

  const playPopSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Short noise burst (mini-bang)
      const bufferSize = audioCtx.sampleRate * 0.1; // 0.1 seconds of noise
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      // Highpass filter for a "crisper/shriller" crackle
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 800;

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      
      noise.start(audioCtx.currentTime);
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  const playFireworksSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Whistle
      const whistleOsc = audioCtx.createOscillator();
      const whistleGain = audioCtx.createGain();
      whistleOsc.type = 'sine';
      whistleOsc.frequency.setValueAtTime(400, audioCtx.currentTime);
      whistleOsc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
      
      whistleGain.gain.setValueAtTime(0, audioCtx.currentTime);
      whistleGain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.1);
      whistleGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
      
      whistleOsc.connect(whistleGain);
      whistleGain.connect(audioCtx.destination);
      whistleOsc.start(audioCtx.currentTime);
      whistleOsc.stop(audioCtx.currentTime + 0.3);

      // Bang (noise)
      setTimeout(() => {
        if (audioCtx.state === 'suspended' || audioCtx.state === 'closed') return;
        const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 seconds of noise
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 1000;

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noise.start(audioCtx.currentTime);
      }, 300); // Bang after 300ms whistle
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  const triggerSurpriseLoop = (messages: string[], soundEnabled: boolean, type: SurpriseType) => {
    setToastMessages(messages);
    setShowToast(true);
    isLoopingRef.current = true;
    setCurrentSurpriseType(type);

    const runConfetti = () => {
      if (!isLoopingRef.current) return;
      
      if (soundEnabled) {
        playPopSound();
      }

      confetti({
        particleCount: Math.floor(Math.random() * 50) + 50,
        spread: Math.floor(Math.random() * 60) + 50,
        origin: { y: 0.6, x: Math.random() * 0.8 + 0.1 },
        zIndex: 9999,
        ticks: 200,
      });

      const nextDelay = Math.random() * 200 + 100;
      loopTimeoutRef.current = setTimeout(runConfetti, nextDelay);
    };

    const runFireworks = () => {
      if (!isLoopingRef.current) return;

      if (soundEnabled) {
        playFireworksSound();
      }

      const duration = 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const burstInterval = setInterval(function() {
        if (!isLoopingRef.current) return clearInterval(burstInterval);
        
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          return clearInterval(burstInterval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({
          ...defaults, particleCount,
          origin: { x: randomInRange(0.1, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      // Fireworks take longer, wait 1s to 2s between big launches
      const nextDelay = Math.random() * 1000 + 1000;
      loopTimeoutRef.current = setTimeout(runFireworks, nextDelay);
    };

    if (type === "fireworks") {
      runFireworks();
    } else {
      runConfetti();
    }
  };

  const stopSurpriseLoop = () => {
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }
    isLoopingRef.current = false;
    setShowToast(false);
  };

  useEffect(() => {
    // Listen to test event
    const handleTest = (e: any) => {
      const msgs = e.detail?.messages || ["Test Verrassing!"];
      const soundEnabled = e.detail?.soundEnabled ?? true;
      const surpriseType = e.detail?.surpriseType || "confetti";
      
      if (!isLoopingRef.current) {
        triggerSurpriseLoop(msgs, soundEnabled, surpriseType);
      } else {
        // If already looping, stop it first then start new one
        stopSurpriseLoop();
        setTimeout(() => triggerSurpriseLoop(msgs, soundEnabled, surpriseType), 100);
      }
    };
    window.addEventListener("test-confetti", handleTest);

    // Periodic check for actual triggers
    const checkForConfetti = async () => {
      if (isLoopingRef.current) return;

      try {
        const { triggersToFire, soundEnabled } = await checkConfettiStatus();
        if (triggersToFire && triggersToFire.length > 0) {
          const newMessages: string[] = [];
          let hasFireworks = false;
          
          for (const trigger of triggersToFire) {
            const stored = localStorage.getItem(`confetti_triggered_${trigger.id}`);
            if (!stored) {
              localStorage.setItem(`confetti_triggered_${trigger.id}`, "true");
              newMessages.push(trigger.message);
              if (trigger.surpriseType === "fireworks") {
                hasFireworks = true;
              }
            }
          }

          if (newMessages.length > 0) {
            const chosenType = hasFireworks ? "fireworks" : "confetti";
            triggerSurpriseLoop(newMessages, soundEnabled, chosenType);
          }
        }
      } catch (error) {
        console.error("Failed to check confetti status", error);
      }
    };

    checkForConfetti();
    const interval = setInterval(checkForConfetti, 30000);

    return () => {
      window.removeEventListener("test-confetti", handleTest);
      clearInterval(interval);
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    };
  }, []);

  return (
    <>
      {showToast && (
        <div
          style={{
            position: "fixed",
            bottom: "2rem",
            left: "2rem",
            backgroundColor: "var(--surface)",
            color: "var(--text)",
            padding: "1.5rem 2rem",
            borderRadius: "var(--radius-lg)",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px var(--border)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            gap: "1.5rem",
            animation: "slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
            maxWidth: "450px",
          }}
        >
          <div style={{ fontSize: "2.5rem" }}>
            {currentSurpriseType === "fireworks" ? "🎆" : "🎉"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.5rem" }}>Verrassing!</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.95rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {toastMessages.map((msg, i) => (
                <div key={i}>• {msg}</div>
              ))}
            </div>
            
            <button
              onClick={stopSurpriseLoop}
              className="btn btn-primary"
              style={{ marginTop: "1rem", width: "100%", padding: "0.5rem", fontSize: "0.9rem" }}
            >
              Zo is het genoeg ;-)
            </button>
          </div>
          <style>{`
            @keyframes slideIn {
              from { transform: translateY(100px) scale(0.9); opacity: 0; }
              to { transform: translateY(0) scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  closeDraftAudio,
  createDraftAudioController,
  unlockDraftAudio
} from "../../lib/draftAudio";

// Audio must be unlocked by a user gesture (browser autoplay policy).
// Note: some browsers (notably iOS Safari) are pickier if the AudioContext is
// constructed before a gesture. So we create it lazily on the first gesture.
export function useDraftAudioUnlock() {
  const audioControllerRef = useRef<ReturnType<typeof createDraftAudioController>>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    let didUnlock = false;
    const unlock = async () => {
      if (didUnlock) return;
      didUnlock = true;
      if (!audioControllerRef.current) {
        audioControllerRef.current = createDraftAudioController();
      }
      await unlockDraftAudio(audioControllerRef.current);
      setAudioUnlocked(Boolean(audioControllerRef.current));
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("mousedown", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
    };

    document.addEventListener("pointerdown", unlock, { passive: true });
    // iOS Safari can run without Pointer Events; listen for touchstart/mousedown too.
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("mousedown", unlock);
    document.addEventListener("keydown", unlock);

    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("mousedown", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
      closeDraftAudio(audioControllerRef.current);
    };
  }, []);

  return { audioControllerRef, audioUnlocked };
}


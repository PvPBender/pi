import { useState, useEffect } from "react";

export function useLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(orientation: landscape)").matches && window.innerWidth > 600;
  });

  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const handler = () => {
      setIsLandscape(mq.matches && window.innerWidth > 600);
    };
    mq.addEventListener("change", handler);
    window.addEventListener("resize", handler);
    return () => {
      mq.removeEventListener("change", handler);
      window.removeEventListener("resize", handler);
    };
  }, []);

  return isLandscape;
}

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Custom hook for making elements draggable
 * @param {Object} options - Configuration options
 * @param {Object} options.initialPosition - Initial {x, y} position
 * @param {string} options.storageKey - LocalStorage key for persisting position
 * @param {Function} options.onDragEnd - Callback when dragging ends
 * @returns {Object} - Drag state and handlers
 */
export function useDraggable({
  initialPosition = { x: 0, y: 0 },
  storageKey = null,
  onDragEnd = null,
}) {
  const getSavedPosition = () => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {
        console.warn("Failed to load saved position:", e);
      }
    }
    return initialPosition;
  };

  const [position, setPosition] = useState(getSavedPosition);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (storageKey && !isDragging) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(position));
      } catch (e) {
        console.warn("Failed to save position:", e);
      }
    }
  }, [position, storageKey, isDragging]);

  const handleMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;

      const target = e.target;
      const isInteractive = target.closest(
        "button, input, select, textarea, a, [data-no-drag]",
      );
      if (isInteractive) return;

      if (target.closest(".resize-handle")) return;

      e.preventDefault();

      setIsDragging(true);
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      elementStartPos.current = { ...position };

      document.body.style.userSelect = "none";
    },
    [position],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;

      setPosition({
        x: elementStartPos.current.x + deltaX,
        y: elementStartPos.current.y + deltaY,
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    document.body.style.userSelect = "";

    if (onDragEnd) {
      onDragEnd();
    }
  }, [isDragging, onDragEnd]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const adjustPosition = useCallback((delta) => {
    setPosition((prev) => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  }, []);

  const resetPosition = useCallback(() => {
    setPosition(initialPosition);
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [initialPosition, storageKey]);

  return {
    position,
    setPosition,
    adjustPosition,
    isDragging,
    handleMouseDown,
    resetPosition,
  };
}

export default useDraggable;

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Custom hook for making elements resizable
 * When resizing from west/north edges, position offset is also calculated
 * to keep the opposite edge stationary
 */
export function useResizable({
  initialSize = { width: 400, height: 300 },
  minSize = { width: 280, height: 200 },
  maxSize = { width: 800, height: 600 },
  storageKey = null,
  onResizeEnd = null,
  onPositionAdjust = null,
}) {
  const getSavedSize = () => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {
        console.warn("Failed to load saved size:", e);
      }
    }
    return initialSize;
  };

  const [size, setSize] = useState(getSavedSize);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState(null);

  const resizeStartPos = useRef({ x: 0, y: 0 });
  const elementStartSize = useRef({ width: 0, height: 0 });
  const lastSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (storageKey && !isResizing) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(size));
      } catch (e) {
        console.warn("Failed to save size:", e);
      }
    }
  }, [size, storageKey, isResizing]);

  const constrainSize = useCallback(
    (newSize) => {
      return {
        width: Math.max(minSize.width, Math.min(maxSize.width, newSize.width)),
        height: Math.max(
          minSize.height,
          Math.min(maxSize.height, newSize.height),
        ),
      };
    },
    [minSize, maxSize],
  );

  const handleResizeStart = useCallback(
    (e, direction) => {
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      setIsResizing(true);
      setResizeDirection(direction);
      resizeStartPos.current = { x: e.clientX, y: e.clientY };
      elementStartSize.current = { ...size };
      lastSize.current = { ...size };

      document.body.style.cursor = getCursorForDirection(direction);
      document.body.style.userSelect = "none";
    },
    [size],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isResizing || !resizeDirection) return;

      const deltaX = e.clientX - resizeStartPos.current.x;
      const deltaY = e.clientY - resizeStartPos.current.y;

      let newWidth = elementStartSize.current.width;
      let newHeight = elementStartSize.current.height;

      if (resizeDirection.includes("e")) {
        newWidth = elementStartSize.current.width + deltaX;
      }
      if (resizeDirection.includes("w")) {
        newWidth = elementStartSize.current.width - deltaX;
      }
      if (resizeDirection.includes("s")) {
        newHeight = elementStartSize.current.height + deltaY;
      }
      if (resizeDirection.includes("n")) {
        newHeight = elementStartSize.current.height - deltaY;
      }

      const constrainedSize = constrainSize({
        width: newWidth,
        height: newHeight,
      });

      if (
        onPositionAdjust &&
        (resizeDirection.includes("w") || resizeDirection.includes("n"))
      ) {
        const positionDelta = { x: 0, y: 0 };

        if (resizeDirection.includes("w")) {
          positionDelta.x = lastSize.current.width - constrainedSize.width;
        }
        if (resizeDirection.includes("n")) {
          positionDelta.y = lastSize.current.height - constrainedSize.height;
        }

        if (positionDelta.x !== 0 || positionDelta.y !== 0) {
          onPositionAdjust(positionDelta);
        }
      }

      lastSize.current = constrainedSize;
      setSize(constrainedSize);
    },
    [isResizing, resizeDirection, constrainSize, onPositionAdjust],
  );

  const handleMouseUp = useCallback(() => {
    if (!isResizing) return;

    setIsResizing(false);
    setResizeDirection(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    if (onResizeEnd) {
      onResizeEnd();
    }
  }, [isResizing, onResizeEnd]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const resetSize = useCallback(() => {
    setSize(initialSize);
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [initialSize, storageKey]);

  return {
    size,
    setSize,
    isResizing,
    resizeDirection,
    handleResizeStart,
    resetSize,
  };
}

function getCursorForDirection(direction) {
  const cursors = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
    sw: "nesw-resize",
  };
  return cursors[direction] || "default";
}

export default useResizable;

import { useState, useCallback, useRef, useEffect } from 'react';

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
  // Load saved position from localStorage if available
  const getSavedPosition = () => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {
        console.warn('Failed to load saved position:', e);
      }
    }
    return initialPosition;
  };

  const [position, setPosition] = useState(getSavedPosition);
  const [isDragging, setIsDragging] = useState(false);
  
  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });

  // Save position to localStorage when it changes
  useEffect(() => {
    if (storageKey && !isDragging) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(position));
      } catch (e) {
        console.warn('Failed to save position:', e);
      }
    }
  }, [position, storageKey, isDragging]);

  // Handle mouse down on drag area
  const handleMouseDown = useCallback((e) => {
    // Only left mouse button
    if (e.button !== 0) return;
    
    // Don't drag if clicking on interactive elements
    const target = e.target;
    const isInteractive = target.closest('button, input, select, textarea, a, [data-no-drag]');
    if (isInteractive) return;
    
    // Don't drag if clicking on resize handles
    if (target.closest('.resize-handle')) return;
    
    // Prevent default to avoid text selection
    e.preventDefault();
    
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    elementStartPos.current = { ...position };

    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
  }, [position]);

  // Handle mouse move
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;

    setPosition({
      x: elementStartPos.current.x + deltaX,
      y: elementStartPos.current.y + deltaY,
    });
  }, [isDragging]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    document.body.style.userSelect = '';
    
    // Call onDragEnd callback
    if (onDragEnd) {
      onDragEnd();
    }
  }, [isDragging, onDragEnd]);

  // Add/remove global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Adjust position by a delta (used when resizing from w/n edges)
  const adjustPosition = useCallback((delta) => {
    setPosition(prev => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  }, []);

  // Reset position to initial
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

import React, { useCallback, useRef } from 'react';
import useDraggable from '../hooks/useDraggable';
import useResizable from '../hooks/useResizable';

/**
 * Wrapper component that makes any panel draggable and optionally resizable
 * Drag from anywhere on the panel (except buttons/inputs)
 * Handles click-through for transparent overlay
 */
function DraggablePanel({ 
  children, 
  panelId, 
  initialPosition = { x: 0, y: 0 },
  initialSize = { width: 420, height: 380 },
  minSize = { width: 300, height: 250 },
  maxSize = { width: 700, height: 600 },
  resizable = true,
  centered = false, // If true, panel is horizontally centered
  className = '',
  style = {},
}) {
  const panelRef = useRef(null);
  const isMouseOverRef = useRef(false);

  const handleMouseEnter = useCallback(() => {
    isMouseOverRef.current = true;
    if (window.cluely?.window?.mouseEnterPanel) {
      window.cluely.window.mouseEnterPanel();
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    isMouseOverRef.current = false;
    if (window.cluely?.window?.mouseLeavePanel) {
      window.cluely.window.mouseLeavePanel();
    }
  }, []);

  const handleInteractionEnd = useCallback(() => {
    setTimeout(() => {
      if (!isMouseOverRef.current && window.cluely?.window?.mouseLeavePanel) {
        window.cluely.window.mouseLeavePanel();
      }
    }, 50);
  }, []);

  const { position, adjustPosition, isDragging, handleMouseDown } = useDraggable({
    initialPosition,
    storageKey: `cluely-panel-pos-${panelId}`,
    onDragEnd: handleInteractionEnd,
  });

  const { size, isResizing, resizeDirection, handleResizeStart } = useResizable({
    initialSize,
    minSize,
    maxSize,
    storageKey: `cluely-panel-size-${panelId}`,
    onResizeEnd: handleInteractionEnd,
    onPositionAdjust: adjustPosition,
  });

  const isActive = isDragging || isResizing;

  const getTransform = () => {
    if (centered) {
      return `translateX(calc(-50% + ${position.x}px)) translateY(${position.y}px)`;
    }
    return `translate(${position.x}px, ${position.y}px)`;
  };

  const isHandleActive = (direction) => {
    return isResizing && resizeDirection === direction;
  };

  return (
    <div
      ref={panelRef}
      className={`draggable-panel ${className} ${isActive ? 'is-active' : ''} ${centered ? 'is-centered' : ''}`}
      style={{
        ...style,
        transform: getTransform(),
        width: resizable ? size.width : undefined,
        height: resizable ? size.height : undefined,
        zIndex: isActive ? 1000 : undefined,
        cursor: 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      {resizable && (
        <>
          <div 
            className={`resize-handle resize-handle-e ${isHandleActive('e') ? 'is-resizing' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, 'e')}
          />
          <div 
            className={`resize-handle resize-handle-s ${isHandleActive('s') ? 'is-resizing' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, 's')}
          />
          <div 
            className={`resize-handle resize-handle-w ${isHandleActive('w') ? 'is-resizing' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, 'w')}
          />
          <div 
            className={`resize-handle resize-handle-n ${isHandleActive('n') ? 'is-resizing' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, 'n')}
          />
          
          <div 
            className={`resize-handle resize-handle-se ${isHandleActive('se') ? 'is-resizing' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, 'se')}
          />
          <div 
            className={`resize-handle resize-handle-sw ${isHandleActive('sw') ? 'is-resizing' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
          />
          <div 
            className={`resize-handle resize-handle-ne ${isHandleActive('ne') ? 'is-resizing' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
          />
          <div 
            className={`resize-handle resize-handle-nw ${isHandleActive('nw') ? 'is-resizing' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
          />
        </>
      )}
    </div>
  );
}

export default DraggablePanel;

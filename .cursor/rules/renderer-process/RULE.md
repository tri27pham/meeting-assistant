---
description: "Rules for renderer process (React) code in src/renderer/"
globs: ["src/renderer/**/*.{js,jsx}"]
alwaysApply: false
---

# Renderer Process Rules

## Code Style
- ES6 modules: Use `import` and `export`
- React functional components with hooks
- Use `useState`, `useEffect`, `useCallback`, `useMemo` appropriately
- Console logs: Prefix with `[ComponentName]` or `[Renderer]`

## Component Patterns
- Use `DraggablePanel` wrapper for draggable panels
- Keep components focused on UI
- Business logic in hooks or services
- State management: useState for local, consider Context for shared

## IPC Usage
- Use `window.cluely.*` API (from preload)
- Listen to events: `window.cluely.on('event', callback)`
- Clean up listeners in useEffect cleanup

## Performance
- Memoize expensive computations with useMemo
- Use useCallback for event handlers passed to children
- Avoid unnecessary re-renders

## Hooks
- Custom hooks in `src/renderer/hooks/`
- Use "use" prefix: `useMicrophoneCapture`, `useDraggable`, `useResizable`
- Hooks should handle their own cleanup

## Examples

### Component Pattern
```jsx
import React, { useState, useEffect, useCallback } from 'react';

function MyComponent({ onAction }) {
  const [state, setState] = useState(null);
  
  const handleClick = useCallback(() => {
    if (window.cluely) {
      window.cluely.api.method();
    }
  }, []);
  
  useEffect(() => {
    if (!window.cluely) return;
    
    const unsubscribe = window.cluely.on.eventName((data) => {
      setState(data);
    });
    
    return () => unsubscribe();
  }, []);
  
  return <div onClick={handleClick}>Content</div>;
}

export default MyComponent;
```

### Hook Pattern
```jsx
import { useState, useEffect, useCallback } from 'react';

export function useMyHook({ enabled, onReady }) {
  const [isActive, setIsActive] = useState(false);
  
  const start = useCallback(async () => {
    // Start logic
    setIsActive(true);
    if (onReady) onReady();
  }, [onReady]);
  
  useEffect(() => {
    if (enabled) {
      start();
    }
    return () => {
      // Cleanup
    };
  }, [enabled, start]);
  
  return { isActive, start };
}
```


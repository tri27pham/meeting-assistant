# Recommended Cursor Rules for Cluely

Based on your codebase analysis, here are useful rules from [cursor.directory](https://cursor.directory) that would benefit your Electron + React project:

## 🔴 High Priority (Directly Applicable)

### 1. **React Rules** ✅ ADDED
**Why**: Your renderer process uses React 18 with hooks
- **Location**: `.cursor/rules/react/RULE.md`
- **Status**: ✅ Implemented
- **Benefits**: 
  - Best practices for functional components and hooks
  - Performance optimization patterns
  - State management guidelines
  - Component structure conventions
  - Electron-specific IPC patterns

### 2. **JavaScript Rules** ✅ ADDED
**Why**: Your codebase is currently JavaScript (not TypeScript)
- **Location**: `.cursor/rules/javascript/RULE.md`
- **Status**: ✅ Implemented
- **Benefits**:
  - Code style consistency
  - ES6+ best practices
  - Error handling patterns
  - Electron-specific patterns (CommonJS vs ES6 modules)

### 3. **Vite Rules** (if available)
**Why**: You use Vite for renderer build tooling
- **Location**: Search for "Vite" rules on cursor.directory
- **Benefits**:
  - Build configuration best practices
  - Plugin usage patterns
  - Development workflow optimization

## 🟡 Medium Priority (Future Considerations)

### 4. **TypeScript Rules**
**Why**: Consider migrating to TypeScript for better type safety
- **Location**: Search for "TypeScript" rules on cursor.directory
- **Benefits**:
  - Type safety for IPC communication
  - Better IDE support
  - Catch errors at compile time
- **Note**: Would require migration effort, but highly recommended for Electron apps

### 5. **Node.js Rules**
**Why**: Your main process uses Node.js/CommonJS
- **Location**: Search for "Node.js" rules on cursor.directory
- **Benefits**:
  - CommonJS patterns
  - EventEmitter best practices
  - Async/await patterns
  - Error handling in Node.js context

### 6. **Testing Rules (Playwright/Jest)**
**Why**: Testing Electron apps requires special considerations
- **Location**: Search for "Playwright" or "Testing" rules on cursor.directory
- **Benefits**:
  - E2E testing patterns for Electron
  - Unit testing for services
  - IPC mocking strategies

## 🟢 Low Priority (Nice to Have)

### 7. **Accessibility Rules**
**Why**: Desktop apps should be accessible
- **Location**: Search for "Accessibility" rules on cursor.directory
- **Benefits**:
  - ARIA patterns for overlay UI
  - Keyboard navigation
  - Screen reader support

### 8. **Performance Rules**
**Why**: Real-time audio processing requires optimization
- **Location**: Search for "Performance" rules on cursor.directory
- **Benefits**:
  - React performance optimization
  - Memory management
  - Audio buffer handling

## 📋 How to Add Rules

1. Visit [cursor.directory](https://cursor.directory)
2. Search for the rule name (e.g., "React", "JavaScript")
3. Copy the rule content
4. Create a new file in `.cursor/rules/` directory
5. Name it appropriately (e.g., `react/RULE.md`, `javascript/RULE.md`)

## 🎯 Recommended Implementation Order

1. **Start with React Rules** - Most immediate impact on renderer code
2. **Add JavaScript Rules** - Applies to entire codebase
3. **Consider TypeScript Rules** - If planning migration
4. **Add Node.js Rules** - For main process code
5. **Add Testing Rules** - When setting up test infrastructure

## 💡 Custom Rule Considerations

Based on your architecture, you might also want to create custom rules for:

- **Electron-specific patterns**: IPC communication, window management
- **Audio processing**: Buffer handling, real-time streaming
- **Service layer**: EventEmitter patterns, service lifecycle
- **macOS-specific**: Permission handling, system integration

## 🔗 Quick Links

- [Cursor Directory - React Rules](https://cursor.directory/rules?q=react)
- [Cursor Directory - JavaScript Rules](https://cursor.directory/rules?q=javascript)
- [Cursor Directory - TypeScript Rules](https://cursor.directory/rules?q=typescript)
- [Cursor Directory - Node.js Rules](https://cursor.directory/rules?q=node)
- [Cursor Directory - Vite Rules](https://cursor.directory/rules?q=vite)

/**
 * This file provides polyfill functionality for the simple-peer library
 * which depends on Node.js built-in modules like 'events' and 'util' that are not
 * available in the browser environment.
 */

// EventEmitter polyfill for browser environment
class EventEmitter {
  constructor() {
    this._events = {};
  }

  on(event, listener) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(listener);
    return this;
  }

  once(event, listener) {
    const onceWrapper = (...args) => {
      this.removeListener(event, onceWrapper);
      listener.apply(this, args);
    };
    onceWrapper.listener = listener;
    this.on(event, onceWrapper);
    return this;
  }

  off(event, listener) {
    return this.removeListener(event, listener);
  }

  removeListener(event, listener) {
    if (!this._events[event]) return this;

    const eventListeners = this._events[event];
    const filteredListeners = eventListeners.filter(
      l => l !== listener && l.listener !== listener
    );

    if (filteredListeners.length === 0) {
      delete this._events[event];
    } else {
      this._events[event] = filteredListeners;
    }

    return this;
  }

  removeAllListeners(event) {
    if (event) {
      delete this._events[event];
    } else {
      this._events = {};
    }
    return this;
  }

  emit(event, ...args) {
    if (!this._events[event]) return false;

    const listeners = [...this._events[event]];
    for (const listener of listeners) {
      try {
        listener.apply(this, args);
      } catch (err) {
        console.error('Error in event listener', err);
      }
    }

    return true;
  }

  listenerCount(event) {
    return this._events[event] ? this._events[event].length : 0;
  }
}

// Util polyfill for browser environment (minimal implementation)
const util = {
  inherits(constructor, superConstructor) {
    Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
    constructor.super_ = superConstructor;
  }
};

// Export the polyfills to the window object 
window.EventEmitter = EventEmitter;
window.util = util;

// Create module-like environment for simple-peer
window.require = function(moduleName) {
  if (moduleName === 'events') {
    return { EventEmitter };
  }
  if (moduleName === 'util') {
    return util;
  }
  throw new Error(`Module ${moduleName} is not polyfilled`);
};

console.log("[Polyfill] simple-peer dependencies loaded");
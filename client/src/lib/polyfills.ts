// Polyfill for libraries that expect Node.js globals and modules
if (typeof window !== 'undefined') {
  // Polyfill global
  if (typeof window.global === 'undefined') {
    // @ts-ignore
    window.global = window;
  }
  
  // Polyfill Web Speech API for TypeScript
  if (!window.SpeechRecognition && window.webkitSpeechRecognition) {
    // @ts-ignore - Make webkit prefix available as the standard name
    window.SpeechRecognition = window.webkitSpeechRecognition;
  }

  // Mock EventEmitter for simple-peer
  class EventEmitter {
    private events: Record<string, Array<(...args: any[]) => void>> = {};

    on(event: string, listener: (...args: any[]) => void): this {
      if (!this.events[event]) {
        this.events[event] = [];
      }
      this.events[event].push(listener);
      return this;
    }

    once(event: string, listener: (...args: any[]) => void): this {
      const wrapped = (...args: any[]) => {
        this.removeListener(event, wrapped);
        listener(...args);
      };
      return this.on(event, wrapped);
    }

    emit(event: string, ...args: any[]): boolean {
      const listeners = this.events[event];
      if (!listeners || listeners.length === 0) {
        return false;
      }
      
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
      
      return true;
    }

    removeListener(event: string, listener: (...args: any[]) => void): this {
      if (!this.events[event]) {
        return this;
      }
      
      const index = this.events[event].indexOf(listener);
      if (index !== -1) {
        this.events[event].splice(index, 1);
      }
      
      return this;
    }

    removeAllListeners(event?: string): this {
      if (event) {
        delete this.events[event];
      } else {
        this.events = {};
      }
      
      return this;
    }
  }

  // Create mock Node.js modules
  const nodeMocks = {
    events: {
      EventEmitter,
    },
    util: {
      inherits: function(ctor: any, superCtor: any) {
        // @ts-ignore
        ctor.super_ = superCtor;
        Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
      },
      debuglog: function() {
        return console.log.bind(console);
      },
      inspect: function(obj: any) {
        return JSON.stringify(obj);
      }
    },
  };

  // Use a dynamic import hook to provide the mock modules
  // @ts-ignore
  window.__vite_handle_hmr_error = (err: Error) => {
    if (err.message.includes('Module "events" has been externalized for browser compatibility')) {
      console.warn('Polyfilling events module for simple-peer');
    }
    if (err.message.includes('Module "util" has been externalized for browser compatibility')) {
      console.warn('Polyfilling util module for simple-peer');
    }
  };

  // Apply module mocks to window
  // @ts-ignore
  window.events = nodeMocks.events;
  // @ts-ignore
  window.util = nodeMocks.util;
}

export {}; // Make this a module
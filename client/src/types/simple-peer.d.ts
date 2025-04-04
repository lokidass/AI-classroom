declare module 'simple-peer' {
  import { EventEmitter } from 'events';

  export interface SimplePeerOptions {
    initiator?: boolean;
    channelConfig?: object;
    channelName?: string;
    config?: RTCConfiguration;
    offerOptions?: RTCOfferOptions;
    answerOptions?: RTCAnswerOptions;
    sdpTransform?: (sdp: string) => string;
    stream?: MediaStream;
    streams?: MediaStream[];
    trickle?: boolean;
    allowHalfTrickle?: boolean;
    objectMode?: boolean;
    wrtc?: any;
  }

  export interface SimplePeerData {
    type: string;
    sdp: string;
  }

  class SimplePeer extends EventEmitter {
    constructor(opts?: SimplePeerOptions);

    signal(data: string | object): void;
    send(data: string | Uint8Array | ArrayBuffer | Blob): void;
    addStream(stream: MediaStream): void;
    removeStream(stream: MediaStream): void;
    addTrack(track: MediaStreamTrack, stream: MediaStream): void;
    removeTrack(track: MediaStreamTrack, stream: MediaStream): void;
    replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream): void;
    
    destroy(error?: Error): void;
    
    readonly connected: boolean;
    readonly destroyed: boolean;
    readonly initiator: boolean;
    readonly streams: MediaStream[];
    
    // Events
    on(event: 'signal', listener: (data: SimplePeerData) => void): this;
    on(event: 'connect', listener: () => void): this;
    on(event: 'data', listener: (data: Uint8Array) => void): this;
    on(event: 'stream', listener: (stream: MediaStream) => void): this;
    on(event: 'track', listener: (track: MediaStreamTrack, stream: MediaStream) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    
    once(event: 'signal', listener: (data: SimplePeerData) => void): this;
    once(event: 'connect', listener: () => void): this;
    once(event: 'data', listener: (data: Uint8Array) => void): this;
    once(event: 'stream', listener: (stream: MediaStream) => void): this;
    once(event: 'track', listener: (track: MediaStreamTrack, stream: MediaStream) => void): this;
    once(event: 'close', listener: () => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
  }

  export default SimplePeer;
}

// Add WebRTC API definitions that might be missing
interface Window {
  global?: Window;
  events?: any;
  util?: any;
  __vite_handle_hmr_error?: (err: Error) => void;
}
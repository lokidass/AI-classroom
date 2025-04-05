/**
 * A simplified WebRTC peer connection implementation for browser environments
 * This is a replacement for simple-peer that doesn't depend on Node.js modules
 */

export interface PeerOptions {
  initiator?: boolean;
  stream?: MediaStream;
  trickle?: boolean;
}

export interface SignalData {
  type: string;
  sdp?: string;
  candidate?: RTCIceCandidate;
}

type EventCallback = (...args: any[]) => void;

export class BrowserPeer {
  private peerConnection!: RTCPeerConnection;
  private stream?: MediaStream;
  private dataChannel?: RTCDataChannel;
  private remoteStream?: MediaStream;
  private initiator: boolean;
  private connected: boolean = false;
  private destroyed: boolean = false;
  private trickle: boolean;
  
  private eventListeners: { [eventName: string]: EventCallback[] } = {
    'signal': [],
    'connect': [],
    'data': [],
    'stream': [],
    'track': [],
    'close': [],
    'error': [],
  };
  
  constructor(options: PeerOptions = {}) {
    this.initiator = !!options.initiator;
    this.stream = options.stream;
    this.trickle = options.trickle !== false; // Default to true
    
    // Configure ICE servers (STUN/TURN)
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ],
      iceCandidatePoolSize: 10,
    };
    
    try {
      this.peerConnection = new RTCPeerConnection(config);
      
      // Set up event handlers
      this.peerConnection.onicecandidate = this.handleIceCandidate.bind(this);
      this.peerConnection.oniceconnectionstatechange = this.handleIceConnectionStateChange.bind(this);
      this.peerConnection.ontrack = this.handleTrack.bind(this);
      
      // Add tracks from local stream if available
      if (this.stream) {
        this.stream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.stream!);
        });
      }
      
      // Create data channel if initiator
      if (this.initiator) {
        this.dataChannel = this.peerConnection.createDataChannel('data', {
          ordered: true
        });
        this.setupDataChannel();
        this.createOffer();
      } else {
        this.peerConnection.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this.setupDataChannel();
        };
      }
    } catch (err) {
      this.destroy(err as Error);
    }
  }
  
  // Event handling
  on(event: string, callback: EventCallback): this {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
    return this;
  }
  
  once(event: string, callback: EventCallback): this {
    const onceCallback = (...args: any[]) => {
      this.off(event, onceCallback);
      callback(...args);
    };
    return this.on(event, onceCallback);
  }
  
  off(event: string, callback?: EventCallback): this {
    if (!callback) {
      this.eventListeners[event] = [];
    } else if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
    return this;
  }
  
  private emit(event: string, ...args: any[]): boolean {
    const callbacks = this.eventListeners[event] || [];
    callbacks.forEach(callback => {
      try {
        callback(...args);
      } catch (err) {
        console.error(`Error in '${event}' listener:`, err);
      }
    });
    return callbacks.length > 0;
  }
  
  // Handle ICE candidates
  private handleIceCandidate(event: RTCPeerConnectionIceEvent): void {
    if (event.candidate) {
      if (this.trickle) {
        this.emit('signal', {
          type: 'candidate',
          candidate: event.candidate
        });
      }
    } else {
      console.log('End of candidates.');
      if (!this.trickle) {
        // If not trickling, we wait until all candidates are collected
        this.generateCompleteSignal();
      }
    }
  }
  
  // Generate a complete signal with the local description and all ICE candidates
  private async generateCompleteSignal(): Promise<void> {
    try {
      const desc = this.peerConnection.localDescription;
      if (desc) {
        this.emit('signal', {
          type: desc.type,
          sdp: desc.sdp
        });
      }
    } catch (err) {
      this.destroy(err as Error);
    }
  }
  
  // Handle ICE connection state changes
  private handleIceConnectionStateChange(): void {
    const state = this.peerConnection.iceConnectionState;
    console.log('ICE connection state:', state);
    
    if (state === 'connected' || state === 'completed') {
      if (!this.connected) {
        this.connected = true;
        this.emit('connect');
      }
    } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
      if (state === 'failed') {
        this.destroy(new Error('ICE connection failed'));
      } else if (state === 'closed') {
        this.destroy();
      }
    }
  }
  
  // Handle incoming tracks
  private handleTrack(event: RTCTrackEvent): void {
    console.log('Received remote track', event.track.kind);
    
    if (!this.remoteStream) {
      this.remoteStream = new MediaStream();
      this.emit('stream', this.remoteStream);
    }
    
    // Add track to remote stream
    this.remoteStream.addTrack(event.track);
    this.emit('track', event.track, this.remoteStream);
  }
  
  // Set up data channel event listeners
  private setupDataChannel(): void {
    if (!this.dataChannel) return;
    
    this.dataChannel.onopen = () => {
      if (!this.connected) {
        this.connected = true;
        this.emit('connect');
      }
    };
    
    this.dataChannel.onclose = () => {
      // Data channel closed
      this.destroy();
    };
    
    this.dataChannel.onmessage = (event) => {
      this.emit('data', event.data);
    };
    
    this.dataChannel.onerror = (event) => {
      this.destroy(new Error(`Data channel error: ${event.toString()}`));
    };
  }
  
  // Create and send an offer
  private async createOffer(): Promise<void> {
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      if (!this.trickle) {
        // Wait for ICE gathering to complete
        // The complete signal will be sent via handleIceCandidate
      } else {
        this.emit('signal', {
          type: 'offer',
          sdp: this.peerConnection.localDescription?.sdp
        });
      }
    } catch (err) {
      this.destroy(err as Error);
    }
  }
  
  // Create and send an answer
  private async createAnswer(): Promise<void> {
    try {
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      if (!this.trickle) {
        // Wait for ICE gathering to complete
        // The complete signal will be sent via handleIceCandidate
      } else {
        this.emit('signal', {
          type: 'answer',
          sdp: this.peerConnection.localDescription?.sdp
        });
      }
    } catch (err) {
      this.destroy(err as Error);
    }
  }
  
  // Process signaling data from the remote peer
  signal(data: any): void {
    if (this.destroyed) return;
    
    try {
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
      
      if (data.type === 'offer') {
        if (!this.initiator) {
          this.peerConnection.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: data.sdp
          }))
          .then(() => this.createAnswer())
          .catch(err => this.destroy(err));
        } else {
          this.destroy(new Error('Received offer while being initiator'));
        }
      } else if (data.type === 'answer') {
        if (this.initiator) {
          this.peerConnection.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: data.sdp
          }))
          .catch(err => this.destroy(err));
        } else {
          this.destroy(new Error('Received answer while not being initiator'));
        }
      } else if (data.type === 'candidate') {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch(err => this.destroy(err));
      } else {
        this.destroy(new Error(`Unsupported signal type: ${data.type}`));
      }
    } catch (err) {
      this.destroy(err as Error);
    }
  }
  
  // Send data through the data channel
  send(data: string | Uint8Array | ArrayBuffer | Blob): void {
    if (this.destroyed) return;
    if (!this.connected) {
      throw new Error('Cannot send data when not connected');
    }
    
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        // Cast the data to any to avoid TypeScript error
        // The browser's RTCDataChannel.send() accepts all these types
        this.dataChannel.send(data as any);
      } catch (err) {
        this.destroy(err as Error);
      }
    } else {
      this.destroy(new Error('Data channel is not open'));
    }
  }
  
  // Add a MediaStream to the connection
  addStream(stream: MediaStream): void {
    if (this.destroyed) return;
    
    // Add all tracks from the stream
    stream.getTracks().forEach(track => {
      this.addTrack(track, stream);
    });
  }
  
  // Remove a MediaStream from the connection
  removeStream(stream: MediaStream): void {
    if (this.destroyed) return;
    
    const senders = this.peerConnection.getSenders();
    stream.getTracks().forEach(track => {
      const sender = senders.find(s => s.track === track);
      if (sender) {
        this.peerConnection.removeTrack(sender);
      }
    });
  }
  
  // Add a MediaStreamTrack to the connection
  addTrack(track: MediaStreamTrack, stream: MediaStream): void {
    if (this.destroyed) return;
    
    this.peerConnection.addTrack(track, stream);
  }
  
  // Remove a MediaStreamTrack from the connection
  removeTrack(track: MediaStreamTrack): void {
    if (this.destroyed) return;
    
    const senders = this.peerConnection.getSenders();
    const sender = senders.find(s => s.track === track);
    if (sender) {
      this.peerConnection.removeTrack(sender);
    }
  }
  
  // Replace a MediaStreamTrack
  replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): void {
    if (this.destroyed) return;
    
    const senders = this.peerConnection.getSenders();
    const sender = senders.find(s => s.track === oldTrack);
    if (sender) {
      sender.replaceTrack(newTrack)
        .catch(err => this.destroy(err));
    } else {
      this.destroy(new Error('Cannot find sender for track'));
    }
  }
  
  // Destroy and clean up the peer connection
  destroy(err?: Error): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connected = false;
    
    // Clean up data channel
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (err) {
        console.error('Error closing data channel:', err);
      }
      this.dataChannel = undefined;
    }
    
    // Clean up peer connection
    try {
      this.peerConnection.close();
    } catch (err) {
      console.error('Error closing peer connection:', err);
    }
    
    // Emit error if provided
    if (err) {
      this.emit('error', err);
    }
    
    // Emit close event
    this.emit('close');
    
    // Remove all event listeners
    Object.keys(this.eventListeners).forEach(event => {
      this.eventListeners[event] = [];
    });
  }
  
  // Get connection information
  get isConnected(): boolean {
    return this.connected;
  }
  
  get isDestroyed(): boolean {
    return this.destroyed;
  }
  
  get isInitiator(): boolean {
    return this.initiator;
  }
}
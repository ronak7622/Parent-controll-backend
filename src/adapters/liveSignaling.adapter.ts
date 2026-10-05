/**
 * WebRTC Abstraction Adapter Interface (ILiveSignalingAdapter)
 * Standardized interface to allow swapping real-time WebRTC signaling engines
 * (Socket.io -> Twilio -> Agora -> LiveKit) with ZERO changes to application controllers.
 */

export interface ILiveSignalingAdapter {
  sendOffer(deviceId: string, offer: any): Promise<void>;
  sendAnswer(deviceId: string, answer: any): Promise<void>;
  sendIceCandidate(deviceId: string, candidate: any): Promise<void>;
  endSession(deviceId: string, reason?: string): Promise<void>;
  emitToRoom(deviceId: string, event: string, payload: any): Promise<void>;
}

export class SocketIoLiveAdapter implements ILiveSignalingAdapter {
  private getNamespace: () => any;

  constructor(namespaceGetter: () => any) {
    this.getNamespace = namespaceGetter;
  }

  async sendOffer(deviceId: string, offer: any): Promise<void> {
    const ns = this.getNamespace();
    if (ns) ns.to(deviceId).emit('offer', offer);
  }

  async sendAnswer(deviceId: string, answer: any): Promise<void> {
    const ns = this.getNamespace();
    if (ns) ns.to(deviceId).emit('answer', answer);
  }

  async sendIceCandidate(deviceId: string, candidate: any): Promise<void> {
    const ns = this.getNamespace();
    if (ns) ns.to(deviceId).emit('ice-candidate', candidate);
  }

  async endSession(deviceId: string, reason?: string): Promise<void> {
    const ns = this.getNamespace();
    if (ns) ns.to(deviceId).emit('stop-stream', { deviceId, reason: reason || 'Session ended' });
  }

  async emitToRoom(deviceId: string, event: string, payload: any): Promise<void> {
    const ns = this.getNamespace();
    if (ns) ns.to(deviceId).emit(event, payload);
  }
}

/**
 * 二进制长度前缀帧读取器
 * 
 * 协议格式：
 *   [4字节大端uint32: 消息体长度 N][N 字节 JSON UTF-8 数据]
 * 
 * 用法：
 *   const reader = new BinaryFrameReader();
 *   reader.append(uint8ArrayChunk);
 *   while (true) {
 *     const msg = reader.readMessage();
 *     if (msg === null) break;
 *     // 处理 msg (已解析的 JSON 对象)
 *   }
 */
export class BinaryFrameReader {
  private buffer: Uint8Array = new Uint8Array(0);
  private readonly HEADER_SIZE = 4;

  /** 将新的二进制数据追加到读取缓冲区 */
  append(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
  }

  /**
   * 从缓冲区提取一条完整消息。
   *
   * @returns 解析后的 JSON 对象，若数据不足则返回 null
   */
  readMessage(): any | null {
    // 不够 4 字节头部，等下次
    if (this.buffer.length < this.HEADER_SIZE) return null;

    // 读取长度前缀（大端序 uint32）
    const dataView = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.HEADER_SIZE);
    const payloadLength = dataView.getUint32(0, false); // false = big-endian
    const totalSize = this.HEADER_SIZE + payloadLength;

    // 数据还不够，等下次
    if (this.buffer.length < totalSize) return null;

    // 提取 JSON payload
    const payloadBytes = this.buffer.slice(this.HEADER_SIZE, totalSize);
    const jsonString = new TextDecoder().decode(payloadBytes);

    // 移除已处理的消息
    this.buffer = this.buffer.slice(totalSize);

    // 解析 JSON
    return JSON.parse(jsonString);
  }

  /** 重置读取器（清空缓冲区） */
  reset(): void {
    this.buffer = new Uint8Array(0);
  }

  /** 获取当前缓冲区剩余字节数 */
  get bufferedBytes(): number {
    return this.buffer.length;
  }
}

/**
 * 工具函数：从可读流中读取所有二进制帧消息
 * 
 * @param reader - Response.body.getReader() 返回的读取器
 * @param onMessage - 每解析出一条完整消息的回调
 */
export async function readBinaryFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onMessage: (msg: any) => void,
): Promise<void> {
  const frameReader = new BinaryFrameReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    frameReader.append(value);

    // 一次性可能有多条完整消息
    let msg: any;
    while ((msg = frameReader.readMessage()) !== null) {
      onMessage(msg);
    }
  }
}

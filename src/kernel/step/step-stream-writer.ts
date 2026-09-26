// ==============================================================================
// src/kernel/step/step-stream-writer.ts — High-Throughput Buffered STEP Streamer
// ==============================================================================

import * as fs from 'fs';

export class StepStreamWriter {
  private stream: fs.WriteStream;
  private buffer: string = '';
  private readonly bufferLimit: number;
  private isClosed: boolean = false;

  constructor(filePath: string, bufferLimit: number = 256 * 1024) {
    this.bufferLimit = bufferLimit;
    this.stream = fs.createWriteStream(filePath, {
      highWaterMark: 128 * 1024,
      encoding: 'utf8'
    });
  }

  public async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const chunk = this.buffer;
    this.buffer = '';

    if (!this.stream.write(chunk)) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = () => {
          this.stream.removeListener('error', onError);
          resolve();
        };
        const onError = (err: Error) => {
          this.stream.removeListener('drain', onDrain);
          reject(err);
        };
        this.stream.once('drain', onDrain);
        this.stream.once('error', onError);
      });
    }
  }

  public async writeLine(line: string): Promise<void> {
    this.buffer += line + '\n';
    if (this.buffer.length >= this.bufferLimit) {
      await this.flush();
    }
  }

  public async writeBlock(block: string): Promise<void> {
    this.buffer += block;
    if (this.buffer.length >= this.bufferLimit) {
      await this.flush();
    }
  }

  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    await this.flush();

    return new Promise<void>((resolve, reject) => {
      this.stream.end(() => resolve());
      this.stream.on('error', reject);
    });
  }
}

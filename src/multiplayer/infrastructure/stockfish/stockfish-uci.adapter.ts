import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { StockfishBestMove, StockfishPort } from '../../application/ports/stockfish.port';

const DEFAULT_ENGINE = 'engine/stockfish/stockfish-windows-x86-64-avx2.exe';
const TIMEOUT_BUFFER_MS = 250;
const STARTUP_TIMEOUT_MS = 2000;

@Injectable()
export class StockfishUciAdapter implements StockfishPort {
  private readonly logger = new Logger(StockfishUciAdapter.name);

  async bestMove(fen: string, movetimeMs: number): Promise<StockfishBestMove> {
    const sanitizedFen = (fen ?? '').replace(/\r?\n/g, ' ').trim();
    if (!sanitizedFen) {
      throw new BadRequestException('FEN is required');
    }

    const timeMs = Number(movetimeMs);
    if (!Number.isFinite(timeMs) || timeMs <= 0) {
      throw new BadRequestException('movetimeMs must be a positive number');
    }

    const enginePath = this.resolveEnginePath();
    if (!existsSync(enginePath)) {
      throw new InternalServerErrorException(`Stockfish binary not found at ${enginePath}`);
    }

    return new Promise((resolveResult, reject) => {
      const engine = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.logger.debug(`Stockfish started pid=${engine.pid} path=${enginePath}`);

      let buffer = '';
      let settled = false;
      let readySent = false;
      let killTimer: NodeJS.Timeout | null = null;
      let exited = false;
      let startupTimeoutId: NodeJS.Timeout | null = null;
      let analysisTimeoutId: NodeJS.Timeout | null = null;

      const send = (cmd: string) => engine.stdin?.writable && engine.stdin.write(`${cmd}\n`);

      const cleanup = () => {
        if (engine.stdin?.writable) engine.stdin.write('quit\n');
        if (killTimer) clearTimeout(killTimer);
        if (exited) return;
        killTimer = setTimeout(() => {
          if (engine.killed || exited) return;
          try {
            engine.kill();
          } catch {
            // ignore failures while forcing shutdown
          }
        }, 200);
      };

      const finish = (error?: Error, result?: StockfishBestMove) => {
        if (settled) return;
        settled = true;
        if (startupTimeoutId) clearTimeout(startupTimeoutId);
        if (analysisTimeoutId) clearTimeout(analysisTimeoutId);
        cleanup();
        if (error) {
          reject(error);
        } else if (result) {
          resolveResult(result);
        } else {
          reject(new InternalServerErrorException('Stockfish failed without result'));
        }
      };

      const handleLine = (line: string) => {
        if (!line) return;
        if (line === 'uciok') {
          send('isready');
          return;
        }
        if (line === 'readyok' && !readySent) {
          readySent = true;
          if (startupTimeoutId) clearTimeout(startupTimeoutId);
          send(`position fen ${sanitizedFen}`);
          send(`go movetime ${timeMs}`);
          analysisTimeoutId = setTimeout(
            () => finish(new GatewayTimeoutException('Stockfish timed out')),
            timeMs + TIMEOUT_BUFFER_MS,
          );
          return;
        }
        if (line.startsWith('bestmove')) {
          const match = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/i.exec(line);
          if (!match) {
            finish(new InternalServerErrorException('Invalid bestmove response from Stockfish'));
            return;
          }
          const bestMove = match[1];
          const ponder = match[2] ?? null;
          this.logger.debug(`Stockfish bestmove=${bestMove}${ponder ? ` ponder=${ponder}` : ''}`);
          finish(undefined, { bestMove, ponder });
        }
      };

      engine.stdout?.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          handleLine(line.trim());
        }
      });

      engine.stderr?.on('data', (chunk) => {
        const message = chunk.toString().trim();
        if (message) {
          this.logger.debug(`Stockfish stderr: ${message}`);
        }
      });

      engine.on('error', () => {
        finish(new InternalServerErrorException('Failed to start Stockfish'));
      });

      engine.on('exit', (code, signal) => {
        if (killTimer) clearTimeout(killTimer);
        exited = true;
        this.logger.debug(`Stockfish exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
        if (!settled) {
          finish(new InternalServerErrorException(`Stockfish exited early (code=${code}, signal=${signal})`));
        }
      });

      startupTimeoutId = setTimeout(
        () => finish(new GatewayTimeoutException('Stockfish handshake timed out')),
        STARTUP_TIMEOUT_MS,
      );
      send('uci');
    });
  }

  private resolveEnginePath(): string {
    const candidates: string[] = [];
    const exe = (process.env.STOCKFISH_EXE ?? '').trim();
    if (exe) candidates.push(resolve(process.cwd(), exe));

    const dir = (process.env.STOCKFISH_PATH ?? '').trim();
    if (dir) candidates.push(resolve(process.cwd(), dir, 'stockfish-windows-x86-64-avx2.exe'));

    candidates.push(resolve(process.cwd(), DEFAULT_ENGINE));
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  }
}

import { BadRequestException } from '@nestjs/common';
import Player from '../../../domain/engine/entities/player.model';
import PlayerHelper from '../../../domain/engine/helpers/player.helper';
import PiecesHelper from '../../../domain/engine/helpers/pieces.helper';
import { GameSession } from '../../../domain/entities/game-session';
import { GameDomainEvent, GameDomainEventType } from '../../../domain/events/game-domain-event';
import { ColorEnum } from '../../../domain/engine/enums/color.enum';
import { GameSessionState } from '../../../domain/types/game-session-state.enum';
import { ReadyCheckState, ReadyCheckStatus } from '../../../domain/types/ready-check';
import { GameSessionTransitionType, applyGameSessionTransition } from '../../../domain/state-machines/game-session-state-machine';
import { TimeControlStrategy } from '../../../domain/strategies/time-control-strategy';

export function createReadyCheck(session: GameSession, readyTimeoutSeconds: number, nowMs: number): ReadyCheckState {
  const deadline = new Date(nowMs + readyTimeoutSeconds * 1000);
  return {
    requiredClientIds: session.players.map((p) => p.id),
    readyClientIds: new Set<string>(),
    deadlineAt: deadline,
    status: ReadyCheckStatus.PENDING,
  };
}

export function buildReadyEvents(session: GameSession, nowMs: number): GameDomainEvent[] {
  if (!session.readyCheck) return [];
  return session.readyCheck.requiredClientIds.map((clientId) => ({
    type: GameDomainEventType.READY_CHECK_STARTED,
    at: new Date(nowMs),
    gameId: session.id,
    targetClientId: clientId,
    deadlineAt: session.readyCheck?.deadlineAt ?? null,
    message: 'LOAD_SESSION',
    timeControl: session.timeControl,
  }));
}

export function buildClockEvent(session: GameSession, nowMs: number): GameDomainEvent {
  return {
    type: GameDomainEventType.CLOCK_UPDATED,
    at: new Date(nowMs),
    gameId: session.id,
    remainingSeconds: session.clock.remainingSeconds,
  };
}

export function applyMoveOnBoard(
  session: GameSession,
  cmd: { from: any; to: any; promotion?: string | null },
  playingPlayer: Player,
  notPlayingPlayer: Player,
) {
  const allPieces = PlayerHelper.getAllPieces(session.players);
  const selectedPiece = allPieces.find(
    (p) => p.position.vertical === cmd.from.vertical && p.position.horizontal === cmd.from.horizontal,
  );
  if (!selectedPiece) throw new BadRequestException('No piece at from');
  if (selectedPiece.color !== playingPlayer.color) {
    throw new BadRequestException('Cannot move opponent piece');
  }

  const destination = { vertical: cmd.to.vertical, horizontal: cmd.to.horizontal };
  const possibleMove = selectedPiece
    .getFilteredMovements(playingPlayer.pieces, notPlayingPlayer.pieces)
    .some((m) => m.vertical === destination.vertical && m.horizontal === destination.horizontal);
  if (!possibleMove) {
    throw new BadRequestException('Illegal move');
  }

  const existingPiece = allPieces.find(
    (p) => p.position.vertical === destination.vertical && p.position.horizontal === destination.horizontal,
  );

  const afterMovement = selectedPiece.move(destination, existingPiece ?? undefined);
  if (afterMovement.hasEaten && afterMovement.ate) {
    PlayerHelper.eatPiece(playingPlayer, notPlayingPlayer, afterMovement.ate);
  }

  if (afterMovement?.castle) {
    PiecesHelper.moveRookForCastle(playingPlayer, selectedPiece, afterMovement.castle);
  }

  if (afterMovement?.enPassant) {
    PiecesHelper.eatEnPassant(selectedPiece, playingPlayer, notPlayingPlayer);
  }

  if (selectedPiece.name === 'Pawn') {
    const promotionRow = selectedPiece.color === ColorEnum.WHITE ? 7 : 0;
    if (destination.vertical === promotionRow) {
      PiecesHelper.pawnPromotion(selectedPiece, destination, playingPlayer);
    }
  }
}

export function evaluateMateState(session: GameSession, playing: Player, waiting: Player): { winnerId: string | null; reason: string | null } | null {
  if (!PlayerHelper.cantPlay(waiting, playing.pieces)) return null;
  const checkmate = PiecesHelper.isKingInCheck(waiting.pieces, playing.pieces);
  if (checkmate) {
    session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.END_GAME });
    return { winnerId: playing.id, reason: 'CHECKMATE' };
  }
  session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.END_GAME });
  return { winnerId: null, reason: 'STALEMATE' };
}

export function finishByTimeoutState(
  session: GameSession,
  loserColor: ColorEnum,
  nowMs: number,
  strategy: TimeControlStrategy,
): GameDomainEvent[] {
  const loser = session.players.find((p) => p.color === loserColor);
  const winner = session.players.find((p) => p.color !== loserColor);
  session.state = applyGameSessionTransition(session.state, { type: GameSessionTransitionType.END_GAME });
  session.winnerClientId = winner ? winner.id : null;
  session.endReason = 'TIMEOUT';
  session.clock = strategy.pause(session.clock);
  session.updatedAt = new Date(nowMs);

  return [
    buildClockEvent(session, nowMs),
    {
      type: GameDomainEventType.GAME_ENDED,
      at: new Date(nowMs),
      gameId: session.id,
      message: 'Time ran out',
      playerId: loser?.id,
    },
  ];
}

export function readyTimerId(gameId: string): string {
  return `ready-${gameId}`;
}

export function disconnectTimerId(gameId: string, clientId: string): string {
  return `dc-${gameId}-${clientId}`;
}

export function ensureClientId(clientId: string) {
  if (!clientId || typeof clientId !== 'string') {
    throw new BadRequestException('clientId is required');
  }
}

export function ensurePlayerInSession(session: GameSession, clientId: string): Player {
  const player = session.players.find((p) => p.id === clientId);
  if (!player) throw new BadRequestException('Not a player of this game');
  return player;
}

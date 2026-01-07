export type BoardPosition = {
  vertical: number;
  horizontal: number;
};

export type GameMove = {
  from: BoardPosition;
  to: BoardPosition;
  promotion?: string | null;
  by: string;
  playedAt: Date;
};

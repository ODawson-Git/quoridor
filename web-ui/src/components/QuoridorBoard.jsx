import React, { useState, useEffect } from 'react';

const QuoridorBoard = ({ 
  boardState, 
  onCellClick, 
  onWallClick, 
  nextPawnMoves, 
  nextWallMoves,
  player1Strategy,
  player2Strategy
}) => {
  // State for showing ghost walls on hover
  const [ghostWall, setGhostWall] = useState(null);
  
  // Current player can make a move
  const canCurrentPlayerMove = (
    (boardState.activePlayer === 'player1' && player1Strategy === 'Human') ||
    (boardState.activePlayer === 'player2' && player2Strategy === 'Human')
  );
  
  // Convert to algebraic notation for display
  const toAlgebraicNotation = (row, col) => {
    const colLetter = String.fromCharCode(97 + col); // 'a' is 0
    const rowNumber = 9 - row; // Convert from array (0-8 from top) to algebraic (1-9 from bottom)
    return `${colLetter}${rowNumber}`;
  };
  
  // Simplified - get wall color based on active player only
  const getWallColor = (player) => {
    if (player === 'player1') return 'bg-blue-600';
    if (player === 'player2') return 'bg-red-600';
    return 'bg-gray-700';
  };
  
  // Find which player placed a specific wall
  const getWallPlayer = (orientation, row, col) => {
    const wallCoord = `${row},${col}`;
    const wall = boardState.moveHistory?.find(move => 
      move.type === 'wall' && 
      move.orientation === orientation && 
      (orientation === 'h' ? boardState.hWalls.has(wallCoord) : boardState.vWalls.has(wallCoord))
    );
    
    return wall?.player || null;
  };
  
  // Check if a cell is a legal move
  const isLegalMove = (row, col) => {
    // Get current player position
    const currentPos = boardState.activePlayer === 'player1' 
      ? boardState.player1Pos 
      : boardState.player2Pos;
    
    // Skip the current player's position as a legal move
    if (row === currentPos.row && col === currentPos.col) {
      return false;
    }
    
    return nextPawnMoves.some(move => 
      move.row === row && move.col === col
    );
  };

  // Check if a wall position is legal
  const isLegalWall = (row, col, type) => {
    return nextWallMoves[type].some(wall => 
      wall.row === row && wall.col === col
    );
  };

  // Get ghost wall color based on current player
  const getGhostWallColor = () => {
    return boardState.activePlayer === 'player1' ? 'bg-blue-300 bg-opacity-60' : 'bg-red-300 bg-opacity-60';
  };

  return (
    <div className="relative w-[540px] h-[540px] bg-gray-50 border border-gray-300 rounded-lg shadow-md overflow-hidden">
      {/* Main grid - cells */}
      <div className="grid grid-cols-9 grid-rows-9 w-full h-full">
        {Array(9).fill(0).map((_, row) => (
          Array(9).fill(0).map((_, col) => {
            const isPlayer1 = boardState.player1Pos.row === row && boardState.player1Pos.col === col;
            const isPlayer2 = boardState.player2Pos.row === row && boardState.player2Pos.col === col;
            const cellIsLegalMove = isLegalMove(row, col);
            
            return (
              <div 
                key={`cell-${row}-${col}`} 
                className={`
                  relative flex items-center justify-center border border-gray-200
                  ${cellIsLegalMove && canCurrentPlayerMove ? 'bg-green-100 cursor-pointer hover:bg-green-200' : 'bg-white'}
                  ${isPlayer1 || isPlayer2 ? 'bg-gray-100' : ''}
                `}
                onClick={() => {
                  if (canCurrentPlayerMove && cellIsLegalMove) {
                    onCellClick(row, col);
                  }
                }}
              >
                {isPlayer1 && <div className="h-10 w-10 rounded-full bg-blue-500 z-10 shadow-md" />}
                {isPlayer2 && <div className="h-10 w-10 rounded-full bg-red-500 z-10 shadow-md" />}
                
                <div className="absolute text-xs text-gray-400 left-1 top-1 pointer-events-none">
                  {toAlgebraicNotation(row, col)}
                </div>
              </div>
            );
          })
        ))}
      </div>
      
      {/* Horizontal wall areas - appear between rows */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        {Array(8).fill(0).map((_, row) => (
          Array(8).fill(0).map((_, col) => {
            // For horizontal walls, the reference point is the cell below the wall
            const wallRow = row + 1;
            const wallCol = col;
            const wallCoord = `${wallRow},${wallCol}`;
            const wallExists = boardState.hWalls.has(wallCoord);
            const wallIsLegal = isLegalWall(wallRow, wallCol, 'h');
            const showGhost = ghostWall && 
                            ghostWall.type === 'h' && 
                            ghostWall.row === wallRow && 
                            ghostWall.col === wallCol;
            
            return (
              <div 
                key={`hwall-${row}-${col}`}
                className={`
                  absolute pointer-events-auto z-10
                  ${wallIsLegal && canCurrentPlayerMove ? 'cursor-pointer' : ''}
                `}
                style={{
                  top: `${(row + 1) * (100 / 9)}%`,
                  left: `${col * (100 / 9)}%`,
                  width: `${(100 / 9) * 2}%`,
                  height: '12px',
                  transform: 'translateY(-50%)'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canCurrentPlayerMove && wallIsLegal) {
                    onWallClick(wallRow, wallCol, 'h');
                  }
                }}
                onMouseEnter={() => {
                  if (canCurrentPlayerMove && wallIsLegal) {
                    setGhostWall({ type: 'h', row: wallRow, col: wallCol });
                  }
                }}
                onMouseLeave={() => setGhostWall(null)}
              >
                {(wallExists || showGhost) && (
                  <div 
                    className={`
                      absolute top-1/2 left-0 w-full h-4 -translate-y-1/2 shadow-md
                      ${wallExists 
                        ? getWallColor(getWallPlayer('h', wallRow, wallCol)) 
                        : getGhostWallColor()}
                    `}
                    style={{ borderRadius: '2px' }}
                  />
                )}
              </div>
            );
          })
        ))}
      </div>
      
      {/* Vertical wall areas - appear between columns */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        {Array(8).fill(0).map((_, row) => (
          Array(8).fill(0).map((_, col) => {
            // For vertical walls, the reference point is the cell to the right of the wall
            const wallRow = row + 1;
            const wallCol = col;
            const wallCoord = `${wallRow},${wallCol}`;
            const wallExists = boardState.vWalls.has(wallCoord);
            const wallIsLegal = isLegalWall(wallRow, wallCol, 'v');
            const showGhost = ghostWall && 
                            ghostWall.type === 'v' && 
                            ghostWall.row === wallRow && 
                            ghostWall.col === wallCol;
            
            return (
              <div 
                key={`vwall-${row}-${col}`}
                className={`
                  absolute pointer-events-auto z-10
                  ${wallIsLegal && canCurrentPlayerMove ? 'cursor-pointer' : ''}
                `}
                style={{
                  top: `${row * (100 / 9)}%`,
                  left: `${(col + 1) * (100 / 9)}%`,
                  height: `${(100 / 9) * 2}%`,
                  width: '12px',
                  transform: 'translateX(-50%)'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canCurrentPlayerMove && wallIsLegal) {
                    onWallClick(wallRow, wallCol, 'v');
                  }
                }}
                onMouseEnter={() => {
                  if (canCurrentPlayerMove && wallIsLegal) {
                    setGhostWall({ type: 'v', row: wallRow, col: wallCol });
                  }
                }}
                onMouseLeave={() => setGhostWall(null)}
              >
                {(wallExists || showGhost) && (
                  <div 
                    className={`
                      absolute top-0 left-1/2 h-full w-4 -translate-x-1/2 shadow-md
                      ${wallExists 
                        ? getWallColor(getWallPlayer('v', wallRow, wallCol)) 
                        : getGhostWallColor()}
                    `}
                    style={{ borderRadius: '2px' }}
                  />
                )}
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
};

export default QuoridorBoard;
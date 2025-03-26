import React, { useState, useEffect } from 'react';

const QuoridorBoard = ({ 
  boardState, 
  onCellClick, 
  onWallClick, 
  nextPawnMoves, 
  nextWallMoves,
  selectedWallType,
  setSelectedWallType,
  player1Strategy,
  player2Strategy
}) => {
  // State for showing ghost walls on hover
  const [ghostWallPosition, setGhostWallPosition] = useState(null);
  
  // Handle key press for wall rotation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        setSelectedWallType(prev => prev === 'h' ? 'v' : 'h');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setSelectedWallType]);
  
  const toAlgebraicNotation = (row, col, size) => {
    const colLetter = String.fromCharCode(97 + col); // 'a' for col 0
    const rowNumber = size - row; // Row 0 is 9, row 8 is 1
    return `${colLetter}${rowNumber}`;
  };
  
  // Current player can make a move
  const canCurrentPlayerMove = (
    (boardState.activePlayer === 'player1' && player1Strategy === 'Human') ||
    (boardState.activePlayer === 'player2' && player2Strategy === 'Human')
  );
  
  return (
    <div className="relative w-[450px] h-[450px] bg-gray-50 border border-gray-400 rounded p-1 overflow-hidden">
      {/* Board Grid - 9x9 game cells */}
      <div className="grid grid-cols-9 gap-0 w-full h-full">
        {Array(9).fill(0).map((_, row) => (
          Array(9).fill(0).map((_, col) => {
            const isPlayer1 = boardState.player1Pos.row === row && boardState.player1Pos.col === col;
            const isPlayer2 = boardState.player2Pos.row === row && boardState.player2Pos.col === col;
            const isLegalMove = nextPawnMoves.some(move => move.row === row && move.col === col);
            
            return (
              <div 
                key={`cell-${row}-${col}`} 
                className={`
                  relative border border-gray-200 flex items-center justify-center
                  ${isLegalMove && canCurrentPlayerMove ? 'bg-green-100 cursor-pointer' : 'bg-white'}
                  ${isPlayer1 || isPlayer2 ? 'bg-gray-100' : ''}
                `}
                onClick={() => onCellClick(row, col)}
              >
                {isPlayer1 && (
                  <div className="h-8 w-8 rounded-full bg-blue-500 z-10" />
                )}
                {isPlayer2 && (
                  <div className="h-8 w-8 rounded-full bg-red-500 z-10" />
                )}
                <div className="absolute text-xs text-gray-400 left-1 top-1 pointer-events-none">
                  {toAlgebraicNotation(row, col, 9)}
                </div>
                
                {/* Horizontal Wall (below the cell) */}
                {row < 8 && col < 8 && (
                  <div 
                    className={`
                      absolute bottom-0 left-0 right-0 h-1 transform translate-y-1/2 z-20
                      ${canCurrentPlayerMove && selectedWallType === 'h' ? 'cursor-pointer' : ''}
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canCurrentPlayerMove && nextWallMoves.h.some(w => w.row === row + 1 && w.col === col)) {
                        onWallClick(row + 1, col, 'h');
                      }
                    }}
                    onMouseEnter={() => {
                      if (canCurrentPlayerMove && selectedWallType === 'h') {
                        setGhostWallPosition({ row: row + 1, col, type: 'h' });
                      }
                    }}
                    onMouseLeave={() => setGhostWallPosition(null)}
                  >
                    {/* Wall visualization */}
                    {(boardState.hWalls.has(`${row + 1},${col}`) || 
                     (ghostWallPosition && 
                      ghostWallPosition.type === 'h' && 
                      ghostWallPosition.row === row + 1 && 
                      ghostWallPosition.col === col)) && (
                      <div
                        className={`
                          absolute h-2 w-full top-0 left-0 
                          ${boardState.hWalls.has(`${row + 1},${col}`) 
                            ? getWallColor(boardState, 'h', row + 1, col)
                            : 'bg-gray-400 bg-opacity-50'}
                        `}
                      />
                    )}
                  </div>
                )}
                
                {/* Vertical Wall (to the right of the cell) */}
                {row < 8 && col < 8 && (
                  <div 
                    className={`
                      absolute top-0 bottom-0 right-0 w-1 transform translate-x-1/2 z-20
                      ${canCurrentPlayerMove && selectedWallType === 'v' ? 'cursor-pointer' : ''}
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canCurrentPlayerMove && nextWallMoves.v.some(w => w.row === row && w.col === col + 1)) {
                        onWallClick(row, col + 1, 'v');
                      }
                    }}
                    onMouseEnter={() => {
                      if (canCurrentPlayerMove && selectedWallType === 'v') {
                        setGhostWallPosition({ row, col: col + 1, type: 'v' });
                      }
                    }}
                    onMouseLeave={() => setGhostWallPosition(null)}
                  >
                    {/* Wall visualization */}
                    {(boardState.vWalls.has(`${row},${col + 1}`) || 
                     (ghostWallPosition && 
                      ghostWallPosition.type === 'v' && 
                      ghostWallPosition.row === row && 
                      ghostWallPosition.col === col + 1)) && (
                      <div
                        className={`
                          absolute w-2 h-full top-0 left-0
                          ${boardState.vWalls.has(`${row},${col + 1}`) 
                            ? getWallColor(boardState, 'v', row, col + 1)
                            : 'bg-gray-400 bg-opacity-50'}
                        `}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })
        ))}
      </div>
      
      {/* Legend showing wall rotation key */}
      <div className="absolute bottom-2 right-2 text-xs bg-white bg-opacity-75 px-2 py-1 rounded">
        Press <kbd className="px-1 py-0.5 bg-gray-200 rounded">R</kbd> to rotate walls
      </div>
    </div>
  );
};

// Helper function to determine wall color based on player
function getWallColor(boardState, orientation, row, col) {
  const wallCoord = `${row},${col}`;
  const wall = boardState.moveHistory?.find(move => 
    move.type === 'wall' && 
    move.orientation === orientation && 
    (orientation === 'h' ? boardState.hWalls.has(wallCoord) : boardState.vWalls.has(wallCoord))
  );
  
  return wall?.player === 'player1' 
    ? 'bg-blue-600' 
    : wall?.player === 'player2' 
      ? 'bg-red-600' 
      : 'bg-gray-700';
}

export default QuoridorBoard;
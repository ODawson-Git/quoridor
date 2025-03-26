import React from 'react';

const QuoridorBoard = ({ 
  boardState, 
  onCellClick, 
  onWallClick, 
  nextPawnMoves, 
  nextWallMoves,
  selectedWallType,
  player1Strategy,
  player2Strategy
}) => {
  const renderCells = () => {
    const cells = [];
    const size = boardState.size || 9;
    
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const isPlayer1 = boardState.player1Pos.row === row && boardState.player1Pos.col === col;
        const isPlayer2 = boardState.player2Pos.row === row && boardState.player2Pos.col === col;
        
        const isLegalMove = nextPawnMoves.some(move => move.row === row && move.col === col);
        const canPlayerMove = 
          (boardState.activePlayer === 'player1' && player1Strategy === 'Human') ||
          (boardState.activePlayer === 'player2' && player2Strategy === 'Human');
        
        const cellClasses = `
          h-12 w-12 border border-gray-300 flex items-center justify-center relative
          ${isLegalMove && canPlayerMove ? 'cursor-pointer hover:bg-gray-100' : ''}
          ${isPlayer1 || isPlayer2 ? 'bg-gray-50' : ''}
        `;
        
        cells.push(
          <div 
            key={`cell-${row}-${col}`}
            className={cellClasses}
            onClick={() => onCellClick(row, col)}
          >
            {isPlayer1 && (
              <div className="h-8 w-8 rounded-full bg-blue-500" />
            )}
            {isPlayer2 && (
              <div className="h-8 w-8 rounded-full bg-red-500" />
            )}
            <div className="absolute text-xs text-gray-400 pointer-events-none">
              {toAlgebraicNotation(row, col, size)}
            </div>
          </div>
        );
      }
    }
    
    return cells;
  };
  
  // Fixed wall rendering function to correctly place walls according to algebraic notation
  const renderHorizontalWalls = () => {
    const walls = [];
    const size = boardState.size || 9;
    
    // For horizontal walls, we need to place them on the row boundaries
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size - 1; col++) {
        // In algebraic notation, a horizontal wall at d7h means a wall ABOVE d7,
        // blocking movement between d7 and d8
        const wallRow = row + 1; // Check for wall at one row up from current cell
        const isWall = boardState.hWalls.has(`${wallRow},${col}`);
        const isLegalWall = nextWallMoves.h.some(w => w.row === wallRow && w.col === col);
        const canPlayerMove = 
          (boardState.activePlayer === 'player1' && player1Strategy === 'Human') ||
          (boardState.activePlayer === 'player2' && player2Strategy === 'Human');
        
        // Determine wall color based on move history
        let wallColor = 'bg-gray-800';
        
        if (isWall) {
          // Find the wall in the move history to determine which player placed it
          const wallMove = boardState.moveHistory?.find(move => 
            move.type === 'wall' && 
            move.orientation === 'h' && 
            move.move.slice(0, -1) === toAlgebraicNotation(wallRow, col, size)
          );
          
          if (wallMove) {
            wallColor = wallMove.player === 'player1' ? 'bg-blue-800' : 'bg-red-800';
          }
        }
        
        const wallClasses = `
          absolute h-2 w-14 
          ${isWall ? wallColor : 'bg-transparent'}
          ${!isWall && isLegalWall && canPlayerMove && selectedWallType === 'h' ? 'cursor-pointer hover:bg-gray-300' : ''}
        `;
        
        // Fixed wall positioning:
        // Horizontal walls appear ABOVE the cell they're attached to in algebraic notation
        const left = 50 + col * 48;
        const top = row * 48 - 1; // Show wall on top of the cell
        
        walls.push(
          <div
            key={`hwall-${row}-${col}`}
            className={wallClasses}
            style={{ left: `${left}px`, top: `${top}px` }}
            onClick={() => !isWall && onWallClick(wallRow, col, 'h')}
          />
        );
      }
    }
    
    return walls;
  };
  
  const renderVerticalWalls = () => {
    const walls = [];
    const size = boardState.size || 9;
    
    // For vertical walls, we need to place them on the column boundaries
    for (let row = 0; row < size - 1; row++) {
      for (let col = 0; col < size; col++) {
        // In algebraic notation, a vertical wall at d7v means a wall to the LEFT of d7,
        // blocking movement between d7 and e7
        const wallCol = col + 1; // Check for wall at one column right from current cell
        const isWall = boardState.vWalls.has(`${row},${wallCol}`);
        const isLegalWall = nextWallMoves.v.some(w => w.row === row && w.col === wallCol);
        const canPlayerMove = 
          (boardState.activePlayer === 'player1' && player1Strategy === 'Human') ||
          (boardState.activePlayer === 'player2' && player2Strategy === 'Human');
        
        // Determine wall color based on move history
        let wallColor = 'bg-gray-800';
        
        if (isWall) {
          // Find the wall in the move history to determine which player placed it
          const wallMove = boardState.moveHistory?.find(move => 
            move.type === 'wall' && 
            move.orientation === 'v' && 
            move.move.slice(0, -1) === toAlgebraicNotation(row, wallCol, size)
          );
          
          if (wallMove) {
            wallColor = wallMove.player === 'player1' ? 'bg-blue-800' : 'bg-red-800';
          }
        }
        
        const wallClasses = `
          absolute w-2 h-14
          ${isWall ? wallColor : 'bg-transparent'}
          ${!isWall && isLegalWall && canPlayerMove && selectedWallType === 'v' ? 'cursor-pointer hover:bg-gray-300' : ''}
        `;
        
        // Fixed wall positioning:
        // Vertical walls appear to the LEFT of the cell they're attached to in algebraic notation
        const left = col * 48 + 47; // Show wall at the right edge of the cell
        const top = 50 + row * 48;
        
        walls.push(
          <div
            key={`vwall-${row}-${col}`}
            className={wallClasses}
            style={{ left: `${left}px`, top: `${top}px` }}
            onClick={() => !isWall && onWallClick(row, wallCol, 'v')}
          />
        );
      }
    }
    
    return walls;
  };
  
  const toAlgebraicNotation = (row, col, size) => {
    const colLetter = String.fromCharCode(97 + col); // 'a' for col 0
    const rowNumber = size - row; // Row 0 is 9, row 8 is 1
    return `${colLetter}${rowNumber}`;
  };
  
  return (
    <div 
      className="relative w-[450px] h-[450px] border border-gray-400 rounded"
      style={{ backgroundColor: '#f8f8f8' }}
    >
      <div className="grid grid-cols-9 grid-rows-9 absolute inset-0 p-1">
        {renderCells()}
      </div>
      {renderHorizontalWalls()}
      {renderVerticalWalls()}
    </div>
  );
};

export default QuoridorBoard;
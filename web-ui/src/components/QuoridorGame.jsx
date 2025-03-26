import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import QuoridorBoard from './QuoridorBoard';

// Import the WebAssembly module - this will be available after we build
import init, { QuoridorGame as WasmQuoridor, wasm_log } from '../wasm/pkg/quoridor';const BOARD_SIZE = 9;
const INITIAL_WALLS = 10;

// Player enum
const Player = {
  PLAYER1: 'player1',
  PLAYER2: 'player2',
};

// Strategy names
const STRATEGIES = [
  'Human',
  'Random',
  'ShortestPath',
  'Defensive',
  'Balanced',
  'Adaptive',
  'Minimax1',
  'Minimax2',
  'Mirror'
];

// Opening names
const OPENINGS = [
  'No Opening',
  'Sidewall Opening',
  'Standard Opening',
  'Shiller Opening',
  'Stonewall',
  'Ala Opening',
  'Standard Opening (Symmetrical)',
  'Rush Variation',
  'Gap Opening',
  'Gap Opening (Mainline)',
  'Anti-Gap',
  'Sidewall',
  'Sidewall (Proper Counter)',
  'Quick Box Variation',
  'Shatranj Opening',
  'Lee Inversion'
];

const QuoridorGameComponent = () => {
  // WASM game instance
  const [wasmGame, setWasmGame] = useState(null);
  const [wasmError, setWasmError] = useState(null);
  
  // Game state
  const [boardState, setBoardState] = useState({
    size: BOARD_SIZE,
    hWalls: new Set(),
    vWalls: new Set(),
    player1Pos: { row: BOARD_SIZE - 1, col: Math.floor(BOARD_SIZE / 2) },
    player2Pos: { row: 0, col: Math.floor(BOARD_SIZE / 2) },
    player1Walls: INITIAL_WALLS,
    player2Walls: INITIAL_WALLS,
    activePlayer: Player.PLAYER1,
    moveHistory: [],
    lastMove: null,
  });

  // Game mode and configuration
  const [gameMode, setGameMode] = useState('play'); // 'play' or 'watch'
  const [player1Strategy, setPlayer1Strategy] = useState('Human');
  const [player2Strategy, setPlayer2Strategy] = useState('Adaptive');
  const [gameSpeed, setGameSpeed] = useState(1000); // milliseconds
  const [selectedOpening, setSelectedOpening] = useState('No Opening');
  const [isGameActive, setIsGameActive] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedWallType, setSelectedWallType] = useState('h');
  const [nextPawnMoves, setNextPawnMoves] = useState([]);
  const [nextWallMoves, setNextWallMoves] = useState({ h: [], v: [] });
  
  // Initialize WebAssembly module
  useEffect(() => {
    const initWasm = async () => {
      try {
        // Initialize the WASM module
        await init();
        
        // Create a new game instance
        const game = new WasmQuoridor(BOARD_SIZE, INITIAL_WALLS);
        setWasmGame(game);
        console.log("WebAssembly module initialized");
      } catch (error) {
        console.error("Failed to initialize WebAssembly module:", error);
        setWasmError(error.toString());
      }
    };
  
    initWasm();
    
    // Clean up on unmount
    return () => {
      if (wasmGame) {
        console.log("Cleaning up WebAssembly game");
      }
    };
  }, []);
  
  // Convert between algebraic notation and row/col coordinates
  const toAlgebraicNotation = useCallback((row, col) => {
    const colLetter = String.fromCharCode(97 + col); // 'a' for col 0
    const rowNumber = BOARD_SIZE - row; // Row 0 is 9, row 8 is 1
    return `${colLetter}${rowNumber}`;
  }, []);

  const fromAlgebraicNotation = useCallback((notation) => {
    if (!notation || notation.length < 2) return null;
    
    const colLetter = notation[0].toLowerCase();
    const col = colLetter.charCodeAt(0) - 97; // 'a' is 0
    
    const rowNumber = parseInt(notation.substring(1));
    const row = BOARD_SIZE - rowNumber;
    
    return { row, col };
  }, []);

  // Update board state from WASM
  const updateBoardStateFromWasm = useCallback(() => {
    if (!wasmGame) return;
    
    try {
      // Get game state JSON
      const gameStateJson = wasmGame.get_game_state();
      const gameState = JSON.parse(gameStateJson);
      
      // Convert wall strings to coordinates
      const hWallsSet = new Set();
      const vWallsSet = new Set();
      
      gameState.hWalls.forEach(wallStr => {
        const coord = fromAlgebraicNotation(wallStr);
        if (coord) {
          hWallsSet.add(`${coord.row},${coord.col}`);
        }
      });
      
      gameState.vWalls.forEach(wallStr => {
        const coord = fromAlgebraicNotation(wallStr);
        if (coord) {
          vWallsSet.add(`${coord.row},${coord.col}`);
        }
      });
      
      // Update board state
      setBoardState(prev => ({
        ...prev,
        player1Pos: gameState.player1,
        player2Pos: gameState.player2,
        player1Walls: gameState.player1Walls,
        player2Walls: gameState.player2Walls,
        hWalls: hWallsSet,
        vWalls: vWallsSet,
        activePlayer: gameState.activePlayer === 1 ? Player.PLAYER1 : Player.PLAYER2,
      }));
      
      // Update legal moves
      updateLegalMoves();
      
    } catch (error) {
      console.error("Error updating board state from WASM:", error);
      setMessage(`Error: ${error.toString()}`);
    }
  }, [wasmGame, fromAlgebraicNotation]);
  
  // Update legal moves
  const updateLegalMoves = useCallback(() => {
    if (!wasmGame || !isGameActive) return;
    
    try {
      // Get legal pawn moves
      const legalPawnMovesStr = wasmGame.get_legal_moves();
      const legalMoves = [];
      
      // Convert from algebraic notation to coordinates
      legalPawnMovesStr.forEach(moveStr => {
        const coord = fromAlgebraicNotation(moveStr);
        if (coord) {
          legalMoves.push(coord);
        }
      });
      
      setNextPawnMoves(legalMoves);
      
      // Get legal wall placements
      const legalWallsStr = wasmGame.get_legal_walls();
      const hWalls = [];
      const vWalls = [];
      
      legalWallsStr.forEach(wallStr => {
        if (wallStr.endsWith('h')) {
          const coord = fromAlgebraicNotation(wallStr.slice(0, -1));
          if (coord) {
            hWalls.push(coord);
          }
        } else if (wallStr.endsWith('v')) {
          const coord = fromAlgebraicNotation(wallStr.slice(0, -1));
          if (coord) {
            vWalls.push(coord);
          }
        }
      });
      
      setNextWallMoves({ h: hWalls, v: vWalls });
      
    } catch (error) {
      console.error("Error updating legal moves:", error);
      setMessage(`Error: ${error.toString()}`);
    }
  }, [wasmGame, isGameActive, fromAlgebraicNotation]);

  // Move pawn to the specified position
  const movePawn = useCallback((row, col) => {
    if (!wasmGame) return false;
    
    const algebraicNotation = toAlgebraicNotation(row, col);
    
    // Check if this is a winning move
    const isWinningMove = wasmGame.check_win(algebraicNotation);
    
    // Make the move in the WASM game
    const moveSuccess = wasmGame.make_move(algebraicNotation);
    
    if (moveSuccess) {
      // Record move in history
      setBoardState(prev => {
        return {
          ...prev,
          moveHistory: [...prev.moveHistory, {
            player: prev.activePlayer,
            move: algebraicNotation,
            type: 'pawn',
          }],
          lastMove: algebraicNotation
        };
      });
      
      // Update board state from WASM
      updateBoardStateFromWasm();
      
      // Check for win
      if (isWinningMove) {
        setWinner(boardState.activePlayer);
        setIsGameActive(false);
        setMessage(`${boardState.activePlayer === Player.PLAYER1 ? 'Player 1' : 'Player 2'} wins!`);
      }
      
      return true;
    }
    
    return false;
  }, [wasmGame, toAlgebraicNotation, updateBoardStateFromWasm, boardState.activePlayer]);

  // Place a wall at the specified position
  const placeWall = useCallback((row, col, orientation) => {
    if (!wasmGame) return false;
    
    const algebraicNotation = toAlgebraicNotation(row, col) + orientation;
    
    // Make the move in the WASM game
    const moveSuccess = wasmGame.make_move(algebraicNotation);
    
    if (moveSuccess) {
      // Record move in history
      setBoardState(prev => {
        return {
          ...prev,
          moveHistory: [...prev.moveHistory, {
            player: prev.activePlayer,
            move: algebraicNotation,
            type: 'wall',
            orientation,
          }],
          lastMove: algebraicNotation
        };
      });
      
      // Update board state from WASM
      updateBoardStateFromWasm();
      
      return true;
    }
    
    return false;
  }, [wasmGame, toAlgebraicNotation, updateBoardStateFromWasm]);

  // Handle cell click for pawn movement
  const handleCellClick = useCallback((row, col) => {
    if (!wasmGame || !isGameActive || winner) return;
    
    // Get current player strategy
    const currentStrategy = boardState.activePlayer === Player.PLAYER1 
      ? player1Strategy 
      : player2Strategy;
    
    // Only allow human players to make moves
    if (currentStrategy !== 'Human') return;
    
    // Check if the move is legal
    const isLegalMove = nextPawnMoves.some(move => move.row === row && move.col === col);
    
    if (isLegalMove) {
      movePawn(row, col);
    }
  }, [wasmGame, isGameActive, winner, boardState.activePlayer, player1Strategy, player2Strategy, nextPawnMoves, movePawn]);

  // Handle wall placement
  const handleWallClick = useCallback((row, col, orientation) => {
    if (!wasmGame || !isGameActive || winner) return;
    
    // Get current player strategy
    const currentStrategy = boardState.activePlayer === Player.PLAYER1 
      ? player1Strategy 
      : player2Strategy;
    
    // Only allow human players to make moves
    if (currentStrategy !== 'Human') return;
    
    // Check if wall placement is legal
    const isLegalWall = nextWallMoves[orientation].some(
      wall => wall.row === row && wall.col === col
    );
    
    if (isLegalWall) {
      placeWall(row, col, orientation);
    }
  }, [wasmGame, isGameActive, winner, boardState.activePlayer, player1Strategy, player2Strategy, nextWallMoves, placeWall]);

  // Reset the game to initial state
  const resetGame = useCallback(() => {
    if (!wasmGame) return;
    
    wasmGame.reset_game();
    
    const center = Math.floor(BOARD_SIZE / 2);
    setBoardState({
      size: BOARD_SIZE,
      hWalls: new Set(),
      vWalls: new Set(),
      player1Pos: { row: BOARD_SIZE - 1, col: center },
      player2Pos: { row: 0, col: center },
      player1Walls: INITIAL_WALLS,
      player2Walls: INITIAL_WALLS,
      activePlayer: Player.PLAYER1,
      moveHistory: [],
      lastMove: null,
    });
    setWinner(null);
    setMessage('Game reset');
    setNextPawnMoves([]);
    setNextWallMoves({ h: [], v: [] });
    setIsGameActive(false);
  }, [wasmGame]);

  // Make AI move
  const makeAiMove = useCallback(async () => {
    if (!wasmGame || !isGameActive || winner) return;
    
    const currentStrategy = boardState.activePlayer === Player.PLAYER1 
      ? player1Strategy 
      : player2Strategy;
    
    // Skip if it's a human player's turn
    if (currentStrategy === 'Human') return;
    
    setIsThinking(true);
    
    // Add small delay to simulate thinking
    await new Promise(resolve => setTimeout(resolve, gameSpeed));
    
    // Get AI move from WASM
    const moveStr = wasmGame.get_ai_move();
    
    if (moveStr) {
      // Check if it's a wall move
      if (moveStr.length === 3 && (moveStr.endsWith('h') || moveStr.endsWith('v'))) {
        const orientation = moveStr.charAt(2);
        const position = fromAlgebraicNotation(moveStr.slice(0, 2));
        
        if (position) {
          placeWall(position.row, position.col, orientation);
          setMessage(`${currentStrategy} placed a ${orientation === 'h' ? 'horizontal' : 'vertical'} wall at ${moveStr.slice(0, 2)}`);
        }
      } else {
        // It's a pawn move
        const position = fromAlgebraicNotation(moveStr);
        
        if (position) {
          movePawn(position.row, position.col);
          setMessage(`${currentStrategy} moved to ${moveStr}`);
        }
      }
    } else {
      setMessage(`${currentStrategy} couldn't find a move`);
    }
    
    setIsThinking(false);
  }, [
    wasmGame, isGameActive, winner, boardState.activePlayer, 
    player1Strategy, player2Strategy, gameSpeed, 
    fromAlgebraicNotation, placeWall, movePawn
  ]);

  // Run AI moves automatically
  useEffect(() => {
    if (wasmGame && isGameActive && !winner && !isThinking) {
      const currentStrategy = boardState.activePlayer === Player.PLAYER1 
        ? player1Strategy 
        : player2Strategy;
      
      if (currentStrategy !== 'Human' || gameMode === 'watch') {
        const timerId = setTimeout(() => {
          makeAiMove();
        }, 100);
        
        return () => clearTimeout(timerId);
      }
    }
  }, [
    wasmGame, boardState, gameMode, isGameActive, 
    isThinking, makeAiMove, player1Strategy, 
    player2Strategy, winner
  ]);

  // Start a new game
  const startGame = useCallback(() => {
    if (!wasmGame) {
      setMessage("WebAssembly not initialized");
      return;
    }
    
    resetGame();
    
    // Set strategies in the WASM game
    if (player1Strategy !== 'Human') {
      wasmGame.set_strategy(1, player1Strategy, selectedOpening);
    }
    
    if (player2Strategy !== 'Human') {
      wasmGame.set_strategy(2, player2Strategy, selectedOpening);
    }
    
    setIsGameActive(true);
    updateBoardStateFromWasm();
    
    // Set message
    if (selectedOpening !== 'No Opening') {
      setMessage(`Started new game with ${selectedOpening} opening`);
    } else {
      setMessage('Started new game');
    }
  }, [
    wasmGame, resetGame, player1Strategy, 
    player2Strategy, selectedOpening, updateBoardStateFromWasm
  ]);

  // Render move history
  const renderMoveHistory = useCallback(() => {
    return boardState.moveHistory.map((move, index) => {
      const player = move.player === Player.PLAYER1 ? 'Player 1' : 'Player 2';
      const moveStyle = move.player === Player.PLAYER1 
        ? 'text-blue-500' 
        : 'text-red-500';
      
      return (
        <div key={`move-${index}`} className={`${moveStyle} text-sm`}>
          {index + 1}. {player}: {move.move}
        </div>
      );
    });
  }, [boardState.moveHistory]);

  // Show error if WebAssembly failed to load
  if (wasmError) {
    return (
      <div className="flex flex-col items-center p-4">
        <h1 className="text-2xl font-bold mb-4 text-red-600">WebAssembly Error</h1>
        <div className="bg-red-100 p-4 rounded mb-4 max-w-lg">
          <p className="mb-2">Failed to load the WebAssembly module:</p>
          <pre className="text-sm bg-red-50 p-2 rounded overflow-auto">
            {wasmError}
          </pre>
        </div>
        <div className="text-sm">
          <p>Possible solutions:</p>
          <ul className="list-disc pl-6">
            <li>Make sure you've built the WebAssembly module with <code>wasm-pack build --target web</code></li>
            <li>Check that the symbolic link to the WASM package is correct</li>
            <li>Try running with a local web server that supports WASM</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-4 h-full">
      <h1 className="text-2xl font-bold mb-4">Quoridor Game</h1>
      
      {!wasmGame && (
        <div className="bg-yellow-100 p-4 rounded mb-4">
          Loading WebAssembly module...
        </div>
      )}
      
      {/* Game configuration */}
      <div className="flex flex-wrap gap-4 mb-4 w-full max-w-4xl">
        <div className="flex flex-col">
          <label className="text-sm font-medium">Game Mode</label>
          <select 
            className="border rounded px-2 py-1"
            value={gameMode}
            onChange={(e) => setGameMode(e.target.value)}
            disabled={isGameActive || !wasmGame}
          >
            <option value="play">Play</option>
            <option value="watch">Watch AI vs. AI</option>
          </select>
        </div>
        
        <div className="flex flex-col">
          <label className="text-sm font-medium">Player 1 (Blue)</label>
          <select 
            className="border rounded px-2 py-1"
            value={player1Strategy}
            onChange={(e) => setPlayer1Strategy(e.target.value)}
            disabled={isGameActive || !wasmGame}
          >
            {gameMode === 'play' && <option value="Human">Human</option>}
            {STRATEGIES.filter(s => s !== 'Human').map(strategy => (
              <option key={strategy} value={strategy}>{strategy}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col">
          <label className="text-sm font-medium">Player 2 (Red)</label>
          <select 
            className="border rounded px-2 py-1"
            value={player2Strategy}
            onChange={(e) => setPlayer2Strategy(e.target.value)}
            disabled={isGameActive || !wasmGame}
          >
            {gameMode === 'play' && <option value="Human">Human</option>}
            {STRATEGIES.filter(s => s !== 'Human').map(strategy => (
              <option key={strategy} value={strategy}>{strategy}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col">
          <label className="text-sm font-medium">Opening</label>
          <select 
            className="border rounded px-2 py-1"
            value={selectedOpening}
            onChange={(e) => setSelectedOpening(e.target.value)}
            disabled={isGameActive || !wasmGame}
          >
            {OPENINGS.map(opening => (
              <option key={opening} value={opening}>{opening}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col">
          <label className="text-sm font-medium">Game Speed (ms)</label>
          <input 
            type="number" 
            className="border rounded px-2 py-1"
            value={gameSpeed}
            onChange={(e) => setGameSpeed(parseInt(e.target.value))}
            min="100"
            max="5000"
            step="100"
            disabled={!wasmGame}
          />
        </div>
        
        <div className="flex items-end">
          <button 
            className={`px-4 py-1 rounded ${isGameActive ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
            onClick={isGameActive ? resetGame : startGame}
            disabled={!wasmGame}
          >
            {isGameActive ? 'Reset Game' : 'Start Game'}
          </button>
        </div>
      </div>
      
      {/* Wall placement type selector (only shown for human players) */}
      {isGameActive && wasmGame &&
       ((boardState.activePlayer === Player.PLAYER1 && player1Strategy === 'Human') ||
        (boardState.activePlayer === Player.PLAYER2 && player2Strategy === 'Human')) && (
        <div className="mb-4 flex gap-4">
          <div className="flex items-center">
            <label className="mr-2">Wall Type:</label>
            <select
              className="border rounded px-2 py-1"
              value={selectedWallType}
              onChange={(e) => setSelectedWallType(e.target.value)}
            >
              <option value="h">Horizontal</option>
              <option value="v">Vertical</option>
            </select>
          </div>
          
          <div className="flex items-center">
            <span className="px-2 py-1 bg-gray-100 rounded">
              Walls Left: {boardState.activePlayer === Player.PLAYER1 ? boardState.player1Walls : boardState.player2Walls}
            </span>
          </div>
        </div>
      )}
      
      {/* Game status message */}
      {message && (
        <div className="mb-4 text-gray-700">{message}</div>
      )}
      
      {/* Thinking indicator */}
      {isThinking && (
        <div className="mb-4 text-gray-700 flex items-center">
          <AlertCircle size={16} className="mr-2" />
          AI is thinking...
        </div>
      )}
      
      {/* Game container */}
      <div className="flex">
        {/* Game board */}
        <QuoridorBoard
          boardState={boardState}
          onCellClick={handleCellClick}
          onWallClick={handleWallClick}
          nextPawnMoves={nextPawnMoves}
          nextWallMoves={nextWallMoves}
          selectedWallType={selectedWallType}
          player1Strategy={player1Strategy}
          player2Strategy={player2Strategy}
        />
        
        {/* Game info panel */}
        <div className="ml-6 w-64">
          <div>
            <h3 className="font-bold mb-2">Current Turn</h3>
            <div className={`flex items-center mb-4 ${boardState.activePlayer === Player.PLAYER1 ? 'text-blue-500' : 'text-red-500'}`}>
              <div className={`h-4 w-4 rounded-full ${boardState.activePlayer === Player.PLAYER1 ? 'bg-blue-500' : 'bg-red-500'} mr-2`}></div>
              <span>{boardState.activePlayer === Player.PLAYER1 ? 'Player 1' : 'Player 2'}</span>
              <span className="ml-2">
                ({boardState.activePlayer === Player.PLAYER1 ? player1Strategy : player2Strategy})
              </span>
            </div>
          </div>
          
          <div>
            <h3 className="font-bold mb-2">Walls Remaining</h3>
            <div className="flex justify-between mb-4">
              <div className="flex items-center">
                <div className="h-4 w-4 rounded-full bg-blue-500 mr-2"></div>
                <span>Player 1: {boardState.player1Walls}</span>
              </div>
              <div className="flex items-center">
                <div className="h-4 w-4 rounded-full bg-red-500 mr-2"></div>
                <span>Player 2: {boardState.player2Walls}</span>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="font-bold mb-2">Move History</h3>
            <div className="border p-2 h-64 overflow-y-auto">
              {renderMoveHistory()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Game instructions */}
      <div className="mt-8 text-sm text-gray-600 max-w-2xl">
        <h3 className="font-bold mb-2">How to Play</h3>
        <p className="mb-2">
          <strong>Objective:</strong> Move your pawn to the opposite side of the board before your opponent.
        </p>
        <p className="mb-2">
          <strong>Pawn Movement:</strong> On your turn, move your pawn one square horizontally or vertically.
        </p>
        <p className="mb-2">
          <strong>Wall Placement:</strong> Instead of moving, you can place a wall to block your opponent's path. Each player has 10 walls.
        </p>
        <p className="mb-2">
          <strong>Rules:</strong> You cannot completely block a player's path to the goal. If a player is directly in front of you, you can jump over them.
        </p>
      </div>
    </div>
  );
};

export default QuoridorGameComponent;
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import QuoridorBoard from './QuoridorBoard';

// Import the WebAssembly module - this will be available after we build
import init, { QuoridorGame as WasmQuoridor, wasm_log } from '../wasm/pkg/quoridor';

const BOARD_SIZE = 9;
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
  // WASM game instance - using a ref to avoid recreation on renders
  const wasmGameRef = useRef(null);
  const [wasmLoaded, setWasmLoaded] = useState(false);
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
  const [selectedOpening, setSelectedOpening] = useState('No Opening');
  const [isGameActive, setIsGameActive] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedWallType, setSelectedWallType] = useState('h');
  const [nextPawnMoves, setNextPawnMoves] = useState([]);
  const [nextWallMoves, setNextWallMoves] = useState({ h: [], v: [] });
  
  // Flag to prevent multiple simultaneous AI moves
  const isProcessingMoveRef = useRef(false);
  
  // Initialize WebAssembly module
  useEffect(() => {
    const initWasm = async () => {
      try {
        // Initialize the WASM module
        await init();
        
        // Create a new game instance
        const game = new WasmQuoridor(BOARD_SIZE, INITIAL_WALLS);
        wasmGameRef.current = game;
        setWasmLoaded(true);
        console.log("WebAssembly module initialized");
      } catch (error) {
        console.error("Failed to initialize WebAssembly module:", error);
        setWasmError(error.toString());
      }
    };
  
    initWasm();
    
    // Clean up on unmount
    return () => {
      // No need to explicitly clean up - Rust will handle this
      console.log("Component unmounting");
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
    if (isNaN(rowNumber)) return null;
    
    const row = BOARD_SIZE - rowNumber;
    
    return { row, col };
  }, []);

  // Update board state from WASM with better error handling
  const updateBoardStateFromWasm = useCallback(() => {
    const game = wasmGameRef.current;
    if (!game) return false;
    
    try {
      // Get game state JSON
      const gameStateJson = game.get_game_state();
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
      return true;
    } catch (error) {
      console.error("Error updating board state from WASM:", error);
      setMessage(`Error: ${error.toString()}`);
      return false;
    }
  }, [fromAlgebraicNotation]);
  
  // Update legal moves with better error handling
  const updateLegalMoves = useCallback(() => {
    const game = wasmGameRef.current;
    if (!game || !isGameActive) return false;
    
    try {
      // Get legal pawn moves
      const legalPawnMovesStr = game.get_legal_moves();
      const legalMoves = [];
      
      // Convert from algebraic notation to coordinates
      if (Array.isArray(legalPawnMovesStr)) {
        legalPawnMovesStr.forEach(moveStr => {
          const coord = fromAlgebraicNotation(moveStr);
          if (coord) {
            legalMoves.push(coord);
          }
        });
      } else {
        console.warn("Legal pawn moves returned unexpected format:", legalPawnMovesStr);
      }
      
      setNextPawnMoves(legalMoves);
      
      // Get legal wall placements
      const legalWallsStr = game.get_legal_walls();
      const hWalls = [];
      const vWalls = [];
      
      if (Array.isArray(legalWallsStr)) {
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
      } else {
        console.warn("Legal walls returned unexpected format:", legalWallsStr);
      }
      
      setNextWallMoves({ h: hWalls, v: vWalls });
      return true;
    } catch (error) {
      console.error("Error updating legal moves:", error);
      setMessage(`Error: ${error.toString()}`);
      return false;
    }
  }, [isGameActive, fromAlgebraicNotation]);

  // Move pawn to the specified position with better error handling
  const movePawn = useCallback((row, col) => {
    const game = wasmGameRef.current;
    if (!game) return false;
    
    try {
      const algebraicNotation = toAlgebraicNotation(row, col);
      
      // Check if this is a winning move
      const isWinningMove = game.check_win(algebraicNotation);
      
      // Make the move in the WASM game
      const moveSuccess = game.make_move(algebraicNotation);
      
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
    } catch (error) {
      console.error("Error moving pawn:", error);
      setMessage(`Error moving pawn: ${error.toString()}`);
      return false;
    }
  }, [wasmGameRef, toAlgebraicNotation, updateBoardStateFromWasm, boardState.activePlayer]);

  // Place a wall at the specified position with better error handling
  const placeWall = useCallback((row, col, orientation) => {
    const game = wasmGameRef.current;
    if (!game) return false;
    
    try {
      const algebraicNotation = toAlgebraicNotation(row, col) + orientation;
      
      // Make the move in the WASM game
      const moveSuccess = game.make_move(algebraicNotation);
      
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
    } catch (error) {
      console.error("Error placing wall:", error);
      setMessage(`Error placing wall: ${error.toString()}`);
      return false;
    }
  }, [wasmGameRef, toAlgebraicNotation, updateBoardStateFromWasm]);

  // Handle cell click for pawn movement
  const handleCellClick = useCallback((row, col) => {
    if (!wasmLoaded || !isGameActive || winner) return;
    
    // Get current player strategy
    const currentStrategy = boardState.activePlayer === Player.PLAYER1 
      ? player1Strategy 
      : player2Strategy;
    
    // Only allow human players to make moves
    if (currentStrategy !== 'Human') return;
    
    // Check if the move is legal
    const isLegalMove = nextPawnMoves.some(move => move.row === row && move.col === col);
    
    if (isLegalMove) {
      const success = movePawn(row, col);
      if (!success) {
        console.error("Failed to move pawn to", row, col);
        setMessage("Error: Failed to move pawn");
      }
    }
  }, [wasmLoaded, isGameActive, winner, boardState.activePlayer, player1Strategy, player2Strategy, nextPawnMoves, movePawn]);

  // Handle wall placement
  const handleWallClick = useCallback((row, col, orientation) => {
    if (!wasmLoaded || !isGameActive || winner) return;
    
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
  }, [wasmLoaded, isGameActive, winner, boardState.activePlayer, player1Strategy, player2Strategy, nextWallMoves, placeWall]);

  // Reset the game to initial state with better error handling
  const resetGame = useCallback(() => {
    const game = wasmGameRef.current;
    if (!game) return;
    
    try {
      // Stop any ongoing game first
      setIsGameActive(false);
      setIsThinking(false);
      isProcessingMoveRef.current = false;
      
      // Create a completely new game instance to avoid memory issues
      // This is the key fix for the "recursive use of an object" error
      try {
        const newGame = new WasmQuoridor(BOARD_SIZE, INITIAL_WALLS);
        wasmGameRef.current = newGame;
      } catch (error) {
        console.error("Error creating new game instance:", error);
        setMessage(`Error: ${error.toString()}`);
        return;
      }
      
      // Reset all our React state
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
      
      console.log("Game successfully reset");
    } catch (error) {
      console.error("Error resetting game:", error);
      setMessage(`Error resetting game: ${error.toString()}`);
    }
  }, []);

  // Make AI move with better error handling and guards against multiple moves
  const makeAiMove = useCallback(async () => {
    const game = wasmGameRef.current;
    if (!game || !isGameActive || winner || isProcessingMoveRef.current) return;
    
    const currentStrategy = boardState.activePlayer === Player.PLAYER1 
      ? player1Strategy 
      : player2Strategy;
    
    // Skip if it's a human player's turn
    if (currentStrategy === 'Human') return;
    
    // Set the thinking flag and guard against multiple moves
    setIsThinking(true);
    isProcessingMoveRef.current = true;
    
    try {
      // Get AI move from WASM with a safety timeout
      let moveStr;
      
      try {
        // Wrap potentially problematic call in try-catch
        moveStr = game.get_ai_move();
      } catch (error) {
        console.error("Error in AI get_ai_move:", error);
        setMessage(`AI error: ${error.toString()}`);
        
        // Reset the game if it's a critical error
        if (error.toString().includes("unreachable executed") || 
            error.toString().includes("recursive use of an object")) {
          console.log("Critical error detected, resetting game...");
          resetGame();
          return;
        }
        
        // Skip this move and continue the game
        isProcessingMoveRef.current = false;
        setIsThinking(false);
        return;
      }
      
      if (moveStr && moveStr.length > 0) {
        let moveSuccess = false;
        
        // Check if it's a wall move
        if (moveStr.length === 3 && (moveStr.endsWith('h') || moveStr.endsWith('v'))) {
          const orientation = moveStr.charAt(2);
          const position = fromAlgebraicNotation(moveStr.slice(0, 2));
          
          if (position) {
            moveSuccess = placeWall(position.row, position.col, orientation);
            if (moveSuccess) {
              setMessage(`${currentStrategy} placed a ${orientation === 'h' ? 'horizontal' : 'vertical'} wall at ${moveStr.slice(0, 2)}`);
            } else {
              console.error("Failed to place wall:", moveStr);
              setMessage(`Error: Failed to place wall at ${moveStr}`);
            }
          }
        } else {
          // It's a pawn move
          const position = fromAlgebraicNotation(moveStr);
          
          if (position) {
            moveSuccess = movePawn(position.row, position.col);
            if (moveSuccess) {
              setMessage(`${currentStrategy} moved to ${moveStr}`);
            } else {
              console.error("Failed to move pawn:", moveStr);
              setMessage(`Error: Failed to move pawn to ${moveStr}`);
            }
          }
        }
        
        // If the move failed, it might indicate a problem with the game state
        if (!moveSuccess) {
          console.warn("AI move failed, updating game state");
          updateBoardStateFromWasm();
        }
      } else {
        console.error("AI returned empty move");
        setMessage(`${currentStrategy} couldn't find a move`);
      }
    } catch (error) {
      console.error("Error making AI move:", error);
      setMessage(`Error with AI move: ${error.toString()}`);
      
      // If it's a critical error, reset the game
      if (error.toString().includes("unreachable executed") || 
          error.toString().includes("recursive use of an object")) {
        console.log("Critical error detected, resetting game...");
        resetGame();
      }
    } finally {
      isProcessingMoveRef.current = false;
      setIsThinking(false);
    }
  }, [
    wasmGameRef, isGameActive, winner, boardState.activePlayer, 
    player1Strategy, player2Strategy, 
    fromAlgebraicNotation, placeWall, movePawn, 
    updateBoardStateFromWasm, resetGame
  ]);

  // Fixed AI move speed (500ms between moves)
  const AI_MOVE_SPEED = 500; // milliseconds between AI moves

  // Run AI moves automatically with better error handling
  useEffect(() => {
    if (wasmLoaded && isGameActive && !winner && !isThinking && !isProcessingMoveRef.current) {
      const currentStrategy = boardState.activePlayer === Player.PLAYER1 
        ? player1Strategy 
        : player2Strategy;
      
      if (currentStrategy !== 'Human' || gameMode === 'watch') {
        const timerId = setTimeout(() => {
          makeAiMove();
        }, AI_MOVE_SPEED);
        
        return () => clearTimeout(timerId);
      }
    }
  }, [
    wasmLoaded, boardState, gameMode, isGameActive, 
    isThinking, makeAiMove, player1Strategy, 
    player2Strategy, winner
  ]);

  // Start a new game with better error handling
  const startGame = useCallback(() => {
    const game = wasmGameRef.current;
    if (!game) {
      setMessage("WebAssembly not initialized");
      return;
    }
    
    try {
      // First ensure we have a clean game state
      resetGame();
      
      // Small delay to ensure reset is complete
      setTimeout(() => {
        try {
          const game = wasmGameRef.current;
          if (!game) {
            setMessage("Game instance is null after reset");
            return;
          }
          
          // Set strategies in the WASM game - only set for AI players
          let strategySetSuccess = true;
          
          if (player1Strategy !== 'Human') {
            const strategy1Set = game.set_strategy(1, player1Strategy, selectedOpening);
            if (!strategy1Set) {
              console.error("Failed to set strategy for player 1");
              strategySetSuccess = false;
            }
          }
          
          if (player2Strategy !== 'Human') {
            const strategy2Set = game.set_strategy(2, player2Strategy, selectedOpening);
            if (!strategy2Set) {
              console.error("Failed to set strategy for player 2");
              strategySetSuccess = false;
            }
          }
          
          if (!strategySetSuccess) {
            setMessage("Warning: Some AI strategies could not be set");
          }
          
          setIsGameActive(true);
          updateBoardStateFromWasm();
          
          // Set message
          if (selectedOpening !== 'No Opening') {
            setMessage(`Started new game with ${selectedOpening} opening`);
          } else {
            setMessage('Started new game');
          }
        } catch (error) {
          console.error("Error starting game:", error);
          setMessage(`Error starting game: ${error.toString()}`);
        }
      }, 200); // Slightly longer delay to ensure clean state
    } catch (error) {
      console.error("Error in resetGame:", error);
      setMessage(`Error resetting game: ${error.toString()}`);
    }
  }, [
    wasmGameRef, resetGame, player1Strategy, 
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
      
      {!wasmLoaded && (
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
            disabled={isGameActive || !wasmLoaded}
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
            disabled={isGameActive || !wasmLoaded}
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
            disabled={isGameActive || !wasmLoaded}
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
            disabled={isGameActive || !wasmLoaded}
          >
            {OPENINGS.map(opening => (
              <option key={opening} value={opening}>{opening}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-end">
          <button 
            className={`px-4 py-1 rounded ${isGameActive ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
            onClick={isGameActive ? resetGame : startGame}
            disabled={!wasmLoaded || isThinking}
          >
            {isGameActive ? 'Reset Game' : 'Start Game'}
          </button>
        </div>
      </div>
      
      {/* Main game container with fixed height for status area */}
      <div className="w-full max-w-4xl flex flex-col">
        {/* Status area with fixed height to prevent shifting */}
        <div className="h-16 mb-2">
          {/* Wall placement type selector (only shown for human players) */}
          {isGameActive && wasmLoaded &&
          ((boardState.activePlayer === Player.PLAYER1 && player1Strategy === 'Human') ||
            (boardState.activePlayer === Player.PLAYER2 && player2Strategy === 'Human')) ? (
            <div className="flex gap-4">
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
          ) : (
            <div className="h-8"> </div> // Empty space placeholder when wall controls aren't shown
          )}
          
          {/* Game status message */}
          <div className="flex items-center h-8">
            {message && <div className="text-gray-700">{message}</div>}
            
            {/* Thinking indicator */}
            {isThinking && (
              <div className="text-gray-700 flex items-center">
                <AlertCircle size={16} className="mr-2" />
                AI is thinking...
              </div>
            )}
          </div>
        </div>
        
        {/* Game board and info panel */}
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
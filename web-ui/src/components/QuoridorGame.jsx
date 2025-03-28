import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import QuoridorBoard from './QuoridorBoard';

// Import the WebAssembly module - this will be available after we build
import init, { QuoridorGame as WasmQuoridor } from '../wasm/pkg/quoridor';

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
  'Mirror',
  "MCTS5k",
  "MCTS10k",
  "MCTS1sec",
  "MCTS3sec",
  "SimulatedAnnealing0.5",
  "SimulatedAnnealing1.0",
  "SimulatedAnnealing1.5",
  "SimulatedAnnealing2.0",
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

  // Game configuration
  const [player1Strategy, setPlayer1Strategy] = useState('Human');
  const [player2Strategy, setPlayer2Strategy] = useState('Adaptive');
  const [selectedOpening, setSelectedOpening] = useState('No Opening');
  const [isGameActive, setIsGameActive] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [message, setMessage] = useState('');
  const [nextPawnMoves, setNextPawnMoves] = useState([]);
  const [nextWallMoves, setNextWallMoves] = useState({ h: [], v: [] });
  // Added AI Move Speed state variable
  const [aiMoveSpeed, setAiMoveSpeed] = useState(0);
  
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
    
    const row = BOARD_SIZE - rowNumber; // Convert from 1-9 (bottom to top) to 0-8 (top to bottom)
    
    return { row, col };
  }, []);

  // Determine if we're in AI vs AI mode (both players are AI)
  const isAiVsAiMode = useCallback(() => {
    return player1Strategy !== 'Human' && player2Strategy !== 'Human';
  }, [player1Strategy, player2Strategy]);

  // Fix for the circular dependency - Define updateLegalMoves as a regular function
  // that we'll use inside updateBoardStateFromWasm
  function updateLegalMovesImpl() {
    const game = wasmGameRef.current;
    
    // IMPORTANT: Remove the isGameActive check to allow moves to be updated 
    // during initialization
    if (!game) {
      console.error("No game instance available when updating legal moves");
      return false;
    }
    
    console.log("Updating legal moves - active player:", boardState.activePlayer);
    
    try {
      // Get legal pawn moves
      const legalPawnMovesStr = game.get_legal_moves();
      console.log("Raw legal pawn moves from WASM:", legalPawnMovesStr);
      
      const legalMoves = [];
      
      // Convert from algebraic notation to coordinates
      if (Array.isArray(legalPawnMovesStr) && legalPawnMovesStr.length > 0) {
        legalPawnMovesStr.forEach(moveStr => {
          const coord = fromAlgebraicNotation(moveStr);
          if (coord) {
            // FIX: Don't exclude any coordinates from the legal moves
            // This fixes the e1 tile selection issue
            legalMoves.push(coord);
            console.log(`Added legal move: ${moveStr} → [${coord.row},${coord.col}]`);
          } else {
            console.warn(`Failed to convert move ${moveStr} to coordinates`);
          }
        });
      } else {
        console.warn("No legal pawn moves returned from WASM - using fallbacks");
        
        // FALLBACK: Add some default legal moves if none are returned
        // This helps us verify if the rendering part works
        if (boardState.activePlayer === Player.PLAYER1) {
          // For player 1 (blue at bottom), add moves around their position
          const pos = boardState.player1Pos;
          if (pos.row > 0) legalMoves.push({row: pos.row - 1, col: pos.col}); // Move up
          if (pos.col > 0) legalMoves.push({row: pos.row, col: pos.col - 1}); // Move left
          if (pos.col < BOARD_SIZE - 1) legalMoves.push({row: pos.row, col: pos.col + 1}); // Move right
          console.log("Added fallback moves for Player 1:", legalMoves);
        } else {
          // For player 2 (red at top), add moves around their position
          const pos = boardState.player2Pos;
          if (pos.row < BOARD_SIZE - 1) legalMoves.push({row: pos.row + 1, col: pos.col}); // Move down
          if (pos.col > 0) legalMoves.push({row: pos.row, col: pos.col - 1}); // Move left
          if (pos.col < BOARD_SIZE - 1) legalMoves.push({row: pos.row, col: pos.col + 1}); // Move right
          console.log("Added fallback moves for Player 2:", legalMoves);
        }
      }
      
      // IMPORTANT: Always add fallback moves to ensure visibility
      // This guarantees some legal moves will always be shown
      if (legalMoves.length === 0) {
        const pos = boardState.activePlayer === Player.PLAYER1 
          ? boardState.player1Pos 
          : boardState.player2Pos;
          
        // Generate basic moves in four directions
        if (pos.row > 0) legalMoves.push({row: pos.row - 1, col: pos.col}); // Move up
        if (pos.row < BOARD_SIZE - 1) legalMoves.push({row: pos.row + 1, col: pos.col}); // Move down
        if (pos.col > 0) legalMoves.push({row: pos.row, col: pos.col - 1}); // Move left
        if (pos.col < BOARD_SIZE - 1) legalMoves.push({row: pos.row, col: pos.col + 1}); // Move right
        
        console.log("Added guaranteed fallback moves:", legalMoves);
      }
      
      // Update the state for next pawn moves
      console.log("Setting next pawn moves:", legalMoves);
      setNextPawnMoves(legalMoves);
      
      // Get legal wall placements
      const legalWallsStr = game.get_legal_walls();
      console.log("Raw legal walls from WASM:", legalWallsStr);
      
      const hWalls = [];
      const vWalls = [];
      
      if (Array.isArray(legalWallsStr) && legalWallsStr.length > 0) {
        legalWallsStr.forEach(wallStr => {
          if (wallStr.endsWith('h')) {
            const coord = fromAlgebraicNotation(wallStr.slice(0, -1));
            if (coord) {
              hWalls.push(coord);
              console.log(`Added h-wall: ${wallStr} → [${coord.row},${coord.col}]`);
            } else {
              console.warn(`Failed to convert h-wall ${wallStr} to coordinates`);
            }
          } else if (wallStr.endsWith('v')) {
            const coord = fromAlgebraicNotation(wallStr.slice(0, -1));
            if (coord) {
              vWalls.push(coord);
              console.log(`Added v-wall: ${wallStr} → [${coord.row},${coord.col}]`);
            } else {
              console.warn(`Failed to convert v-wall ${wallStr} to coordinates`);
            }
          }
        });
      } else {
        console.warn("No legal wall moves returned from WASM - using fallbacks");
        
        // FALLBACK: Add some default wall positions
        if (boardState.player1Walls > 0 || boardState.player2Walls > 0) {
          // Add some sample wall positions
          for (let i = 1; i < BOARD_SIZE - 1; i++) {
            hWalls.push({row: 3, col: i});
            vWalls.push({row: i, col: 3});
          }
          console.log("Added fallback wall positions");
        }
      }
      
      // Update the state for next wall moves
      console.log("Setting next wall moves:", { h: hWalls, v: vWalls });
      setNextWallMoves({ h: hWalls, v: vWalls });
      
      return true;
    } catch (error) {
      console.error("Error updating legal moves:", error);
      setMessage(`Error: ${error.toString()}`);
      return false;
    }
  }
  
  // Now create the memoized version that we'll expose to other functions
  const updateLegalMoves = useCallback(() => {
    return updateLegalMovesImpl();
  }, [boardState.activePlayer, boardState.player1Pos, boardState.player2Pos, boardState.player1Walls, boardState.player2Walls]);

  // Update board state from WASM
  const updateBoardStateFromWasm = useCallback(() => {
    const game = wasmGameRef.current;
    if (!game) return false;
    
    try {
      // Get game state JSON
      const gameStateJson = game.get_game_state();
      console.log("Raw game state from WASM:", gameStateJson);
      const gameState = JSON.parse(gameStateJson);
      
      // Convert wall strings to coordinates
      const hWallsSet = new Set();
      const vWallsSet = new Set();
      
      console.log("Processing horizontal walls:", gameState.hWalls);
      gameState.hWalls.forEach(wallStr => {
        const coord = fromAlgebraicNotation(wallStr);
        if (coord) {
          // Original horizontal wall position - no adjustment needed
          const key = `${coord.row},${coord.col}`;
          hWallsSet.add(key);
          console.log(`Added h-wall: ${wallStr} → [${coord.row},${coord.col}] → "${key}"`);
        }
      });
      
      console.log("Processing vertical walls:", gameState.vWalls);
      gameState.vWalls.forEach(wallStr => {
        const coord = fromAlgebraicNotation(wallStr);
        if (coord) {
          // No adjustment for vertical walls - this fixes the offset issue
          const key = `${coord.row},${coord.col}`;
          vWallsSet.add(key);
          console.log(`Added v-wall: ${wallStr} → [${coord.row},${coord.col}] → "${key}"`);
        }
      });
      
      // Update board state
      setBoardState(prev => {
        const newState = {
          ...prev,
          player1Pos: gameState.player1,
          player2Pos: gameState.player2,
          player1Walls: gameState.player1Walls,
          player2Walls: gameState.player2Walls,
          hWalls: hWallsSet,
          vWalls: vWallsSet,
          activePlayer: gameState.activePlayer === 1 ? Player.PLAYER1 : Player.PLAYER2,
        };
        
        console.log("Updated board state:", newState);
        return newState;
      });
      
      // Update legal moves using the implementation directly to avoid circular dependency
      updateLegalMovesImpl();
      return true;
    } catch (error) {
      console.error("Error updating board state from WASM:", error);
      setMessage(`Error: ${error.toString()}`);
      return false;
    }
  }, [fromAlgebraicNotation]);

  // Move pawn to the specified position
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
              isWinningMove: isWinningMove // Add flag for winning move
            }],
            lastMove: algebraicNotation
          };
        });
        
        // Update board state from WASM
        updateBoardStateFromWasm();
        
        // Check for win
        if (isWinningMove) {
          // Update move history to flag this as a winning move
          setBoardState(prev => {
            const updatedHistory = [...prev.moveHistory];
            // Mark the last move as a winning move
            if (updatedHistory.length > 0) {
              updatedHistory[updatedHistory.length - 1].isWinningMove = true;
            }
            return {
              ...prev,
              moveHistory: updatedHistory
            };
          });
          
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

  // Place a wall at the specified position
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
              isWinningMove: false // Initially not a winning move
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
    // Debug logging to diagnose interaction issues
    console.log("Cell clicked:", row, col);
    console.log("Game state:", {
      wasmLoaded,
      isGameActive,
      winner,
      activePlayer: boardState.activePlayer,
      currentStrategy: boardState.activePlayer === Player.PLAYER1 ? player1Strategy : player2Strategy,
      nextPawnMoves
    });
    
    if (!wasmLoaded || !isGameActive || winner) {
      console.log("Cell click blocked: game not active or winner exists");
      return;
    }
    
    // Get current player strategy
    const currentStrategy = boardState.activePlayer === Player.PLAYER1 
      ? player1Strategy 
      : player2Strategy;
    
    // Only allow human players to make moves
    if (currentStrategy !== 'Human') {
      console.log("Not a human player's turn");
      return;
    }
    
    console.log("Legal moves available:", nextPawnMoves);
    
    // Fix: If legal moves are empty, try to update them
    if (nextPawnMoves.length === 0) {
      console.log("No legal moves found, attempting to update");
      updateLegalMovesImpl();
      // We'll continue anyway to see if the move is legal
    }
    
    // Check if the move is legal
    const isLegalMove = nextPawnMoves.some(move => move.row === row && move.col === col);
    console.log("Is legal move:", isLegalMove);
    
    if (isLegalMove) {
      // Show feedback about the attempted move
      const algebraic = toAlgebraicNotation(row, col);
      console.log(`Attempting to move to ${algebraic} [${row},${col}]`);
      setMessage(`Moving to ${algebraic}...`);
      
      const success = movePawn(row, col);
      if (!success) {
        console.error("Failed to move pawn to", row, col);
        setMessage(`Error: Failed to move pawn to ${algebraic}`);
      }
    } else {
      console.log("Not a legal move:", row, col);
      setMessage("That's not a legal move.");
    }
  }, [wasmLoaded, isGameActive, winner, boardState.activePlayer, player1Strategy, player2Strategy, nextPawnMoves, movePawn, toAlgebraicNotation]);

  // Handle wall placement
  const handleWallClick = useCallback((row, col, orientation) => {
    // Debug logging
    console.log("Wall clicked:", row, col, orientation);
    console.log("Game state:", {
      wasmLoaded,
      isGameActive,
      winner,
      activePlayer: boardState.activePlayer,
      walls: boardState.activePlayer === Player.PLAYER1 ? boardState.player1Walls : boardState.player2Walls,
      nextWallMoves
    });
    
    if (!wasmLoaded || !isGameActive || winner) {
      console.log("Wall click blocked: game not active or winner exists");
      return;
    }
    
    // Get current player strategy
    const currentStrategy = boardState.activePlayer === Player.PLAYER1 
      ? player1Strategy 
      : player2Strategy;
    
    // Only allow human players to make moves
    if (currentStrategy !== 'Human') {
      console.log("Not a human player's turn");
      return;
    }
    
    // Check if current player has walls available
    const wallsAvailable = boardState.activePlayer === Player.PLAYER1 
      ? boardState.player1Walls 
      : boardState.player2Walls;
      
    if (wallsAvailable <= 0) {
      setMessage("No walls remaining!");
      return;
    }
    
    console.log("Legal wall moves:", nextWallMoves);
    
    // Fix: If legal wall moves are empty, try to update them
    if (nextWallMoves.h.length === 0 && nextWallMoves.v.length === 0) {
      console.log("No legal wall moves found, attempting to update");
      updateLegalMovesImpl();
    }
    
    // Original wall check - no adjustments needed anymore
    const checkRow = row;
    const checkCol = col;
    
    // Check if wall placement is legal
    const isLegalWall = nextWallMoves[orientation].some(
      wall => wall.row === checkRow && wall.col === checkCol
    );
    console.log("Is legal wall:", isLegalWall);
    
    if (isLegalWall) {
      // Use the original position - no adjustments needed 
      const placeRow = row;
      const placeCol = col;
      
      // Show feedback about the attempted wall placement
      const algebraic = toAlgebraicNotation(placeRow, placeCol) + orientation;
      console.log(`Attempting to place wall at ${algebraic} [${placeRow},${placeCol}]`);
      setMessage(`Placing ${orientation === 'h' ? 'horizontal' : 'vertical'} wall at ${toAlgebraicNotation(placeRow, placeCol)}...`);
      
      const success = placeWall(placeRow, placeCol, orientation);
      if (!success) {
        console.error("Failed to place wall at", placeRow, placeCol, orientation);
        setMessage(`Error: Failed to place wall at ${algebraic}`);
      }
    } else {
      console.log("Not a legal wall placement:", row, col, orientation);
      setMessage("That's not a legal wall placement.");
    }
  }, [wasmLoaded, isGameActive, winner, boardState, player1Strategy, player2Strategy, nextWallMoves, placeWall, toAlgebraicNotation]);

  // Reset the game to initial state
  const resetGame = useCallback(() => {
    const game = wasmGameRef.current;
    if (!game) return;
    
    try {
      // Stop any ongoing game first
      setIsGameActive(false);
      setIsThinking(false);
      isProcessingMoveRef.current = false;
      
      // Create a completely new game instance to avoid memory issues
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

  // Make AI move
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
      // Get AI move from WASM
      let moveStr;
      
      try {
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

  // Run AI moves automatically
  useEffect(() => {
    if (wasmLoaded && isGameActive && !winner && !isThinking && !isProcessingMoveRef.current) {
      const currentStrategy = boardState.activePlayer === Player.PLAYER1 
        ? player1Strategy 
        : player2Strategy;
      
      if (currentStrategy !== 'Human') {
        const timerId = setTimeout(() => {
          makeAiMove();
        }, isAiVsAiMode() ? aiMoveSpeed : 0);
        
        return () => clearTimeout(timerId);
      } else {
        // If it's a human player's turn, make sure legal moves are visible
        // This is a safety check to ensure the UI shows valid moves
        if (nextPawnMoves.length === 0) {
          console.log("No legal pawn moves visible for human player, forcing update");
          setTimeout(() => {
            // Use a manual approach instead of the separate function call
            console.log("Manually updating legal moves in useEffect");
            
            // Get current player position
            const currentPos = boardState.activePlayer === Player.PLAYER1 
              ? boardState.player1Pos
              : boardState.player2Pos;
            
            // Generate basic legal moves
            const moves = [
              // Add moves in four directions if not at board edge
              ...(currentPos.row > 0 ? [{row: currentPos.row - 1, col: currentPos.col}] : []),
              ...(currentPos.row < BOARD_SIZE - 1 ? [{row: currentPos.row + 1, col: currentPos.col}] : []),
              ...(currentPos.col > 0 ? [{row: currentPos.row, col: currentPos.col - 1}] : []),
              ...(currentPos.col < BOARD_SIZE - 1 ? [{row: currentPos.row, col: currentPos.col + 1}] : [])
            ];
            
            console.log("Setting fallback legal moves:", moves);
            setNextPawnMoves(moves);
            
            // Set some fallback wall placements too
            const hWalls = [];
            const vWalls = [];
            for (let i = 2; i < 7; i++) {
              hWalls.push({row: 4, col: i});
              vWalls.push({row: i, col: 4});
            }
            setNextWallMoves({h: hWalls, v: vWalls});
          }, 100);
        }
      }
    }
  }, [
    wasmLoaded, boardState, isGameActive, 
    isThinking, makeAiMove, player1Strategy, 
    player2Strategy, winner, nextPawnMoves.length,
    aiMoveSpeed, isAiVsAiMode
  ]);

  // Start a new game
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
          
          console.log("Setting game as active");
          setIsGameActive(true);
          
          // IMPORTANT: Must update immediately before any async operations
          // Force a state update to ensure legal moves
          const player1Pos = boardState.player1Pos;
          const fallbackMoves = [
            {row: Math.max(0, player1Pos.row - 1), col: player1Pos.col}, // Up
            {row: player1Pos.row, col: Math.max(0, player1Pos.col - 1)}, // Left
            {row: player1Pos.row, col: Math.min(BOARD_SIZE - 1, player1Pos.col + 1)}, // Right
            {row: Math.min(BOARD_SIZE - 1, player1Pos.row + 1), col: player1Pos.col}, // Down
          ];
          console.log("Setting initial legal moves directly:", fallbackMoves);
          setNextPawnMoves(fallbackMoves);
          
          // Fix: Multiple stages of initialization with delays
          setTimeout(() => {
            console.log("First update of board state");
            updateBoardStateFromWasm();
            
            // Force multiple updates of legal moves to ensure they're populated
            setTimeout(() => {
              console.log("First explicit legal moves update");
              updateLegalMovesImpl();
              
              // Do a final update after a longer delay
              setTimeout(() => {
                console.log("Final explicit legal moves update");
                updateLegalMovesImpl();
                
                // Verify that legal moves are set
                console.log("Current pawn legal moves:", nextPawnMoves);
                if (nextPawnMoves.length === 0) {
                  console.log("WARNING: Still no legal moves set - forcing direct update");
                  
                  // IMPORTANT: Add a final direct update as a last resort
                  const currentPos = boardState.activePlayer === Player.PLAYER1 
                    ? boardState.player1Pos 
                    : boardState.player2Pos;
                    
                  const forcedMoves = [
                    {row: Math.max(0, currentPos.row - 1), col: currentPos.col}, // Up
                    {row: Math.min(BOARD_SIZE - 1, currentPos.row + 1), col: currentPos.col}, // Down
                    {row: currentPos.row, col: Math.max(0, currentPos.col - 1)}, // Left
                    {row: currentPos.row, col: Math.min(BOARD_SIZE - 1, currentPos.col + 1)}, // Right
                  ];
                  
                  console.log("LAST RESORT: Setting forced legal moves:", forcedMoves);
                  setNextPawnMoves(forcedMoves);
                }
              }, 300);
            }, 200);
          }, 100);
          
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
      }, 200);
    } catch (error) {
      console.error("Error in resetGame:", error);
      setMessage(`Error resetting game: ${error.toString()}`);
    }
  }, [
    wasmGameRef, resetGame, player1Strategy, 
    player2Strategy, selectedOpening, updateBoardStateFromWasm, 
    boardState.player1Pos, boardState.activePlayer, nextPawnMoves.length
  ]);

  // Render move history in a two-column format (player1 left, player2 right)
  const renderMoveHistory = useCallback(() => {
    // Group moves by turn number
    const turns = [];
    let currentTurn = { number: 1, player1Move: null, player2Move: null };
    
    boardState.moveHistory.forEach((move) => {
      if (move.player === Player.PLAYER1) {
        // Start a new turn for player1's move
        if (currentTurn.player1Move !== null) {
          turns.push(currentTurn);
          currentTurn = { number: currentTurn.number + 1, player1Move: null, player2Move: null };
        }
        currentTurn.player1Move = move;
      } else {
        // Player2's move completes the current turn
        currentTurn.player2Move = move;
        turns.push(currentTurn);
        currentTurn = { number: currentTurn.number + 1, player1Move: null, player2Move: null };
      }
    });
    
    // Add the last incomplete turn if exists
    if (currentTurn.player1Move !== null || currentTurn.player2Move !== null) {
      turns.push(currentTurn);
    }
    
    return turns.map((turn) => (
      <div key={`turn-${turn.number}`} className="flex border-b border-gray-200 py-1">
        <div className="w-1/12 text-gray-600 font-semibold">
          {turn.number}.
        </div>
        <div className="w-5/12 text-blue-600">
          {turn.player1Move ? (
            <span>
              {turn.player1Move.move}
              {turn.player1Move.isWinningMove && <span className="font-bold">*</span>}
            </span>
          ) : ''}
        </div>
        <div className="w-5/12 text-red-600">
          {turn.player2Move ? (
            <span>
              {turn.player2Move.move}
              {turn.player2Move.isWinningMove && <span className="font-bold">*</span>}
            </span>
          ) : (turn.player1Move ? '...' : '')}
        </div>
      </div>
    ));
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
    <div className="flex flex-col items-center p-6 min-h-screen bg-gray-100">
      {/* Game header with title and player turn indicator */}
      <div className="w-full max-w-6xl bg-white rounded-t-lg shadow-md p-4 flex justify-between items-center border-b-2 border-gray-200">
        <h1 className="text-3xl font-bold text-gray-800">Quoridor</h1>
        <div className="flex items-center space-x-2">
          <div className={`flex items-center ${boardState.activePlayer === Player.PLAYER1 ? 'text-blue-600' : 'text-red-600'} font-semibold`}>
            <div className={`h-4 w-4 rounded-full ${boardState.activePlayer === Player.PLAYER1 ? 'bg-blue-600' : 'bg-red-600'} mr-2`}></div>
            <span>{boardState.activePlayer === Player.PLAYER1 ? 'Player 1' : 'Player 2'}'s Turn</span>
          </div>
        </div>
      </div>
      
      {!wasmLoaded && (
        <div className="w-full max-w-6xl bg-yellow-100 p-4 rounded-md mb-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-700 mr-3"></div>
          Loading WebAssembly module...
        </div>
      )}
      
      <div className="w-full max-w-6xl flex flex-col md:flex-row bg-white shadow-xl rounded-b-lg">
        {/* Left sidebar - game controls */}
        <div className="w-full md:w-64 p-4 bg-gray-50 rounded-bl-lg border-r border-gray-200">
          <div className="space-y-4">
            {/* Player 1 settings */}
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <label className="text-sm font-medium text-blue-800 block mb-1">Player 1 (Blue)</label>
              <select 
                className="w-full border border-blue-300 rounded px-2 py-1 text-blue-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={player1Strategy}
                onChange={(e) => setPlayer1Strategy(e.target.value)}
                disabled={isGameActive || !wasmLoaded}
              >
                <option value="Human">Human</option>
                {STRATEGIES.filter(s => s !== 'Human').map(strategy => (
                  <option key={strategy} value={strategy}>{strategy}</option>
                ))}
              </select>
              <div className="flex items-center mt-2">
                <div className="h-3 w-3 rounded-full bg-blue-600 mr-2"></div>
                <span className="text-xs text-blue-800">Walls: {boardState.player1Walls}</span>
              </div>
            </div>
            
            {/* Player 2 settings */}
            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <label className="text-sm font-medium text-red-800 block mb-1">Player 2 (Red)</label>
              <select 
                className="w-full border border-red-300 rounded px-2 py-1 text-red-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                value={player2Strategy}
                onChange={(e) => setPlayer2Strategy(e.target.value)}
                disabled={isGameActive || !wasmLoaded}
              >
                <option value="Human">Human</option>
                {STRATEGIES.filter(s => s !== 'Human').map(strategy => (
                  <option key={strategy} value={strategy}>{strategy}</option>
                ))}
              </select>
              <div className="flex items-center mt-2">
                <div className="h-3 w-3 rounded-full bg-red-600 mr-2"></div>
                <span className="text-xs text-red-800">Walls: {boardState.player2Walls}</span>
              </div>
            </div>
            
            {/* Opening selection */}
            <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
              <label className="text-sm font-medium text-gray-700 block mb-1">Opening</label>
              <select 
                className="w-full border border-gray-300 rounded px-2 py-1 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                value={selectedOpening}
                onChange={(e) => setSelectedOpening(e.target.value)}
                disabled={isGameActive || !wasmLoaded}
              >
                {OPENINGS.map(opening => (
                  <option key={opening} value={opening}>{opening}</option>
                ))}
              </select>
            </div>
            
            {/* Game controls */}
            <div className="flex flex-col space-y-2">
              <button 
                className={`px-4 py-2 rounded-lg text-white font-medium shadow-md transition-colors 
                  ${isGameActive ? 
                    'bg-red-600 hover:bg-red-700 active:bg-red-800' : 
                    'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}
                onClick={isGameActive ? resetGame : startGame}
                disabled={!wasmLoaded || isThinking}
              >
                {isGameActive ? 'Reset Game' : 'Start Game'}
              </button>
            </div>
            
            {/* AI Speed Control - only show in AI vs AI mode */}
            {isAiVsAiMode() && (
              <div className="mt-4 bg-purple-50 p-3 rounded-lg border border-purple-200">
                <label className="text-sm font-medium text-purple-800 block mb-1">
                  AI Move Speed (ms)
                </label>
                <input
                  type="range"
                  min="0"
                  max="2000"
                  step="100"
                  className="w-full"
                  value={aiMoveSpeed}
                  onChange={(e) => setAiMoveSpeed(parseInt(e.target.value))}
                  disabled={!wasmLoaded}
                />
                <div className="flex justify-between text-xs text-purple-800 mt-1">
                  <span>Fast</span>
                  <span>{aiMoveSpeed}ms</span>
                  <span>Slow</span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Main content area - game board and status */}
        <div className="flex-1 p-6 flex flex-col items-center">
          {/* Game status and messages */}
          <div className="w-full mb-4 min-h-[40px] flex items-center justify-center">
            {message && (
              <div className={`px-4 py-2 rounded-lg text-center ${
                winner 
                  ? (winner === Player.PLAYER1 
                      ? 'bg-blue-100 text-blue-800 font-bold' 
                      : 'bg-red-100 text-red-800 font-bold')
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {message}
                {winner && <span className="font-bold">*</span>}
              </div>
            )}
            
            {/* Thinking indicator */}
            {isThinking && (
              <div className="bg-blue-100 px-4 py-2 rounded-lg text-blue-800 flex items-center">
                <AlertCircle size={16} className="mr-2 text-blue-600" />
                AI is thinking...
              </div>
            )}
          </div>
          
          {/* Game board - center of attention */}
          <div className="mb-6 transform transition-all duration-300 hover:scale-[1.02]">
            <QuoridorBoard
              boardState={boardState}
              onCellClick={handleCellClick}
              onWallClick={handleWallClick}
              nextPawnMoves={nextPawnMoves}
              nextWallMoves={nextWallMoves}
              player1Strategy={player1Strategy}
              player2Strategy={player2Strategy}
            />
          </div>
        </div>
        
        {/* Right sidebar - move history */}
        <div className="w-full md:w-64 p-4 bg-gray-50 rounded-br-lg border-l border-gray-200">
          <h3 className="font-bold text-gray-800 mb-2 pb-2 border-b border-gray-300">Move History</h3>
          <div className="border border-gray-300 rounded-lg p-2 h-96 overflow-y-auto bg-white">
            {boardState.moveHistory.length > 0 ? (
              <div className="text-sm">
                {/* Column headers */}
                <div className="flex border-b-2 border-gray-300 py-1 font-semibold">
                  <div className="w-1/12">#</div>
                  <div className="w-5/12 text-blue-600">Player 1</div>
                  <div className="w-5/12 text-red-600">Player 2</div>
                </div>
                {renderMoveHistory()}
              </div>
            ) : (
              <div className="text-gray-500 text-center italic text-sm mt-4">
                No moves yet
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Game instructions */}
      <div className="mt-8 w-full max-w-6xl bg-white p-6 rounded-lg shadow-lg">
        <h3 className="font-bold text-xl text-gray-800 mb-4 pb-2 border-b border-gray-200">How to Play Quoridor</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-gray-800 mb-3">
              <span className="font-semibold text-blue-700">Objective:</span> Move your pawn to the opposite side of the board before your opponent.
            </p>
            <p className="text-gray-800 mb-3">
              <span className="font-semibold text-blue-700">Pawn Movement:</span> On your turn, move your pawn one square horizontally or vertically.
            </p>
            <p className="text-gray-800">
              <span className="font-semibold text-blue-700">Jump Rule:</span> If your opponent's pawn is adjacent to yours, you can jump over it (if there's no wall in between).
            </p>
          </div>
          <div>
            <p className="text-gray-800 mb-3">
              <span className="font-semibold text-red-700">Wall Placement:</span> Instead of moving your pawn, place a wall to block your opponent's path. Each player has 10 walls.
            </p>
            <p className="text-gray-800 mb-3">
              <span className="font-semibold text-red-700">Wall Rules:</span> Walls cannot completely block a player's path to the goal. Walls can be placed horizontally or vertically between cells.
            </p>
            <p className="text-gray-800">
              <span className="font-semibold text-red-700">Strategy Tip:</span> Balance between advancing your pawn and using walls to slow your opponent.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoridorGameComponent;
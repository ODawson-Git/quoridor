// This declares the main module to be available to lib.rs
#[path = "main.rs"]
mod main;

// Import wasm-bindgen
use wasm_bindgen::prelude::*;

// Import the getrandom crate with js feature for WebAssembly
extern crate getrandom;

// Set up console logging
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Log helper
#[wasm_bindgen]
pub fn wasm_log(s: &str) {
    log(s);
}

// WebAssembly-friendly wrapper for the Quoridor game
#[wasm_bindgen]
pub struct QuoridorGame {
    // We'll store the actual game instance here
    game_instance: main::Quoridor,
    // And strategy instances
    player1_strategy: Option<Box<dyn main::Strategy>>,
    player2_strategy: Option<Box<dyn main::Strategy>>,
}

#[wasm_bindgen]
impl QuoridorGame {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize, walls: usize) -> Self {
        console_error_panic_hook::set_once();
        let game = main::Quoridor::new(size, walls, None);
        Self {
            game_instance: game,
            player1_strategy: None,
            player2_strategy: None,
        }
    }

    // Method to set a strategy for a player
    pub fn set_strategy(&mut self, player_number: usize, strategy_name: &str, opening_name: &str) -> bool {
        let player = if player_number == 1 {
            main::Player::Player1
        } else {
            main::Player::Player2
        };

        // Get opening moves
        let opening_moves = main::get_opening_moves(opening_name, player);
        
        // Create the appropriate strategy
        let strategy: Box<dyn main::Strategy> = match strategy_name {
            "Random" => Box::new(main::RandomStrategy::new(opening_name, opening_moves)),
            "ShortestPath" => Box::new(main::ShortestPathStrategy::new(opening_name, opening_moves)),
            "Defensive" => Box::new(main::DefensiveStrategy::new(opening_name, opening_moves, 0.7)),
            "Balanced" => Box::new(main::BalancedStrategy::new(opening_name, opening_moves, 0.5)),
            "Adaptive" => Box::new(main::AdaptiveStrategy::new(opening_name, opening_moves)),
            "Minimax1" => Box::new(main::MinimaxStrategy::new(opening_name, opening_moves, 1)),
            "Minimax2" => Box::new(main::MinimaxStrategy::new(opening_name, opening_moves, 2)),
            "Mirror" => Box::new(main::MirrorStrategy::new(opening_name, opening_moves)),
            _ => return false,
        };
        
        // Store the strategy
        if player_number == 1 {
            self.player1_strategy = Some(strategy);
        } else {
            self.player2_strategy = Some(strategy);
        }
        
        true
    }

    // Get AI move for current player
    pub fn get_ai_move(&mut self) -> String {
        let active_player = self.game_instance.active_player;
        
        let strategy = if active_player == main::Player::Player1 {
            &mut self.player1_strategy
        } else {
            &mut self.player2_strategy
        };
        
        if let Some(strategy) = strategy {
            if let Some(move_str) = strategy.choose_move(&self.game_instance) {
                return move_str;
            }
        }
        
        "".to_string()
    }
    
    // Make a move (pawn or wall)
    pub fn make_move(&mut self, move_str: &str) -> bool {
        if move_str.len() >= 3 && (move_str.ends_with('h') || move_str.ends_with('v')) {
            self.game_instance.add_wall(move_str, false, true)
        } else {
            self.game_instance.move_pawn(move_str, true)
        }
    }
    
    // Get legal pawn moves
    pub fn get_legal_moves(&self) -> Vec<String> {
        self.game_instance.get_legal_moves(self.game_instance.active_player)
    }
    
    // Get legal wall placements
    pub fn get_legal_walls(&self) -> Vec<String> {
        self.game_instance.get_legal_walls(self.game_instance.active_player)
    }
    
    // Get current game state as JSON
    pub fn get_game_state(&self) -> String {
        let p1 = self.game_instance.pawn_positions.get(&main::Player::Player1).unwrap();
        let p2 = self.game_instance.pawn_positions.get(&main::Player::Player2).unwrap();
        
        let h_walls: Vec<String> = self.game_instance.hwall_positions.iter()
            .map(|&pos| self.game_instance.coord_to_algebraic(pos))
            .collect();
        
        let v_walls: Vec<String> = self.game_instance.vwall_positions.iter()
            .map(|&pos| self.game_instance.coord_to_algebraic(pos))
            .collect();
        
        format!(
            r#"{{
                "player1": {{ "row": {}, "col": {} }},
                "player2": {{ "row": {}, "col": {} }},
                "player1Walls": {},
                "player2Walls": {},
                "hWalls": {:?},
                "vWalls": {:?},
                "activePlayer": {}
            }}"#,
            p1.0, p1.1,
            p2.0, p2.1,
            self.game_instance.walls_available[&main::Player::Player1],
            self.game_instance.walls_available[&main::Player::Player2],
            h_walls, v_walls,
            if self.game_instance.active_player == main::Player::Player1 { 1 } else { 2 }
        )
    }
    
    // Check if a move is a winning move
    pub fn check_win(&self, move_str: &str) -> bool {
        self.game_instance.win_check(move_str)
    }
    
    // Get active player (1 or 2)
    pub fn get_active_player(&self) -> usize {
        if self.game_instance.active_player == main::Player::Player1 { 1 } else { 2 }
    }
    
    // Reset the game
    pub fn reset_game(&mut self) {
        self.game_instance = main::Quoridor::new(
            self.game_instance.size,
            self.game_instance.walls,
            None
        );
    }
}
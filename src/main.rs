    use std::collections::{HashMap, HashSet, VecDeque};
    use std::fs::File;
    use std::io::Write;
    use std::path::Path;
    use rand::prelude::*;
    use csv::Writer;
    use petgraph::graph::{Graph, NodeIndex, UnGraph};
    use petgraph::algo::{dijkstra, has_path_connecting};
    use std::cmp::{min, max};
    use std::env;
    use std::thread;
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    // Define coordinate type for clarity
    type Coord = (usize, usize);

    // Enum for player identification
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub enum Player {
        Player1,
        Player2,
    }

    impl Player {
        pub fn opponent(&self) -> Self {
            match self {
                Player::Player1 => Player::Player2,
                Player::Player2 => Player::Player1,
            }
        }

        pub fn name(&self) -> &'static str {
            match self {
                Player::Player1 => "player1",
                Player::Player2 => "player2",
            }
        }
    }

    // Game state representation
    #[derive(Clone)]
    pub struct Quoridor {
        pub size: usize,
        pub walls: usize,
        pub graph: UnGraph<Coord, ()>,
        pub node_indices: HashMap<Coord, NodeIndex>,
        pub hwall_positions: Vec<Coord>,
        pub vwall_positions: Vec<Coord>,
        pub pawn_positions: HashMap<Player, Coord>,
        pub walls_available: HashMap<Player, usize>,
        pub active_player: Player,
        pub goal_positions: HashMap<Player, Vec<Coord>>,
        pub state_string: String,
        pub previous_state: String,
        pub last_move: String,
    }

    impl Quoridor {
        pub fn new(size: usize, walls: usize, state_string: Option<&str>) -> Self {
            let mut game = Quoridor {
                size,
                walls,
                graph: UnGraph::new_undirected(),
                node_indices: HashMap::new(),
                hwall_positions: Vec::new(),
                vwall_positions: Vec::new(),
                pawn_positions: HashMap::new(),
                walls_available: HashMap::new(),
                active_player: Player::Player1,
                goal_positions: HashMap::new(),
                state_string: String::new(),
                previous_state: String::new(),
                last_move: "Blank".to_string(),
            };
            
            // Initialize the graph
            game.initialize_graph();
            
            // Set up goal positions
            game.goal_positions.insert(
                Player::Player1, 
                (0..size).map(|i| (0, i)).collect()
            );
            game.goal_positions.insert(
                Player::Player2, 
                (0..size).map(|i| (size-1, i)).collect()
            );
            
            // Parse state string or use default setup
            match state_string {
                Some(state_str) => game.parse_state_string(state_str),
                None => {
                    // Default setup
                    let player1_start = (size - 1, (size - 1) / 2);
                    let player2_start = (0, size / 2);
                    game.pawn_positions.insert(Player::Player1, player1_start);
                    game.pawn_positions.insert(Player::Player2, player2_start);
                    game.walls_available.insert(Player::Player1, walls);
                    game.walls_available.insert(Player::Player2, walls);
                    game.active_player = Player::Player1;
                    game.update_state_string(true);
                }
            }
            
            game
        }
        
        pub fn initialize_graph(&mut self) {
            // Create nodes for the grid
            for row in 0..self.size {
                for col in 0..self.size {
                    let coord = (row, col);
                    let node_idx = self.graph.add_node(coord);
                    self.node_indices.insert(coord, node_idx);
                }
            }
            
            // Add edges between adjacent nodes
            for row in 0..self.size {
                for col in 0..self.size {
                    let current = (row, col);
                    let current_idx = self.node_indices[&current];
                    
                    // Add horizontal edges
                    if col + 1 < self.size {
                        let right = (row, col + 1);
                        let right_idx = self.node_indices[&right];
                        self.graph.add_edge(current_idx, right_idx, ());
                    }
                    
                    // Add vertical edges
                    if row + 1 < self.size {
                        let down = (row + 1, col);
                        let down_idx = self.node_indices[&down];
                        self.graph.add_edge(current_idx, down_idx, ());
                    }
                }
            }
        }

        pub fn parse_state_string(&mut self, state_string: &str) {
            let parts: Vec<&str> = state_string.split('/').collect();
            if parts.len() != 5 {
                panic!("Invalid state string format");
            }
            
            // Parse pawn positions
            let pawn_parts: Vec<&str> = parts[2].trim().split_whitespace().collect();
            if pawn_parts.len() == 2 {
                self.pawn_positions.insert(Player::Player1, self.algebraic_to_coord(pawn_parts[0]));
                self.pawn_positions.insert(Player::Player2, self.algebraic_to_coord(pawn_parts[1]));
            }
            
            // Parse walls available
            let wall_parts: Vec<&str> = parts[3].trim().split_whitespace().collect();
            if wall_parts.len() == 2 {
                self.walls_available.insert(Player::Player1, wall_parts[0].parse().unwrap_or(self.walls));
                self.walls_available.insert(Player::Player2, wall_parts[1].parse().unwrap_or(self.walls));
            }
            
            // Parse active player
            let player_part = parts[4].trim();
            self.active_player = if player_part == "1" { Player::Player1 } else { Player::Player2 };
            
            // Parse horizontal walls
            let hwall_str = parts[0].trim();
            if !hwall_str.is_empty() {
                for i in (0..hwall_str.len()).step_by(2) {
                    if i + 2 <= hwall_str.len() {
                        let wall = &hwall_str[i..i+2];
                        let wall_move = format!("{}h", wall);
                        self.add_wall(&wall_move, true, false);
                    }
                }
            }
            
            // Parse vertical walls
            let vwall_str = parts[1].trim();
            if !vwall_str.is_empty() {
                for i in (0..vwall_str.len()).step_by(2) {
                    if i + 2 <= vwall_str.len() {
                        let wall = &vwall_str[i..i+2];
                        let wall_move = format!("{}v", wall);
                        self.add_wall(&wall_move, true, false);
                    }
                }
            }
            
            self.update_state_string(true);
        }
        
        pub fn update_state_string(&mut self, keep_player: bool) {
            if !keep_player {
                self.active_player = self.active_player.opponent();
            }
            
            let player_char = match self.active_player {
                Player::Player1 => "1",
                Player::Player2 => "2",
            };
            
            let hwall_str: String = self.hwall_positions.iter()
                .map(|&pos| self.coord_to_algebraic(pos)[0..2].to_string())
                .collect();
                
            let vwall_str: String = self.vwall_positions.iter()
                .map(|&pos| self.coord_to_algebraic(pos)[0..2].to_string())
                .collect();
                
            let p1_pos = self.coord_to_algebraic(self.pawn_positions[&Player::Player1]);
            let p2_pos = self.coord_to_algebraic(self.pawn_positions[&Player::Player2]);
            
            let p1_walls = self.walls_available[&Player::Player1];
            let p2_walls = self.walls_available[&Player::Player2];
            
            self.state_string = format!(
                "{} / {} / {} {} / {} {} / {}",
                hwall_str, vwall_str, p1_pos, p2_pos, p1_walls, p2_walls, player_char
            );
        }
        
        pub fn algebraic_to_coord(&self, square: &str) -> Coord {
            // Safety check for wall notation
            if square.len() > 2 && (square.ends_with('h') || square.ends_with('v')) {
                // println!("Warning: Full wall notation passed to algebraic_to_coord: {}", square);
                // Extract just the position part
                let position = &square[0..2];
                return self.algebraic_to_coord(position);
            }
            
            if square.len() < 2 {
                panic!("Invalid algebraic notation: {}", square);
            }
            
            let bytes = square.as_bytes();
            let col_letter = bytes[0] as char;
            
            // Check that first character is a valid column letter
            if !col_letter.is_ascii_alphabetic() {
                panic!("Invalid column letter in algebraic notation: {}", square);
            }
            
            // Parse row number, ensuring it's all digits
            let row_digits = &square[1..];
            let row_num = match row_digits.parse::<usize>() {
                Ok(num) => num,
                Err(e) => {
                    panic!("Invalid row number in algebraic notation '{}': {}", square, e);
                }
            };
            
            let col = (col_letter.to_ascii_lowercase() as u8 - b'a') as usize;
            let row = self.size - row_num;
            
            // Check bounds
            if row >= self.size || col >= self.size {
                panic!("Algebraic notation out of bounds: {}", square);
            }
            
            (row, col)
        }
        
        pub fn coord_to_algebraic(&self, coord: Coord) -> String {
            let (row, col) = coord;
            let col_letter = (b'a' + col as u8) as char;
            let row_number = self.size - row;
            
            format!("{}{}", col_letter, row_number)
        }
        
        pub fn has_path(&self, player: Player, destination: Coord) -> bool {
            if !self.pawn_positions.contains_key(&player) || !self.node_indices.contains_key(&destination) {
                return false;
            }
            
            let start_idx = self.node_indices[&self.pawn_positions[&player]];
            let end_idx = self.node_indices[&destination];
            
            has_path_connecting(&self.graph, start_idx, end_idx, None)
        }
        
        pub fn get_wall_edges(&self, wall_move: &str) -> Vec<(Coord, Coord)> {
            if wall_move.len() < 3 {
                println!("Invalid wall move format: {}", wall_move);
                return Vec::new();
            }
            
            // Extract position part (first 2 characters)
            let position = &wall_move[0..2];
            let orientation = &wall_move[2..];
            
            // Validate orientation
            if orientation != "h" && orientation != "v" {
                println!("Invalid wall orientation: {}", orientation);
                return Vec::new();
            }
            
            // Parse position without orientation
            let coord = match self.algebraic_to_coord(position) {
                c => c,
                #[allow(unreachable_patterns)]
                _ => {
                    println!("Failed to parse position: {}", position);
                    return Vec::new();
                }
            };
            
            let mut edges = Vec::new();
            
            if orientation == "h" {
                if coord.0 > 0 {
                    edges.push((coord, (coord.0 - 1, coord.1)));
                    if coord.1 + 1 < self.size {
                        edges.push(((coord.0, coord.1 + 1), (coord.0 - 1, coord.1 + 1)));
                    }
                }
            } else if orientation == "v" {
                if coord.1 + 1 < self.size {
                    edges.push((coord, (coord.0, coord.1 + 1)));
                    if coord.0 > 0 {
                        edges.push(((coord.0 - 1, coord.1), (coord.0 - 1, coord.1 + 1)));
                    }
                }
            }
            
            edges
        }
        
        pub fn add_wall(&mut self, wall_move: &str, initialise: bool, check: bool) -> bool {
            if wall_move.len() < 3 {
                println!("Invalid wall move: {}", wall_move);
                return false;
            }
            
            let position = &wall_move[0..2];
            let orientation = &wall_move[2..];
            
            if orientation != "h" && orientation != "v" {
                println!("Invalid wall orientation: {}", orientation);
                return false;
            }
            
            // Only parse the position part (first 2 characters)
            let coord = match self.algebraic_to_coord(position) {
                c => c,
                #[allow(unreachable_patterns)]
                _ => return false,
            };
            
            let edges = self.get_wall_edges(wall_move);
            if edges.is_empty() {
                return false;
            }
            
            if check && !self.wall_check(self.active_player, wall_move) {
                return false;
            }
            
            // Add wall to appropriate list
            if orientation == "h" {
                self.hwall_positions.push(coord);
            } else if orientation == "v" {
                self.vwall_positions.push(coord);
            }
            
            // Remove edges from graph
            for (from, to) in edges {
                if self.node_indices.contains_key(&from) && self.node_indices.contains_key(&to) {
                    let from_idx = self.node_indices[&from];
                    let to_idx = self.node_indices[&to];
                    
                    // Find and remove the edge
                    if let Some(edge_idx) = self.graph.find_edge(from_idx, to_idx) {
                        self.graph.remove_edge(edge_idx);
                    }
                }
            }
            
            if !initialise {
                self.previous_state = self.state_string.clone();
                *self.walls_available.get_mut(&self.active_player).unwrap() -= 1;
                self.last_move = wall_move.to_string();
                self.update_state_string(false);
            } else {
                self.update_state_string(true);
            }
            
            true
        }
        
        pub fn wall_check(&self, player: Player, wall_move: &str) -> bool {
            let edges = self.get_wall_edges(wall_move);
            
            // Check if player has walls available
            if self.walls_available[&player] == 0 {
                return false;
            }
            
            // Check if position already has a wall of different orientation
            let position = &wall_move[0..2];
            let orientation = &wall_move[2..];
            
            let wall_coord = match self.algebraic_to_coord(position) {
                c => c,
                #[allow(unreachable_patterns)]
                _ => return false,
            };
            
            if orientation == "v" {
                // Check if horizontal wall exists at same position
                if self.hwall_positions.contains(&wall_coord) {
                    return false;
                }
            } else if orientation == "h" {
                // Check if vertical wall exists at same position
                if self.vwall_positions.contains(&wall_coord) {
                    return false;
                }
            }
            
            // Check if edges exist
            for (from, to) in &edges {
                if !self.node_indices.contains_key(from) || !self.node_indices.contains_key(to) {
                    return false;
                }
                
                let from_idx = self.node_indices[from];
                let to_idx = self.node_indices[to];
                
                if self.graph.find_edge(from_idx, to_idx).is_none() {
                    return false;
                }
            }
            
            // Create a temporary copy of the graph to check path blocking
            let mut temp_graph = self.graph.clone();
            
            // Remove edges temporarily
            for (from, to) in &edges {
                let from_idx = self.node_indices[from];
                let to_idx = self.node_indices[to];
                
                if let Some(edge_idx) = temp_graph.find_edge(from_idx, to_idx) {
                    temp_graph.remove_edge(edge_idx);
                }
            }
            
            // Check if placing the wall blocks paths to goals
            for (goal_player, goal_positions) in &self.goal_positions {
                let player_pos = self.pawn_positions[goal_player];
                let player_node = self.node_indices[&player_pos];
                
                let mut has_path_to_any_goal = false;
                
                for &goal in goal_positions {
                    if !self.node_indices.contains_key(&goal) {
                        continue;
                    }
                    
                    let goal_node = self.node_indices[&goal];
                    
                    if has_path_connecting(&temp_graph, player_node, goal_node, None) {
                        has_path_to_any_goal = true;
                        break;
                    }
                }
                
                if !has_path_to_any_goal {
                    return false;
                }
            }
            
            true
        }
        
        pub fn move_pawn(&mut self, move_str: &str, check: bool) -> bool {
            let destination = match self.algebraic_to_coord(move_str) {
                c => c,
                #[allow(unreachable_patterns)]
                _ => return false,
            };
            
            if check {
                let legal_moves = self.get_legal_moves(self.active_player);
                if !legal_moves.contains(&move_str.to_string()) {
                    return false;
                }
            }
            
            self.pawn_positions.insert(self.active_player, destination);
            self.previous_state = self.state_string.clone();
            self.last_move = move_str.to_string();
            self.update_state_string(false);
            
            true
        }
        
        pub fn get_legal_moves(&self, player: Player) -> Vec<String> {
            let opponent = player.opponent();
            let own_pos = self.pawn_positions[&player];
            let opponent_pos = self.pawn_positions[&opponent];
            
            let own_node = self.node_indices[&own_pos];
            let mut legal_moves = Vec::new();
            
            // Get neighbors from the graph
            for neighbor_idx in self.graph.neighbors(own_node) {
                let neighbor_pos = self.graph[neighbor_idx];
                
                // Skip if it's the opponent's position
                if neighbor_pos == opponent_pos {
                    // Try to jump over
                    let jump_row = 2 * opponent_pos.0 as i32 - own_pos.0 as i32;
                    let jump_col = 2 * opponent_pos.1 as i32 - own_pos.1 as i32;
                    
                    // Check bounds
                    if jump_row >= 0 && jump_row < self.size as i32 &&
                    jump_col >= 0 && jump_col < self.size as i32 {
                        let jump_pos = (jump_row as usize, jump_col as usize);
                        
                        // If there's a path from opponent to jump position
                        if self.node_indices.contains_key(&jump_pos) {
                            let opponent_node = self.node_indices[&opponent_pos];
                            let jump_node = self.node_indices[&jump_pos];
                            
                            if self.graph.contains_edge(opponent_node, jump_node) {
                                legal_moves.push(self.coord_to_algebraic(jump_pos));
                            } else {
                                // If can't jump, can move to opponent's neighbors
                                for op_neighbor_idx in self.graph.neighbors(opponent_node) {
                                    let op_neighbor_pos = self.graph[op_neighbor_idx];
                                    if op_neighbor_pos != own_pos {
                                        legal_moves.push(self.coord_to_algebraic(op_neighbor_pos));
                                    }
                                }
                            }
                        }
                    }
                    
                    continue;
                }
                
                legal_moves.push(self.coord_to_algebraic(neighbor_pos));
            }
            
            legal_moves
        }
        
        pub fn get_legal_walls(&self, player: Player) -> Vec<String> {
            let mut legal_walls = Vec::new();
            
            // Iterate through all possible wall positions
            for row in 1..self.size {
                for col in 0..(self.size - 1) {
                    for orientation in &["h", "v"] {
                        let wall_move = format!("{}{}", self.coord_to_algebraic((row, col)), orientation);
                        if self.wall_check(player, &wall_move) {
                            legal_walls.push(wall_move);
                        }
                    }
                }
            }
            
            legal_walls
        }
        
        pub fn distance_to_goal(&self, player: Player) -> usize {
            let start_pos = self.pawn_positions[&player];
            let start_idx = self.node_indices[&start_pos];
            let goal_positions = &self.goal_positions[&player];
            
            let mut min_distance = usize::MAX;
            
            // Calculate shortest paths to all nodes
            let distances = dijkstra(&self.graph, start_idx, None, |_| 1);
            
            // Find minimum distance to any goal
            for &goal in goal_positions {
                if let Some(&goal_idx) = self.node_indices.get(&goal) {
                    if let Some(&distance) = distances.get(&goal_idx) {
                        min_distance = min_distance.min(distance);
                    }
                }
            }
            
            if min_distance == usize::MAX { 100 } else { min_distance }
        }
        
        pub fn win_check(&self, move_str: &str) -> bool {
            match self.algebraic_to_coord(move_str) {
                (row, _) => match self.active_player {
                    Player::Player1 => row == 0,
                    Player::Player2 => row == self.size - 1,
                },
                #[allow(unreachable_patterns)]
                _ => false,
            }
        }
        
        pub fn moves_to_next_row(&self, player: Player) -> usize {
            let curr_pos = self.pawn_positions[&player];
            let curr_idx = self.node_indices[&curr_pos];
            
            // Determine target row based on player direction
            let next_row = match player {
                Player::Player1 => {
                    if curr_pos.0 > 0 { curr_pos.0 - 1 } else { return 100 }
                },
                Player::Player2 => {
                    if curr_pos.0 < self.size - 1 { curr_pos.0 + 1 } else { return 100 }
                },
            };
            
            let mut min_dist = usize::MAX;
            
            // Calculate distances to all nodes
            let distances = dijkstra(&self.graph, curr_idx, None, |_| 1);
            
            // Find minimum distance to any node in the next row
            for col in 0..self.size {
                let target = (next_row, col);
                if let Some(&target_idx) = self.node_indices.get(&target) {
                    if let Some(&distance) = distances.get(&target_idx) {
                        min_dist = min_dist.min(distance);
                    }
                }
            }
            
            if min_dist == usize::MAX { 100 } else { min_dist }
        }
    }

    // Strategy trait
    pub trait Strategy {
        fn name(&self) -> String;
        fn choose_move(&mut self, game: &Quoridor) -> Option<String>;
    }

    // Base implementation for all strategies
    pub struct QuoridorStrategy {
        name: String,
        opening_moves: Vec<String>,
        move_counter: usize,
    }

    impl QuoridorStrategy {
        pub fn new(name: &str, opening_name: &str, opening_moves: Vec<String>) -> Self {
            let full_name = if opening_moves.is_empty() {
                name.to_string()
            } else {
                format!("{}-{}", name, opening_name)
            };
            
            QuoridorStrategy {
                name: full_name,
                opening_moves,
                move_counter: 0,
            }
        }
        
        pub fn try_opening_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try to use opening move if available
            if self.move_counter < self.opening_moves.len() {
                let move_str = self.opening_moves[self.move_counter].clone();
                // println!("Trying opening move: {} (player: {})", move_str, game.active_player.name());
                
                self.move_counter += 1;
                
                // Check if the opening move is a wall move
                let is_wall_move = move_str.len() == 3 && 
                                (move_str.ends_with('h') || move_str.ends_with('v'));
                
                // Get legal moves
                let legal_pawn_moves = game.get_legal_moves(game.active_player);
                let legal_wall_moves = if game.walls_available[&game.active_player] > 0 {
                    game.get_legal_walls(game.active_player)
                } else {
                    Vec::new()
                };
                
                let all_legal_moves: Vec<String> = legal_pawn_moves.iter().cloned()
                    .chain(legal_wall_moves.iter().cloned())
                    .collect();
                
                if all_legal_moves.contains(&move_str) {
                    // println!("Opening move {} is legal", move_str);
                    return Some(move_str);
                } else {
                    println!("Opening move {} is NOT legal", move_str);
                    // println!("Legal moves are: {:?}", all_legal_moves);
                }
            }
            
            None
        }
    }

    // Random strategy
    pub struct RandomStrategy {
        base: QuoridorStrategy,
    }

    impl RandomStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>) -> Self {
            RandomStrategy {
                base: QuoridorStrategy::new("Random", opening_name, opening_moves),
            }
        }
    }

    impl Strategy for RandomStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            // Otherwise choose randomly
            let legal_pawn_moves = game.get_legal_moves(game.active_player);
            let legal_wall_moves = if game.walls_available[&game.active_player] > 0 {
                game.get_legal_walls(game.active_player)
            } else {
                Vec::new()
            };
            
            let all_legal_moves: Vec<String> = legal_pawn_moves.into_iter()
                .chain(legal_wall_moves.into_iter())
                .collect();
            
            if all_legal_moves.is_empty() {
                None
            } else {
                let mut rng = rand::thread_rng();
                Some(all_legal_moves[rng.gen_range(0..all_legal_moves.len())].clone())
            }
        }
    }

    // ShortestPath strategy
    pub struct ShortestPathStrategy {
        base: QuoridorStrategy,
    }

    impl ShortestPathStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>) -> Self {
            ShortestPathStrategy {
                base: QuoridorStrategy::new("ShortestPath", opening_name, opening_moves),
            }
        }
    }

    impl Strategy for ShortestPathStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            // Get legal pawn moves
            let legal_pawn_moves = game.get_legal_moves(game.active_player);
            if legal_pawn_moves.is_empty() {
                return None;
            }
            
            let player = game.active_player;
            let mut best_move = None;
            let mut best_distance = usize::MAX;
            
            for move_str in &legal_pawn_moves {
                // Check for win
                if game.win_check(move_str) {
                    return Some(move_str.clone());
                }
                
                // Create a copy of the game to simulate the move
                let mut temp_game = game.clone();
                temp_game.move_pawn(move_str, false);
                
                let distance = temp_game.distance_to_goal(player);
                if distance < best_distance {
                    best_distance = distance;
                    best_move = Some(move_str.clone());
                }
            }
            
            best_move
        }
    }

    // Defensive strategy
    pub struct DefensiveStrategy {
        base: QuoridorStrategy,
        wall_preference: f64,
        offensive_strategy: ShortestPathStrategy,
    }

    impl DefensiveStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>, wall_preference: f64) -> Self {
            DefensiveStrategy {
                base: QuoridorStrategy::new("Defensive", opening_name, opening_moves),
                wall_preference,
                offensive_strategy: ShortestPathStrategy::new("", Vec::new()),
            }
        }
    }

    impl Strategy for DefensiveStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            let player = game.active_player;
            let opponent = player.opponent();
            
            let legal_wall_moves = if game.walls_available[&player] > 0 {
                game.get_legal_walls(player)
            } else {
                Vec::new()
            };
            
            // If we have walls and random chance is below our preference, try to place a wall
            if !legal_wall_moves.is_empty() && rand::random::<f64>() < self.wall_preference {
                // Find opponent's current shortest distance to goal
                let opponent_distance = game.distance_to_goal(opponent);
                
                // Find walls that would increase opponent's distance
                let mut blocking_walls = Vec::new();
                
                for wall_move in &legal_wall_moves {
                    let mut temp_game = game.clone();
                    temp_game.add_wall(wall_move, false, false);
                    
                    let new_distance = temp_game.distance_to_goal(opponent);
                    
                    if new_distance > opponent_distance {
                        blocking_walls.push(wall_move.clone());
                    }
                }
                
                if !blocking_walls.is_empty() {
                    let mut rng = rand::thread_rng();
                    return Some(blocking_walls[rng.gen_range(0..blocking_walls.len())].clone());
                }
            }
            
            // If no wall placed or prefer to move pawn
            self.offensive_strategy.choose_move(game)
        }
    }

    // Balanced Strategy
    pub struct BalancedStrategy {
        base: QuoridorStrategy,
        defense_weight: f64,
        defensive_strategy: DefensiveStrategy,
        offensive_strategy: ShortestPathStrategy,
    }

    impl BalancedStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>, defense_weight: f64) -> Self {
            BalancedStrategy {
                base: QuoridorStrategy::new("Balanced", opening_name, opening_moves),
                defense_weight,
                defensive_strategy: DefensiveStrategy::new("", Vec::new(), 1.0),
                offensive_strategy: ShortestPathStrategy::new("", Vec::new()),
            }
        }
    }

    impl Strategy for BalancedStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            let player = game.active_player;
            
            // Randomly choose between offensive and defensive play
            if rand::random::<f64>() < self.defense_weight && game.walls_available[&player] > 0 {
                self.defensive_strategy.choose_move(game)
            } else {
                self.offensive_strategy.choose_move(game)
            }
        }
    }

    // Adaptive Strategy
    pub struct AdaptiveStrategy {
        base: QuoridorStrategy,
        defensive_strategy: DefensiveStrategy,
        offensive_strategy: ShortestPathStrategy,
    }

    impl AdaptiveStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>) -> Self {
            AdaptiveStrategy {
                base: QuoridorStrategy::new("Adaptive", opening_name, opening_moves),
                defensive_strategy: DefensiveStrategy::new("", Vec::new(), 0.7),
                offensive_strategy: ShortestPathStrategy::new("", Vec::new()),
            }
        }
    }

    impl Strategy for AdaptiveStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            let player = game.active_player;
            let opponent = player.opponent();
            
            // Calculate distances to goal for both players
            let player_distance = game.distance_to_goal(player);
            let opponent_distance = game.distance_to_goal(opponent);
            
            // If we're closer to winning, play offensively
            if player_distance < opponent_distance {
                self.offensive_strategy.choose_move(game)
            } else {
                // Otherwise play defensively
                self.defensive_strategy.choose_move(game)
            }
        }
    }

    // Minimax Strategy
    pub struct MinimaxStrategy {
        base: QuoridorStrategy,
        depth: usize,
        w_position_diff: f64,
        w_attacking: f64,
        w_defensive: f64,
        w_wall_control: f64,
        w_mobility: f64,
    }

    impl MinimaxStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>, depth: usize) -> Self {
            let name = format!("Minimax{}", depth);
            
            MinimaxStrategy {
                base: QuoridorStrategy::new(&name, opening_name, opening_moves),
                depth: depth,
                w_position_diff: 0.8, // Increased importance of position
                w_attacking: 12.0,
                w_defensive: 8.0,
                w_wall_control: 5.0,  // New feature for wall control
                w_mobility: 3.0,      // New feature for mobility
            }
        }
        
        pub fn evaluate(&self, game: &Quoridor) -> f64 {
            let player = game.active_player;
            let opponent = player.opponent();
            
            // Distance-based features
            let player_distance = game.distance_to_goal(player) as f64;
            let opponent_distance = game.distance_to_goal(opponent) as f64;
            
            // Position difference feature: higher is better
            let f_position = opponent_distance - player_distance;
            
            // Attacking feature: inverse of moves to next row
            let moves_next_player = game.moves_to_next_row(player);
            let f_attacking = if moves_next_player == 0 {
                20.0 // Very high value for immediate progress
            } else {
                1.0 / (moves_next_player as f64)
            };
            
            // Defensive feature: number of moves opponent needs
            let moves_next_opponent = game.moves_to_next_row(opponent);
            let f_defensive = moves_next_opponent as f64;
            
            // Wall control feature: advantage in available walls
            let player_walls = game.walls_available[&player] as f64;
            let opponent_walls = game.walls_available[&opponent] as f64;
            let f_wall_control = (player_walls - opponent_walls) / 
                                (player_walls + opponent_walls + 0.1); // Avoid div by zero
            
            // Mobility feature: ratio of player options vs opponent options
            let player_moves = game.get_legal_moves(player).len() as f64;
            let opponent_moves = game.get_legal_moves(opponent).len() as f64;
            let f_mobility = (player_moves - opponent_moves) / 
                            (player_moves + opponent_moves + 0.1); // Avoid div by zero
            
            // Combined evaluation
            self.w_position_diff * f_position + 
            self.w_attacking * f_attacking + 
            self.w_defensive * f_defensive + 
            self.w_wall_control * f_wall_control +
            self.w_mobility * f_mobility
        }
        
        pub fn minimax(&self, game: &Quoridor, depth: usize, mut alpha: f64, mut beta: f64, maximizing: bool) -> f64 {
            // Check for game termination conditions
            if depth == 0 || game.win_check(&game.last_move) {
                return self.evaluate(game);
            }
            
            let player = game.active_player;
            let legal_pawn_moves = game.get_legal_moves(player);
            let legal_wall_moves = if game.walls_available[&player] > 0 {
                game.get_legal_walls(player)
            } else {
                Vec::new()
            };
            
            // First check pawn moves since they're typically better
            let all_moves: Vec<String> = legal_pawn_moves.iter().cloned()
                .chain(legal_wall_moves.iter().cloned())
                .collect();
            
            if all_moves.is_empty() {
                return self.evaluate(game);
            }
            
            if maximizing {
                let mut max_eval = f64::NEG_INFINITY;
                
                for move_str in &all_moves {
                    let mut temp_game = game.clone();
                    
                    // Apply move
                    if move_str.len() == 3 && (move_str.ends_with('h') || move_str.ends_with('v')) {
                        temp_game.add_wall(move_str, false, false);
                    } else {
                        temp_game.move_pawn(move_str, false);
                    }
                    
                    let eval = self.minimax(&temp_game, depth - 1, alpha, beta, false);
                    max_eval = max_eval.max(eval);
                    
                    // Update alpha for pruning
                    alpha = alpha.max(eval);
                    if beta <= alpha {
                        break; // Beta cutoff
                    }
                }
                max_eval
            } else {
                let mut min_eval = f64::INFINITY;
                
                for move_str in &all_moves {
                    let mut temp_game = game.clone();
                    
                    // Apply move
                    if move_str.len() == 3 && (move_str.ends_with('h') || move_str.ends_with('v')) {
                        temp_game.add_wall(move_str, false, false);
                    } else {
                        temp_game.move_pawn(move_str, false);
                    }
                    
                    let eval = self.minimax(&temp_game, depth - 1, alpha, beta, true);
                    min_eval = min_eval.min(eval);
                    
                    // Update beta for pruning
                    beta = beta.min(eval);
                    if beta <= alpha {
                        break; // Alpha cutoff
                    }
                }
                min_eval
            }
        }
    }


    impl Strategy for MinimaxStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            let player = game.active_player;
            let legal_pawn_moves = game.get_legal_moves(player);
            let legal_wall_moves = if game.walls_available[&player] > 0 {
                game.get_legal_walls(player)
            } else {
                Vec::new()
            };
            
            let all_pawn_moves = legal_pawn_moves.clone();
            
            // Check if any moves win immediately
            for move_str in &legal_pawn_moves {
                if game.win_check(move_str) {
                    return Some(move_str.clone());
                }
            }
            
            let mut best_move = None;
            let mut best_score = f64::NEG_INFINITY;
            
            // Use iterative deepening on wall moves to prioritize promising walls
            // This helps when there are too many possible wall placements
            let mut wall_moves_to_check = legal_wall_moves.clone();
            
            // If there are many wall moves, use a heuristic pre-filter 
            // to identify promising walls that might block the opponent
            if wall_moves_to_check.len() > 20 && !wall_moves_to_check.is_empty() {
                let opponent = player.opponent();
                let opponent_distance = game.distance_to_goal(opponent);
                
                // Score each wall by how much it increases opponent's path length
                let mut wall_scores: Vec<(String, usize)> = Vec::new();
                
                for wall_move in &wall_moves_to_check {
                    let mut temp_game = game.clone();
                    if temp_game.add_wall(wall_move, false, false) {
                        let new_distance = temp_game.distance_to_goal(opponent);
                        let diff = new_distance.saturating_sub(opponent_distance);
                        
                        if diff > 0 {
                            wall_scores.push((wall_move.clone(), diff));
                        }
                    }
                }
                
                // Sort walls by how much they increase opponent's path
                wall_scores.sort_by(|a, b| b.1.cmp(&a.1));
                
                // Take the top 20 most promising walls
                wall_moves_to_check = wall_scores.into_iter()
                    .take(20)
                    .map(|(wall, _)| wall)
                    .collect();
            }
            
            // Evaluate pawn moves first (usually better than walls)
            for move_str in &all_pawn_moves {
                let mut temp_game = game.clone();
                temp_game.move_pawn(move_str, false);
                
                let score = self.minimax(&temp_game, self.depth - 1, f64::NEG_INFINITY, f64::INFINITY, false);
                
                if score > best_score {
                    best_score = score;
                    best_move = Some(move_str.clone());
                }
            }
            
            // Evaluate wall moves
            for move_str in &wall_moves_to_check {
                let mut temp_game = game.clone();
                temp_game.add_wall(move_str, false, false);
                
                let score = self.minimax(&temp_game, self.depth - 1, f64::NEG_INFINITY, f64::INFINITY, false);
                
                if score > best_score {
                    best_score = score;
                    best_move = Some(move_str.clone());
                }
            }
            
            best_move
        }
    }

    // Mirror Strategy
    pub struct MirrorStrategy {
        base: QuoridorStrategy,
        backup_strategy: Box<dyn Strategy>,
        center: Option<(f64, f64)>,
    }

    impl MirrorStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>) -> Self {
            MirrorStrategy {
                base: QuoridorStrategy::new("Mirror", opening_name, opening_moves),
                backup_strategy: Box::new(AdaptiveStrategy::new("", Vec::new())),
                center: None,
            }
        }
        
        pub fn calculate_mirrored_position(&self, game: &Quoridor, opponent: Player) -> Coord {
            let center = match self.center {
                Some(c) => c,
                None => ((game.size - 1) as f64 / 2.0, (game.size - 1) as f64 / 2.0),
            };
            
            let opponent_pos = game.pawn_positions[&opponent];
            
            // Calculate mirrored position
            let mirrored_row = 2.0 * center.0 - opponent_pos.0 as f64;
            let mirrored_col = 2.0 * center.1 - opponent_pos.1 as f64;
            
            // Ensure coordinates are within bounds
            let row = (mirrored_row.round() as i32).max(0).min((game.size - 1) as i32) as usize;
            let col = (mirrored_col.round() as i32).max(0).min((game.size - 1) as i32) as usize;
            
            (row, col)
        }
        
        pub fn find_best_move_toward(&self, game: &Quoridor, target_pos: Coord) -> Option<String> {
            let player = game.active_player;
            let current_pos = game.pawn_positions[&player];
            let legal_moves = game.get_legal_moves(player);
            
            if legal_moves.is_empty() {
                return None;
            }
            
            let mut best_move = None;
            let mut best_distance = usize::MAX;
            
            for move_str in &legal_moves {
                let pos = match game.algebraic_to_coord(move_str) {
                    p => p,
                    _ => continue,
                };
                
                // Calculate Manhattan distance to target
                let distance = abs_diff(pos.0, target_pos.0) + abs_diff(pos.1, target_pos.1);
                
                // Slightly favor moves that also progress toward goal
                let mut goal_bonus = 0;
                for &goal in &game.goal_positions[&player] {
                    let current_to_goal = abs_diff(current_pos.0, goal.0) + abs_diff(current_pos.1, goal.1);
                    let move_to_goal = abs_diff(pos.0, goal.0) + abs_diff(pos.1, goal.1);
                    
                    if move_to_goal < current_to_goal {
                        goal_bonus = 1;
                        break;
                    }
                }
                
                // Lower score is better
                let total_score = distance.saturating_sub(goal_bonus);
                
                if total_score < best_distance {
                    best_distance = total_score;
                    best_move = Some(move_str.clone());
                }
            }
            
            best_move
        }
        
        pub fn mirror_opponent_walls(&self, game: &Quoridor, opponent: Player) -> Option<String> {
            if game.walls_available[&game.active_player] <= 0 {
                return None;
            }
            
            // Get set of all walls on the board
            let mut all_walls = HashSet::new();
            for &wall in &game.hwall_positions {
                all_walls.insert(format!("{}h", game.coord_to_algebraic(wall)));
            }
            for &wall in &game.vwall_positions {
                all_walls.insert(format!("{}v", game.coord_to_algebraic(wall)));
            }
            
            let legal_walls = game.get_legal_walls(game.active_player);
            let center = match self.center {
                Some(c) => c,
                None => ((game.size - 1) as f64 / 2.0, (game.size - 1) as f64 / 2.0),
            };
            
            // For each wall, calculate its mirrored position
            for wall in &all_walls {
                let position = &wall[0..2];
                let orientation = &wall[2..];
                
                let wall_pos = match game.algebraic_to_coord(position) {
                    p => p,
                    _ => continue,
                };
                
                // Calculate mirrored wall position
                let mirrored_row = 2.0 * center.0 - wall_pos.0 as f64;
                let mirrored_col = 2.0 * center.1 - wall_pos.1 as f64;
                
                // Ensure coordinates are within bounds
                let row = (mirrored_row.round() as i32).max(1).min((game.size - 1) as i32) as usize;
                let col = (mirrored_col.round() as i32).max(0).min((game.size - 1) as i32) as usize;
                
                let mirrored_wall = format!("{}{}", game.coord_to_algebraic((row, col)), orientation);
                
                // If the mirrored wall is legal and not already placed
                if legal_walls.contains(&mirrored_wall) && !all_walls.contains(&mirrored_wall) {
                    return Some(mirrored_wall);
                }
            }
            
            None
        }
    }

    impl Strategy for MirrorStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            // Calculate board center if not already done
            if self.center.is_none() {
                self.center = Some(((game.size - 1) as f64 / 2.0, (game.size - 1) as f64 / 2.0));
            }
            
            let player = game.active_player;
            let opponent = player.opponent();
            
            // First priority: move toward the mirrored position of the opponent
            let mirror_pos = self.calculate_mirrored_position(game, opponent);
            if game.pawn_positions[&player] != mirror_pos {
                if let Some(mirror_move) = self.find_best_move_toward(game, mirror_pos) {
                    return Some(mirror_move);
                }
            }
            
            // Second priority: try to mirror any walls the opponent has placed
            if let Some(mirror_wall) = self.mirror_opponent_walls(game, opponent) {
                return Some(mirror_wall);
            }
            
            // If no good mirror move is found, use backup strategy
            self.backup_strategy.choose_move(game)
        }
    }

    // Utility functions
    pub fn abs_diff(a: usize, b: usize) -> usize {
        if a > b { a - b } else { b - a }
    }

    // Simulated Annealing Strategy
    pub struct SimulatedAnnealingStrategy {
        base: QuoridorStrategy,
        time_factor: f64,
    }

    impl SimulatedAnnealingStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>, time_factor: f64) -> Self {
            SimulatedAnnealingStrategy {
                base: QuoridorStrategy::new(&format!("SimulatedAnnealing{}", time_factor), 
                                        opening_name, opening_moves),
                time_factor,
            }
        }
    }

    impl Strategy for SimulatedAnnealingStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            let player = game.active_player;
            let possible_pawn_moves = game.get_legal_moves(player);
            let possible_wall_moves = if game.walls_available[&player] > 0 {
                game.get_legal_walls(player)
            } else {
                Vec::new()
            };
            
            if possible_pawn_moves.is_empty() && possible_wall_moves.is_empty() {
                return None;
            }
            
            // Check for immediate win
            for move_str in &possible_pawn_moves {
                if game.win_check(move_str) {
                    return Some(move_str.clone());
                }
            }
            
            // Initialize with random move
            let mut rng = rand::thread_rng();
            let all_moves: Vec<String> = possible_pawn_moves.iter().cloned()
                .chain(possible_wall_moves.iter().cloned())
                .collect();
            
            let mut current_move = all_moves[rng.gen_range(0..all_moves.len())].clone();
            let mut current_score = self.evaluate_move(game, &current_move);
            
            // Current temperature is based on game state
            let temperature = self.time_factor * (1.0 + game.distance_to_goal(player) as f64);
            
            // Simulated annealing process
            for _ in 0..100 {  // Limit iterations for performance
                let next_idx = rng.gen_range(0..all_moves.len());
                let next_move = all_moves[next_idx].clone();
                let next_score = self.evaluate_move(game, &next_move);
                
                let score_diff = next_score - current_score;
                
                // Accept if better, or with probability e^(diff/temp) if worse
                if score_diff > 0.0 || rng.gen::<f64>() < ((score_diff / temperature).exp()) {
                    current_move = next_move;
                    current_score = next_score;
                }
            }
            
            Some(current_move)
        }
    }

    impl SimulatedAnnealingStrategy {
        pub fn evaluate_move(&self, game: &Quoridor, move_str: &str) -> f64 {
            let mut temp_game = game.clone();
            
            // Apply the move
            if move_str.len() == 3 && (move_str.ends_with('h') || move_str.ends_with('v')) {
                temp_game.add_wall(move_str, false, false);
            } else {
                temp_game.move_pawn(move_str, false);
            }
            
            let player = game.active_player;
            let opponent = player.opponent();
            
            // Evaluation considers:
            // 1. Distance to goal (for both players)
            // 2. Number of walls left
            // 3. Next row progress
            
            let player_distance = temp_game.distance_to_goal(player) as f64;
            let opponent_distance = temp_game.distance_to_goal(opponent) as f64;
            let distance_diff = opponent_distance - player_distance;
            
            let player_walls = temp_game.walls_available[&player] as f64;
            let opponent_walls = temp_game.walls_available[&opponent] as f64;
            let wall_diff = player_walls - opponent_walls;
            
            // Moves to next row carries significant weight
            let moves_to_next = temp_game.moves_to_next_row(player) as f64;
            let next_row_factor = 1.0 / (moves_to_next + 0.1);  // Avoid division by zero
            
            // Combined evaluation - weights are tunable
            0.6 * distance_diff + 0.2 * wall_diff + 14.5 * next_row_factor
        }
    }

    pub struct ProgressiveDeepeningStrategy {
        base: QuoridorStrategy,
        max_depth: usize,
    }

    impl ProgressiveDeepeningStrategy {
        pub fn new(opening_name: &str, opening_moves: Vec<String>, max_depth: usize) -> Self {
            ProgressiveDeepeningStrategy {
                base: QuoridorStrategy::new(&format!("ProgressiveDeepening{}", max_depth), 
                                        opening_name, opening_moves),
                max_depth,
            }
        }
    }

    impl Strategy for ProgressiveDeepeningStrategy {
        fn name(&self) -> String {
            self.base.name.clone()
        }
        
        fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
            // Try opening move
            if let Some(move_str) = self.base.try_opening_move(game) {
                return Some(move_str);
            }
            
            let player = game.active_player;
            let legal_pawn_moves = game.get_legal_moves(player);
            let legal_wall_moves = if game.walls_available[&player] > 0 {
                game.get_legal_walls(player)
            } else {
                Vec::new()
            };
            
            if legal_pawn_moves.is_empty() && legal_wall_moves.is_empty() {
                return None;
            }
            
            // Check for immediate win
            for move_str in &legal_pawn_moves {
                if game.win_check(move_str) {
                    return Some(move_str.clone());
                }
            }
            
            // Allocate more search depth to promising moves
            let mut best_move = None;
            let mut best_score = f64::NEG_INFINITY;
            
            // First do a shallow evaluation of all moves
            let all_moves: Vec<(String, f64)> = legal_pawn_moves.iter().cloned()
                .chain(legal_wall_moves.iter().cloned())
                .map(|m| {
                    let score = self.evaluate_move(game, &m, 1);
                    (m, score)
                })
                .collect();
            
            // Sort by initial evaluation
            let mut sorted_moves = all_moves.clone();
            sorted_moves.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            
            // Progressive deepening: search deeper for more promising moves
            for (depth, moves_to_check) in (2..=self.max_depth).zip(1..=sorted_moves.len()) {
                for (m, _) in &sorted_moves[0..moves_to_check.min(sorted_moves.len())] {
                    let score = self.evaluate_move(game, m, depth);
                    if score > best_score {
                        best_score = score;
                        best_move = Some(m.clone());
                    }
                }
            }
            
            best_move
        }
    }

    impl ProgressiveDeepeningStrategy {
        pub fn evaluate_move(&self, game: &Quoridor, move_str: &str, depth: usize) -> f64 {
            if depth == 0 {
                return self.static_evaluation(game);
            }
            
            let mut temp_game = game.clone();
            
            // Apply the move
            if move_str.len() == 3 && (move_str.ends_with('h') || move_str.ends_with('v')) {
                temp_game.add_wall(move_str, false, false);
            } else {
                temp_game.move_pawn(move_str, false);
            }
            
            // If game is won, return high value
            if temp_game.win_check(move_str) {
                return f64::MAX;
            }
            
            // Get opponent's best response
            let opponent = game.active_player.opponent();
            let opponent_pawn_moves = temp_game.get_legal_moves(opponent);
            let opponent_wall_moves = if temp_game.walls_available[&opponent] > 0 {
                temp_game.get_legal_walls(opponent)
            } else {
                Vec::new()
            };
            
            if opponent_pawn_moves.is_empty() && opponent_wall_moves.is_empty() {
                return f64::MAX;  // Opponent has no moves
            }
            
            let all_opponent_moves: Vec<String> = opponent_pawn_moves.iter().cloned()
                .chain(opponent_wall_moves.iter().cloned())
                .collect();
            
            // Recursively find opponent's best response
            let mut min_score = f64::INFINITY;
            for op_move in &all_opponent_moves {
                let mut op_game = temp_game.clone();
                
                if op_move.len() == 3 && (op_move.ends_with('h') || op_move.ends_with('v')) {
                    op_game.add_wall(op_move, false, false);
                } else {
                    op_game.move_pawn(op_move, false);
                }
                
                // Recurse with reduced depth
                let score = -self.evaluate_move(&op_game, op_move, depth - 1);
                min_score = min_score.min(score);
            }
            
            min_score
        }
        
        pub fn static_evaluation(&self, game: &Quoridor) -> f64 {
            let player = game.active_player;
            let opponent = player.opponent();
            
            // Position difference (f2 in paper)
            let f2 = game.distance_to_goal(opponent) as f64 - game.distance_to_goal(player) as f64;
            
            // Attacking feature (f3 in paper)
            let moves_next_player = game.moves_to_next_row(player);
            let f3 = 1.0 / (moves_next_player as f64);
            
            // Defensive feature (f4 in paper)
            let moves_next_opponent = game.moves_to_next_row(opponent);
            let f4 = moves_next_opponent as f64;
            
            // Using weights from paper
            0.6001 * f2 + 14.45 * f3 + 6.52 * f4
        }
    }

    // Opening moves
    pub fn get_opening_moves(opening_name: &str, player: Player) -> Vec<String> {
        match (opening_name, player) {
            ("No Opening", Player::Player1) => vec!["e2".to_string()],
            ("No Opening", Player::Player2) => vec!["e8".to_string()],

            ("Sidewall Opening", Player::Player1) => vec!["c3h".to_string(), "f3h".to_string()],
            ("Sidewall Opening", Player::Player2) => vec!["a3h".to_string(), "h3h".to_string()],

            ("Shiller Opening", Player::Player1) => vec!["e2".to_string(), "e3".to_string(), "e4".to_string(), "c3v".to_string()],
            ("Shiller Opening", Player::Player2) => vec!["e8".to_string(), "e7".to_string(), "e6".to_string()],

            ("Stonewall", Player::Player1) => vec!["e2".to_string(), "e3".to_string(), "d2h".to_string()],
            ("Stonewall", Player::Player2) => vec!["e8".to_string(), "e7".to_string()],

            ("Ala Opening", Player::Player1) => vec![
                "e2".to_string(), "e3".to_string(), "e4".to_string(), 
                "d5h".to_string(), "f5h".to_string(), "c4v".to_string(), "g4v".to_string()
            ],
            ("Ala Opening", Player::Player2) => vec!["e8".to_string(), "e7".to_string(), "e6".to_string()],

            ("Standard Opening", Player::Player1) => vec!["e2".to_string(), "e3".to_string(), "e4".to_string(), "e3v".to_string()],
            ("Standard Opening", Player::Player2) => vec!["e8".to_string(), "e7".to_string(), "e6".to_string(), "e6v".to_string()],

            ("Standard Opening (Symmetrical)", Player::Player1) => vec!["e2".to_string(), "e3".to_string(), "e4".to_string(), "e3v".to_string()],
            ("Standard Opening (Symmetrical)", Player::Player2) => vec!["e8".to_string(), "e7".to_string(), "e6".to_string(), "d6v".to_string()],

            ("Rush Variation", Player::Player1) => vec![
                "e2".to_string(), "e3".to_string(), "e4".to_string(), 
                "d5v".to_string(), "e4h".to_string(), "g4h".to_string(), "h5v".to_string()
            ],
            ("Rush Variation", Player::Player2) => vec![
                "e8".to_string(), "e7".to_string(), "e6".to_string(), 
                "e6h".to_string(), "f6".to_string(), "f5".to_string(), "g5".to_string()
            ],

            ("Gap Opening", Player::Player1) => vec!["e2".to_string(), "e3".to_string(), "e4".to_string()],
            ("Gap Opening", Player::Player2) => vec!["e8".to_string(), "e7".to_string(), "e6".to_string()],

            ("Gap Opening (Mainline)", Player::Player1) => vec!["e2".to_string(), "e3".to_string(), "e4".to_string()],
            ("Gap Opening (Mainline)", Player::Player2) => vec!["e8".to_string(), "e7".to_string(), "e6".to_string(), "g6h".to_string()],

            ("Anti-Gap", Player::Player1) => vec!["e2".to_string(), "e3".to_string(), "e4".to_string()],
            ("Anti-Gap", Player::Player2) => vec!["e8".to_string(), "e7".to_string(), "e6".to_string(), "b3h".to_string()],

            ("Sidewall", Player::Player1) => vec!["e2".to_string(), "d7v".to_string()],
            ("Sidewall", Player::Player2) => vec!["e8".to_string()],

            ("Sidewall (Proper Counter)", Player::Player1) => vec!["e2".to_string(), "d7v".to_string()],
            ("Sidewall (Proper Counter)", Player::Player2) => vec!["e8".to_string(), "c7h".to_string()],

            ("Quick Box Variation", Player::Player1) => vec!["e2".to_string()],
            ("Quick Box Variation", Player::Player2) => vec!["e8".to_string(), "d1h".to_string()],

            ("Shatranj Opening", Player::Player1) => vec!["d1v".to_string()],
            ("Shatranj Opening", Player::Player2) => vec![],

            ("Lee Inversion", Player::Player1) => vec!["e1v".to_string()],
            ("Lee Inversion", Player::Player2) => vec![],

            _ => Vec::new(),
        }
    }


    // Tournament pub structure
    #[derive(Debug, Clone)]
    pub struct TournamentResult {
        strategy1: String,
        strategy2: String,
        opening: String,
        strategy1_wins: usize,
        strategy2_wins: usize,
        draws: usize,
    }

    pub struct Tournament {
        board_size: usize,
        walls: usize,
        games_per_match: usize,
        results: Vec<TournamentResult>,
    }

    impl Tournament {
        pub fn new(board_size: usize, walls: usize, games_per_match: usize) -> Self {
            Tournament {
                board_size,
                walls,
                games_per_match,
                results: Vec::new(),
            }
        }
        
        pub fn create_strategy(&self, strategy_name: &str, opening_name: &str, player: Player) -> Box<dyn Strategy> {
            let opening_moves = get_opening_moves(opening_name, player);
            
            match strategy_name {
                "Random" => Box::new(RandomStrategy::new(opening_name, opening_moves)),
                "ShortestPath" => Box::new(ShortestPathStrategy::new(opening_name, opening_moves)),
                "Defensive" => Box::new(DefensiveStrategy::new(opening_name, opening_moves, 0.7)),
                "Balanced" => Box::new(BalancedStrategy::new(opening_name, opening_moves, 0.5)),
                "Adaptive" => Box::new(AdaptiveStrategy::new(opening_name, opening_moves)),
                "Mirror" => Box::new(MirrorStrategy::new(opening_name, opening_moves)),
                s if s.starts_with("SimulatedAnnealing") => {
                    let factor = s[18..].parse::<f64>().unwrap_or(1.0);
                    Box::new(SimulatedAnnealingStrategy::new(opening_name, opening_moves, factor))
                },
                s if s.starts_with("Minimax") => {
                    let depth = s[7..].parse::<usize>().unwrap_or(1);
                    Box::new(MinimaxStrategy::new(opening_name, opening_moves, depth))
                },
                s if s.starts_with("ProgressiveDeepening") => {
                    let depth = s[20..].parse::<usize>().unwrap_or(3);
                    Box::new(ProgressiveDeepeningStrategy::new(opening_name, opening_moves, depth))
                },
                _ => Box::new(RandomStrategy::new(opening_name, opening_moves)), // Default
            }
        }

        pub fn run_debug_match(&mut self, strategy1_name: &str, strategy2_name: &str, opening_name: &str) {
            println!("\n=== DEBUG MATCH: {} vs {} with {} ===", 
                    strategy1_name, strategy2_name, opening_name);
            
            let mut first_strategy = self.create_strategy(strategy1_name, opening_name, Player::Player1);
            let mut second_strategy = self.create_strategy(strategy2_name, opening_name, Player::Player2);
            
            // Setup the game
            let mut game = Quoridor::new(self.board_size, self.walls, None);
            let mut move_count = 0;
            
            // Play the game
            loop {
                let current_player = game.active_player;
                let current_strategy = if current_player == Player::Player1 { 
                    &mut first_strategy 
                } else { 
                    &mut second_strategy 
                };
                
                println!("Turn {}: {}'s move", move_count, current_player.name());
                let move_result = current_strategy.choose_move(&game);
                
                if move_result.is_none() {
                    println!("No valid moves, {} loses", current_player.name());
                    break;
                }
                
                let move_str = move_result.unwrap();
                println!("Move chosen: {}", move_str);
                
                // Check for win
                if game.win_check(&move_str) {
                    println!("{} wins with move {}", current_player.name(), move_str);
                    break;
                }
                
                // Apply the move
                let move_success = if move_str.len() == 3 && 
                                (move_str.ends_with('h') || move_str.ends_with('v')) {
                    game.add_wall(&move_str, false, true)
                } else {
                    game.move_pawn(&move_str, true)
                };
                
                if !move_success {
                    println!("MOVE FAILED: {}", move_str);
                    break;
                }
                
                move_count += 1;
                
                // Maximum moves safeguard
                if move_count > 50 {
                    println!("Game drawn after {} moves", move_count);
                    break;
                }
            }
        }
        
        pub fn run_match(
            &mut self,
            strategy1_name: &str,
            strategy2_name: &str,
            opening_name: &str,
            display: bool,
        ) {
            let mut s1_wins = 0;
            let mut s2_wins = 0;
            let mut draws = 0;
            
            for game_num in 0..self.games_per_match {
                // Alternate who goes first
                let (first_strategy_type, second_strategy_type, first_player, second_player) = 
                    if game_num % 2 == 0 {
                        (strategy1_name, strategy2_name, Player::Player1, Player::Player2)
                    } else {
                        (strategy2_name, strategy1_name, Player::Player1, Player::Player2)
                    };
                
                // Create strategies
                let mut first_strategy = self.create_strategy(first_strategy_type, opening_name, first_player);
                let mut second_strategy = self.create_strategy(second_strategy_type, opening_name, second_player);
                
                // Setup the game
                let mut game = Quoridor::new(self.board_size, self.walls, None);
                let mut move_count = 0;
                
                // Play the game
                loop {
                    let current_player = game.active_player;
                    let current_strategy = if current_player == first_player { 
                        &mut first_strategy 
                    } else { 
                        &mut second_strategy 
                    };

                    let move_result = current_strategy.choose_move(&game);
                    
                    if move_result.is_none() {
                        // No valid moves, current player loses
                        if current_player == first_player {
                            if first_strategy_type == strategy1_name { s2_wins += 1; } else { s1_wins += 1; }
                        } else {
                            if second_strategy_type == strategy1_name { s2_wins += 1; } else { s1_wins += 1; }
                        }
                        break;
                    }
                    
                    let move_str = move_result.unwrap();
                    
                    // Check for win
                    if game.win_check(&move_str) {
                        if current_player == first_player {
                            if first_strategy_type == strategy1_name { s1_wins += 1; } else { s2_wins += 1; }
                        } else {
                            if second_strategy_type == strategy1_name { s1_wins += 1; } else { s2_wins += 1; }
                        }
                        move_count += 1;
                        break;
                    }
                    
                    // Apply the move
                    let move_success = if move_str.len() == 3 && 
                                    (move_str.ends_with('h') || move_str.ends_with('v')) {
                        game.add_wall(&move_str, false, true)
                    } else {
                        game.move_pawn(&move_str, true)
                    };
                    
                    if !move_success && display {
                        println!("MOVE FAILED: {}", move_str);
                    }
                    
                    move_count += 1;
                    
                    // Maximum moves safeguard
                    if move_count > 150 {
                        draws += 1;
                        break;
                    }
                }
            }
            
            self.results.push(TournamentResult {
                strategy1: strategy1_name.to_string(),
                strategy2: strategy2_name.to_string(),
                opening: opening_name.to_string(),
                strategy1_wins: s1_wins,
                strategy2_wins: s2_wins,
                draws,
            });
        }
        
        pub fn run_tournament(&mut self, display: bool) {
            let strategy_names = vec![
                "Adaptive", 
                "Minimax2",
                "Minimax3",
                "SimulatedAnnealing0.5",
                "SimulatedAnnealing1.0",
                "SimulatedAnnealing1.5",
                "SimulatedAnnealing2.0",
                "ProgressiveDeepening2",
                "ProgressiveDeepening3"
            ];
            
            let opening_names = vec![
                "No Opening", 
                "Sidewall Opening", 
                "Standard Opening"
            ];
            
            for opening_name in &opening_names {
                for i in 0..strategy_names.len() {
                    for j in (i+1)..strategy_names.len() {
                        if display {
                            println!("{}: {} vs {}", opening_name, strategy_names[i], strategy_names[j]);
                        }
                        
                        self.run_match(
                            strategy_names[i], 
                            strategy_names[j], 
                            opening_name, 
                            display
                        );
                    }
                }
            }
        }
        
        pub fn write_results_to_csv(&self, filename: &str) -> std::io::Result<()> {
            let path = Path::new(filename);
            let mut writer = Writer::from_path(path)?;
            
            // Write header
            writer.write_record(&[
                "Opening", "Strategy", "Opponent", "Wins", "Win %"
            ])?;
            
            // Write data rows
            for result in &self.results {
                // Strategy1 vs Strategy2
                let win_percentage = (result.strategy1_wins as f64 / self.games_per_match as f64) * 100.0;
                writer.write_record(&[
                    &result.opening,
                    &result.strategy1,
                    &result.strategy2,
                    &result.strategy1_wins.to_string(),
                    &format!("{:.2}", win_percentage),
                ])?;
                
                // Strategy2 vs Strategy1
                let win_percentage = (result.strategy2_wins as f64 / self.games_per_match as f64) * 100.0;
                writer.write_record(&[
                    &result.opening,
                    &result.strategy2,
                    &result.strategy1,
                    &result.strategy2_wins.to_string(),
                    &format!("{:.2}", win_percentage),
                ])?;
            }
            
            writer.flush()?;
            Ok(())
        }

        pub fn run_tournament_parallel(&mut self, display: bool) {
            let start_time = Instant::now();
            println!("Starting tournament with parallel execution...");
            
            let strategy_names = vec![
                "Adaptive", 
                "Minimax2",
                "Minimax3",
                "SimulatedAnnealing0.5",
                "SimulatedAnnealing1.0",
                "SimulatedAnnealing1.5",
                "SimulatedAnnealing2.0",
                "ProgressiveDeepening2",
                "ProgressiveDeepening3"
            ];
            
            let opening_names = vec![
                "No Opening", 
                "Sidewall Opening", 
                "Standard Opening"
            ];
            
            // Create a vector of all match configurations
            let mut match_configs = Vec::new();
            for opening_name in &opening_names {
                for i in 0..strategy_names.len() {
                    for j in (i+1)..strategy_names.len() {
                        match_configs.push((
                            strategy_names[i].to_string(),
                            strategy_names[j].to_string(),
                            opening_name.to_string(),
                            display
                        ));
                    }
                }
            }
            
            println!("Total matches to run: {}", match_configs.len());
            
            // Determine number of threads (e.g., number of CPU cores)
            let num_threads = thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
            println!("Using {} threads", num_threads);
            
            let chunk_size = (match_configs.len() + num_threads - 1) / num_threads;
            
            // Use an Arc<Mutex<>> to collect results from threads
            let results = Arc::new(Mutex::new(Vec::new()));
            
            // Split matches into chunks and process each chunk in a separate thread
            let mut handles = Vec::new();
            
            for (thread_idx, chunk) in match_configs.chunks(chunk_size).enumerate() {
                let chunk_configs = chunk.to_vec();
                let results_clone = Arc::clone(&results);
                let board_size = self.board_size;
                let walls = self.walls;
                let games_per_match = self.games_per_match;
                
                // Spawn a thread to process this chunk
                let handle = thread::spawn(move || {
                    println!("Thread {} starting with {} matches", thread_idx, chunk_configs.len());
                    let thread_start = Instant::now();
                    
                    // Create a tournament for this thread
                    let mut thread_tournament = Tournament::new(board_size, walls, games_per_match);
                    
                    // Process each match in this chunk
                    for (idx, (s1, s2, opening, disp)) in chunk_configs.iter().enumerate() {
                        if *disp {
                            println!("Thread {}: {} vs {} with {} ({}/{})", 
                                    thread_idx, s1, s2, opening, idx + 1, chunk_configs.len());
                        }
                        
                        // Run the match using our thread's tournament
                        thread_tournament.run_match(s1, s2, opening, *disp);
                    }
                    
                    // Get the results from this thread's tournament
                    let thread_results = thread_tournament.results;
                    
                    // Add the results to the shared results
                    let mut shared_results = results_clone.lock().unwrap();
                    shared_results.extend(thread_results);
                    
                    println!("Thread {} completed in {:.2?}", thread_idx, thread_start.elapsed());
                });
                
                handles.push(handle);
            }
            
            // Wait for all threads to complete
            for handle in handles {
                handle.join().unwrap();
            }
            
            // Get the final results
            self.results = Arc::try_unwrap(results)
                .expect("Failed to unwrap Arc")
                .into_inner()
                .expect("Failed to unwrap Mutex");
            
            println!("Tournament completed in {:.2?} with {} results", 
                    start_time.elapsed(), self.results.len());
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub fn main() {
        // Enable debugging if needed
        let debug_enabled = env::var("QUORIDOR_DEBUG").is_ok();

        println!("Running Quoridor Tournament with multiprocessing...");
        
        if debug_enabled {
            println!("Debug mode enabled");
        }
        
        // Create tournament 
        let mut tournament = Tournament::new(
            9,   // board size
            10,  // walls
            30,   // games per match 
        );
        
        // Run the tournament using parallel execution
        tournament.run_tournament_parallel(debug_enabled);
        
        // Write results to CSV
        match tournament.write_results_to_csv("rust_tournament_results.csv") {
            Ok(_) => println!("Tournament results saved to 'rust_tournament_results.csv'"),
            Err(e) => eprintln!("Error writing results: {}", e),
        }
    }


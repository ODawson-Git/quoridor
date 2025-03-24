use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use rand::prelude::*;
use csv::Writer;
use petgraph::graph::{Graph, NodeIndex, UnGraph};
use petgraph::algo::{dijkstra, has_path_connecting};

// Define coordinate type for clarity
type Coord = (usize, usize);

// Enum for player identification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Player {
    Player1,
    Player2,
}

impl Player {
    fn opponent(&self) -> Self {
        match self {
            Player::Player1 => Player::Player2,
            Player::Player2 => Player::Player1,
        }
    }

    fn name(&self) -> &'static str {
        match self {
            Player::Player1 => "player1",
            Player::Player2 => "player2",
        }
    }
}

// Game state representation
#[derive(Clone)]
struct Quoridor {
    size: usize,
    walls: usize,
    graph: UnGraph<Coord, ()>,
    node_indices: HashMap<Coord, NodeIndex>,
    hwall_positions: Vec<Coord>,
    vwall_positions: Vec<Coord>,
    pawn_positions: HashMap<Player, Coord>,
    walls_available: HashMap<Player, usize>,
    active_player: Player,
    goal_positions: HashMap<Player, Vec<Coord>>,
    state_string: String,
    previous_state: String,
    last_move: String,
}

impl Quoridor {
    fn new(size: usize, walls: usize, state_string: Option<&str>) -> Self {
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
    
    fn initialize_graph(&mut self) {
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

    fn parse_state_string(&mut self, state_string: &str) {
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
    
    fn update_state_string(&mut self, keep_player: bool) {
        if !keep_player {
            self.active_player = self.active_player.opponent();
        }
        
        let player_char = match self.active_player {
            Player::Player1 => "1",
            Player::Player2 => "2",
        };
        
        let hwall_str: String = self.hwall_positions.iter()
            .map(|&pos| self.coord_to_algebraic(pos))
            .collect();
            
        let vwall_str: String = self.vwall_positions.iter()
            .map(|&pos| self.coord_to_algebraic(pos))
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
    
    fn algebraic_to_coord(&self, square: &str) -> Coord {
        let chars: Vec<char> = square.chars().collect();
        let col_letter = chars[0].to_lowercase().next().unwrap();
        let row_num: usize = square[1..].parse().expect("Invalid row number");
        
        let col = (col_letter as u8 - b'a') as usize;
        let row = self.size - row_num;
        
        (row, col)
    }
    
    fn coord_to_algebraic(&self, coord: Coord) -> String {
        let (row, col) = coord;
        let col_letter = (b'a' + col as u8) as char;
        let row_number = self.size - row;
        
        format!("{}{}", col_letter, row_number)
    }
    
    fn has_path(&self, player: Player, destination: Coord) -> bool {
        if !self.pawn_positions.contains_key(&player) || !self.node_indices.contains_key(&destination) {
            return false;
        }
        
        let start_idx = self.node_indices[&self.pawn_positions[&player]];
        let end_idx = self.node_indices[&destination];
        
        has_path_connecting(&self.graph, start_idx, end_idx, None)
    }
    
    fn get_wall_edges(&self, wall_move: &str) -> Vec<(Coord, Coord)> {
        let position = &wall_move[0..2];
        let orientation = &wall_move[2..];
        
        let coord = self.algebraic_to_coord(position);
        let mut edges = Vec::new();
        
        if orientation == "h" {
            edges.push((coord, (coord.0.wrapping_sub(1), coord.1)));
            edges.push(((coord.0, coord.1 + 1), (coord.0.wrapping_sub(1), coord.1 + 1)));
        } else if orientation == "v" {
            edges.push((coord, (coord.0, coord.1 + 1)));
            edges.push(((coord.0.wrapping_sub(1), coord.1), (coord.0.wrapping_sub(1), coord.1 + 1)));
        }
        
        edges
    }
    
    fn add_wall(&mut self, wall_move: &str, initialise: bool, check: bool) -> bool {
        let position = &wall_move[0..2];
        let orientation = &wall_move[2..];
        let coord = self.algebraic_to_coord(position);
        
        let edges = self.get_wall_edges(wall_move);
        
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
    
    fn wall_check(&self, player: Player, wall_move: &str) -> bool {
        let edges = self.get_wall_edges(wall_move);
        
        // Check if player has walls available
        if self.walls_available[&player] == 0 {
            return false;
        }
        
        // Check if position already has a wall of different orientation
        let position = &wall_move[0..2];
        let orientation = &wall_move[2..];
        
        if orientation == "v" {
            // Check if horizontal wall exists at same position
            if self.hwall_positions.contains(&self.algebraic_to_coord(position)) {
                return false;
            }
        } else if orientation == "h" {
            // Check if vertical wall exists at same position
            if self.vwall_positions.contains(&self.algebraic_to_coord(position)) {
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
    
    fn move_pawn(&mut self, move_str: &str, check: bool) -> bool {
        let destination = self.algebraic_to_coord(move_str);
        
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
    
    fn get_legal_moves(&self, player: Player) -> Vec<String> {
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
    
    fn get_legal_walls(&self, player: Player) -> Vec<String> {
        let mut legal_walls = Vec::new();
        
        // Iterate through all possible wall positions
        for row in 1..self.size {
            for col in 0..self.size {
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
    
    fn distance_to_goal(&self, player: Player) -> usize {
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
        
        min_distance
    }
    
    fn win_check(&self, move_str: &str) -> bool {
        let row = self.algebraic_to_coord(move_str).0;
        
        match self.active_player {
            Player::Player1 => row == 0,
            Player::Player2 => row == self.size - 1,
        }
    }
    
    fn moves_to_next_row(&self, player: Player) -> usize {
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
trait Strategy {
    fn name(&self) -> String;
    fn choose_move(&mut self, game: &Quoridor) -> Option<String>;
}

// Random strategy
struct RandomStrategy {
    name: String,
    opening_moves: Vec<String>,
    move_counter: usize,
}

impl RandomStrategy {
    fn new(opening_name: &str, opening_moves: Vec<String>) -> Self {
        let name = if opening_moves.is_empty() {
            "Random".to_string()
        } else {
            format!("Random-{}", opening_name)
        };
        
        RandomStrategy {
            name,
            opening_moves,
            move_counter: 0,
        }
    }
}

impl Strategy for RandomStrategy {
    fn name(&self) -> String {
        self.name.clone()
    }
    
    fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
        // Try to use opening move if available
        if self.move_counter < self.opening_moves.len() {
            let move_str = self.opening_moves[self.move_counter].clone();
            self.move_counter += 1;
            
            // Check if the opening move is legal
            let legal_pawn_moves = game.get_legal_moves(game.active_player);
            let legal_wall_moves = if game.walls_available[&game.active_player] > 0 {
                game.get_legal_walls(game.active_player)
            } else {
                Vec::new()
            };
            
            let all_legal_moves: Vec<String> = legal_pawn_moves.into_iter()
                .chain(legal_wall_moves.into_iter())
                .collect();
            
            if all_legal_moves.contains(&move_str) {
                return Some(move_str);
            }
        }
        
        // If no opening move is available, choose randomly
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
struct ShortestPathStrategy {
    name: String,
    opening_moves: Vec<String>,
    move_counter: usize,
}

impl ShortestPathStrategy {
    fn new(opening_name: &str, opening_moves: Vec<String>) -> Self {
        let name = if opening_moves.is_empty() {
            "ShortestPath".to_string()
        } else {
            format!("ShortestPath-{}", opening_name)
        };
        
        ShortestPathStrategy {
            name,
            opening_moves,
            move_counter: 0,
        }
    }
}

impl Strategy for ShortestPathStrategy {
    fn name(&self) -> String {
        self.name.clone()
    }
    
    fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
        // Try to use opening move if available
        if self.move_counter < self.opening_moves.len() {
            let move_str = self.opening_moves[self.move_counter].clone();
            self.move_counter += 1;
            
            // Check if the opening move is legal
            let legal_pawn_moves = game.get_legal_moves(game.active_player);
            let legal_wall_moves = if game.walls_available[&game.active_player] > 0 {
                game.get_legal_walls(game.active_player)
            } else {
                Vec::new()
            };
            
            let all_legal_moves: Vec<String> = legal_pawn_moves.into_iter()
                .chain(legal_wall_moves.into_iter())
                .collect();
            
            if all_legal_moves.contains(&move_str) {
                return Some(move_str);
            }
        }
        
        // If no opening move is available, choose the move that gets closest to goal
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
struct DefensiveStrategy {
    name: String,
    opening_moves: Vec<String>,
    move_counter: usize,
    wall_preference: f64,
}

impl DefensiveStrategy {
    fn new(opening_name: &str, opening_moves: Vec<String>, wall_preference: f64) -> Self {
        let name = if opening_moves.is_empty() {
            "Defensive".to_string()
        } else {
            format!("Defensive-{}", opening_name)
        };
        
        DefensiveStrategy {
            name,
            opening_moves,
            move_counter: 0,
            wall_preference,
        }
    }
}

impl Strategy for DefensiveStrategy {
    fn name(&self) -> String {
        self.name.clone()
    }
    
    fn choose_move(&mut self, game: &Quoridor) -> Option<String> {
        // Try to use opening move if available
        if self.move_counter < self.opening_moves.len() {
            let move_str = self.opening_moves[self.move_counter].clone();
            self.move_counter += 1;
            
            // Check if the opening move is legal
            let legal_pawn_moves = game.get_legal_moves(game.active_player);
            let legal_wall_moves = if game.walls_available[&game.active_player] > 0 {
                game.get_legal_walls(game.active_player)
            } else {
                Vec::new()
            };
            
            let all_legal_moves: Vec<String> = legal_pawn_moves.into_iter()
                .chain(legal_wall_moves.into_iter())
                .collect();
            
            if all_legal_moves.contains(&move_str) {
                return Some(move_str);
            }
        }
        
        let player = game.active_player;
        let opponent = player.opponent();
        
        let legal_pawn_moves = game.get_legal_moves(player);
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
        let mut shortest_path = ShortestPathStrategy::new("", Vec::new());
        shortest_path.choose_move(game)
    }
}

// Tournament structure
struct TournamentResult {
    strategy1: String,
    strategy2: String,
    opening: String,
    strategy1_wins: usize,
    strategy2_wins: usize,
    draws: usize,
}

struct Tournament {
    board_size: usize,
    walls: usize,
    games_per_match: usize,
    results: Vec<TournamentResult>,
}

impl Tournament {
    fn new(board_size: usize, walls: usize, games_per_match: usize) -> Self {
        Tournament {
            board_size,
            walls,
            games_per_match,
            results: Vec::new(),
        }
    }
    
    fn run_match(
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
            let (first_player, second_player) = if game_num % 2 == 0 {
                (Player::Player1, Player::Player2)
            } else {
                (Player::Player2, Player::Player1)
            };
            
            // Create strategies
            let mut first_strategy: Box<dyn Strategy> = if strategy1_name == "Random" {
                Box::new(RandomStrategy::new(opening_name, Vec::new()))
            } else if strategy1_name == "ShortestPath" {
                Box::new(ShortestPathStrategy::new(opening_name, Vec::new()))
            } else if strategy1_name == "Defensive" {
                Box::new(DefensiveStrategy::new(opening_name, Vec::new(), 0.7))
            } else {
                Box::new(RandomStrategy::new(opening_name, Vec::new()))
            };
            
            let mut second_strategy: Box<dyn Strategy> = if strategy2_name == "Random" {
                Box::new(RandomStrategy::new(opening_name, Vec::new()))
            } else if strategy2_name == "ShortestPath" {
                Box::new(ShortestPathStrategy::new(opening_name, Vec::new()))
            } else if strategy2_name == "Defensive" {
                Box::new(DefensiveStrategy::new(opening_name, Vec::new(), 0.7))
            } else {
                Box::new(RandomStrategy::new(opening_name, Vec::new()))
            };
            
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
                        s2_wins += 1;
                    } else {
                        s1_wins += 1;
                    }
                    break;
                }
                
                let move_str = move_result.unwrap();
                
                // Check for win
                if game.win_check(&move_str) {
                    if current_player == first_player {
                        s1_wins += 1;
                    } else {
                        s2_wins += 1;
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
    
    fn run_tournament(&mut self, display: bool) {
        let strategy_names = vec!["Random", "ShortestPath", "Defensive"];
        let opening_names = vec!["No Opening", "Sidewall Opening", "Standard Opening"];
        
        for opening_name in &opening_names {
            for i in 0..strategy_names.len() {
                for j in 0..strategy_names.len() {
                    if i != j {  // Don't run against self
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
    }
    
    fn write_results_to_csv(&self, filename: &str) -> std::io::Result<()> {
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
}

fn main() {
    println!("Running Quoridor Tournament...");
    
    // Create tournament
    let mut tournament = Tournament::new(
        9,   // board size
        10,  // walls
        50,  // games per match
    );
    
    // Run the tournament
    tournament.run_tournament(true);
    
    // Write results to CSV
    match tournament.write_results_to_csv("rust_tournament_results.csv") {
        Ok(_) => println!("Tournament results saved to 'rust_tournament_results.csv'"),
        Err(e) => eprintln!("Error writing results: {}", e),
    }
}
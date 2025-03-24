import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

def analyze_tournament_results(csv_file):
    """
    Analyze the tournament results from the Rust implementation and
    generate visualizations similar to the original Python code.
    """
    # Create directories for output
    os.makedirs("Heat Maps", exist_ok=True)
    os.makedirs("Replicator Dynamics", exist_ok=True)
    
    print(f"Reading data from {csv_file}...")
    # Read the data
    df = pd.read_csv(csv_file)
    
    # Get unique strategies and openings
    strategies = df['Strategy'].unique()
    openings = df['Opening'].unique()
    
    print(f"Found {len(strategies)} strategies and {len(openings)} openings")
    
    # Calculate overall strategy performance
    strategy_performance = {}
    for strategy in strategies:
        # Calculate win percentage against all opponents across all openings
        strategy_df = df[df['Strategy'] == strategy]
        total_wins = strategy_df['Wins'].sum()
        total_games = strategy_df['Wins'].sum() + df[df['Opponent'] == strategy]['Wins'].sum()
        win_percentage = (total_wins / total_games) * 100 if total_games > 0 else 0
        strategy_performance[strategy] = win_percentage
    
    # Print overall performance
    print("\nOverall Strategy Performance:")
    for strategy, performance in sorted(strategy_performance.items(), key=lambda x: x[1], reverse=True):
        print(f"{strategy}: {performance:.2f}%")
    
    # Create matrix for strategy x opening heatmap
    strategy_opening_matrix = np.zeros((len(strategies), len(openings)))
    
    for i, strategy in enumerate(strategies):
        for j, opening in enumerate(openings):
            # Calculate win percentage for this strategy in this opening
            opening_df = df[(df['Strategy'] == strategy) & (df['Opening'] == opening)]
            opponent_df = df[(df['Opponent'] == strategy) & (df['Opening'] == opening)]
            
            if not opening_df.empty and not opponent_df.empty:
                strategy_wins = opening_df['Wins'].sum()
                opponent_wins = opponent_df['Wins'].sum()
                total_games = strategy_wins + opponent_wins
                
                win_percentage = (strategy_wins / total_games) * 100 if total_games > 0 else 0
                strategy_opening_matrix[i, j] = win_percentage
    
    # Create heatmap of strategies vs openings
    print("Generating strategy vs opening heatmap...")
    plt.figure(figsize=(16, 10))
    sns.heatmap(strategy_opening_matrix, annot=True, fmt=".1f", cmap="YlGnBu",
               xticklabels=openings, yticklabels=strategies)
    plt.xlabel('Openings')
    plt.ylabel('Strategies')
    plt.title('Win Percentages by Strategy and Opening')
    plt.tight_layout()
    plt.savefig('./Heat Maps/0. Strategy Opening.png')
    plt.close()
    
    # Create matchup matrices for each opening
    for k, opening in enumerate(openings):
        print(f"Generating heatmap for {opening}...")
        opening_df = df[df['Opening'] == opening]
        
        # Create matrix for strategy matchups
        matchup_matrix = np.zeros((len(strategies), len(strategies)))
        
        for i, s1 in enumerate(strategies):
            for j, s2 in enumerate(strategies):
                if i != j:  # Skip diagonal (strategy vs itself)
                    # Find matches with strategy1 vs strategy2
                    matchup = opening_df[(opening_df['Strategy'] == s1) & 
                                        (opening_df['Opponent'] == s2)]
                    if not matchup.empty:
                        win_percentage = matchup['Win %'].values[0]
                        matchup_matrix[i, j] = win_percentage
        
        # Create heatmap
        plt.figure(figsize=(12, 10))
        sns.heatmap(matchup_matrix, annot=True, fmt=".1f", cmap="YlGnBu",
                   xticklabels=strategies, yticklabels=strategies)
        plt.xlabel('Opponent Strategy')
        plt.ylabel('Strategy')
        plt.title(f'Win Percentages for {opening}')
        plt.tight_layout()
        plt.savefig(f'./Heat Maps/{k+1}. {opening} Heat Map.png')
        plt.close()
    
    # Optionally: implement replicator dynamics visualization similar to the original notebook
    try:
        import nashpy as nash
        print("Running replicator dynamics analysis...")
        
        # Parameters for replicator dynamics
        initial_pop = [1/len(strategies)] * len(strategies)
        number_of_generations = 50
        timepoints = np.linspace(0, 10, number_of_generations)
        
        for k, opening in enumerate(openings):
            print(f"Generating replicator dynamics for {opening}...")
            opening_df = df[df['Opening'] == opening]
            
            # Create payoff matrix
            payoff_matrix = np.zeros((len(strategies), len(strategies)))
            for i, s1 in enumerate(strategies):
                for j, s2 in enumerate(strategies):
                    if i == j:  # Self play
                        payoff_matrix[i, j] = 0.5  # Draw
                    else:
                        matchup = opening_df[(opening_df['Strategy'] == s1) & 
                                            (opening_df['Opponent'] == s2)]
                        if not matchup.empty:
                            # Convert percentage to decimal
                            payoff_matrix[i, j] = matchup['Win %'].values[0] / 100
            
            # Create game for replicator dynamics
            payoff_a = payoff_matrix
            payoff_b = np.full((len(strategies), len(strategies)), 1) - payoff_a
            game = nash.Game(payoff_a, payoff_b)
            
            # Run replicator dynamics
            try:
                populations = game.replicator_dynamics(y0=initial_pop, timepoints=timepoints)
                
                # Create DataFrame for plotting
                pop_df = pd.DataFrame(populations, columns=strategies)
                pop_df['Generation'] = range(len(populations))
                
                # Reshape for seaborn
                pop_long = pop_df.melt(id_vars=['Generation'], 
                                    value_vars=strategies,
                                    var_name='Strategy', 
                                    value_name='Population')
                
                # Plot
                plt.figure(figsize=(12, 8))
                sns.set_style("whitegrid")
                ax = sns.lineplot(data=pop_long, x='Generation', y='Population', 
                                hue='Strategy', linewidth=2.5, palette='viridis')
                plt.title(f'Replicator Dynamics for {opening}', fontsize=16)
                plt.xlabel('Generation', fontsize=14)
                plt.ylabel('Population Share', fontsize=14)
                plt.ylim(0, 1)
                plt.legend(title='Strategy', fontsize=12, title_fontsize=14)
                plt.grid(True, linestyle='--', alpha=0.7)
                plt.tight_layout()
                plt.savefig(f"./Replicator Dynamics/{k}. {opening} RD.png", dpi=300)
                plt.close()
            except Exception as e:
                print(f"Error running replicator dynamics for {opening}: {e}")
                
    except ImportError:
        print("nashpy module not found, skipping replicator dynamics")
    
    print("Analysis complete!")
    return df

if __name__ == "__main__":
    analyze_tournament_results("rust_tournament_results.csv")
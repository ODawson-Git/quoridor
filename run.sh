#!/bin/bash

# Compile the code
cargo build --release

# Run with debugging enabled
QUORIDOR_DEBUG=0 ./target/release/quoridor
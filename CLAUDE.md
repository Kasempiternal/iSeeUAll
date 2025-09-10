# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Reveal is a Tauri-based desktop application for League of Legends that provides champion select utilities including teammate name revelation, auto-accept functionality, and dodging features. The project uses:

- **Frontend**: Svelte with TypeScript, TailwindCSS, and bits-ui components
- **Backend**: Rust with Tauri framework
- **LCU Integration**: Custom Shaco library for League Client API communication
- **Build Tool**: Vite for frontend bundling

## Development Commands

### Frontend Development
- `pnpm dev` - Start Vite development server (port 1420)
- `pnpm build` - Build frontend for production
- `pnpm preview` - Preview production build
- `pnpm check` - Run Svelte type checking

### Tauri Development
- `pnpm tauri dev` - Start Tauri development mode with hot reload
- `pnpm tauri build` - Build production application
- `pnpm tauri` - Access Tauri CLI commands

### Type Checking
- `pnpm check` - Run svelte-check for TypeScript validation

## Architecture

### Frontend Structure
- **src/main.ts** - Application entry point
- **src/reveal.svelte** - Main application component
- **src/lib/** - Core modules and utilities
  - `lcu.ts` - League Client API integration and champion select logic
  - `champ_select.ts` - Champion select data models
  - `config.ts` - Application configuration management
  - `state.ts` - Application state management
  - `utils.ts` - Utility functions
- **src/lib/components/** - Svelte UI components

### Backend Structure (src-tauri/src/)
- **main.rs** - Tauri application setup and WebSocket event handling
- **commands.rs** - Tauri command handlers for frontend-backend communication
- **champ_select.rs** - Champion select data models and logic
- **lobby.rs** - Lobby data models
- **summoner.rs** - Summoner information handling
- **analytics.rs** - Analytics and tracking
- **state.rs** - Game state management
- **utils.rs** - Utility functions

### LCU Integration
The application connects to the League Client through the Shaco library, which provides:
- REST API client for LCU endpoints
- WebSocket client for real-time events
- Process detection and authentication handling

Key endpoints used:
- `/lol-champ-select/v1/session` - Champion select session data
- `/lol-gameflow/v1/gameflow-phase` - Game flow state
- Various teambuilder and login endpoints for dodging

### Configuration
- **tauri.conf.json** - Tauri application configuration with updater settings
- **vite.config.ts** - Vite configuration with Tauri-specific settings
- **tsconfig.json** - TypeScript configuration with Svelte support
- **tailwind.config.js** - TailwindCSS configuration
- Application config stored in system config directory as JSON

## Key Features Implementation

### Champion Select Monitoring
- Real-time monitoring through LCU WebSocket events
- Auto-selection and hovering of champions (currently hardcoded to Ivern)
- Session data parsing and player position detection

### Auto-Accept
- Configurable auto-accept with delay settings
- Integration with game flow state monitoring

### Dodging
- Last-second dodge functionality during finalization phase
- Dodge state management to prevent duplicate dodges
- Manual dodge commands available

### Multi-provider Support
- OP.GG integration for external links
- Configurable provider settings

## Development Notes

- The application requires League of Legends to be running for full functionality
- WebSocket connection to LCU may take several seconds to establish
- Process detection runs continuously to monitor League Client status
- Configuration is automatically created on first run with default values
- Updater functionality is configured for GitHub releases
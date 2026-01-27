# Similo

Local semantic search for your files using Ollama embeddings.

## Prerequisites

- Node.js 18+
- [Ollama](https://ollama.ai/) running locally

```bash
# Install Ollama and pull the embedding model
ollama pull nomic-embed-text
```

## Installation

```bash
# Clone the repository
git clone https://github.com/joybro/similo.git
cd similo

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional, for using 'similo' command anywhere)
npm link
```

## Usage

### Add a directory to index

```bash
similo add ~/Documents/notes
```

The command returns immediately and indexing continues in the background.

### Search

```bash
similo search "authentication design patterns"
```

### Check status

```bash
similo status
```

Shows server status, indexed file count, and indexing queue progress.

### List registered directories

```bash
similo list
```

### Remove a directory

```bash
similo remove ~/Documents/notes
```

### Server commands

```bash
# Start server in foreground (for debugging)
similo serve

# Stop background server
similo stop

# Clear all indexes
similo clear
```

## Configuration

Config file: `~/.similo/config.json`

```json
{
  "server": {
    "port": 11435
  },
  "ollama": {
    "host": "http://localhost:11434",
    "model": "nomic-embed-text"
  },
  "indexing": {
    "extensions": [".md", ".txt"],
    "maxFileSize": 1048576,
    "ignorePatterns": ["node_modules", ".git", ".obsidian"]
  }
}
```

## Data locations

- Database: `~/.similo/index.db`
- Server log: `~/.similo/similo.log`
- PID file: `~/.similo/similo.pid`

## How it works

1. **Add directories** - Files are scanned and queued for indexing
2. **Background indexing** - Server processes files one by one, generating embeddings via Ollama
3. **File watching** - Changes are automatically detected and re-indexed
4. **Semantic search** - Query embeddings are compared against indexed files using vector similarity

## License

MIT

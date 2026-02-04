#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');

// Colors
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// Get version from package.json
const pkg = require('../package.json');

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasOpencode = args.includes('--opencode');
const hasClaude = args.includes('--claude');
const hasGemini = args.includes('--gemini');
const hasRoocode = args.includes('--roocode');
const hasBoth = args.includes('--both'); // Legacy flag, keeps working
const hasAll = args.includes('--all');
const hasUninstall = args.includes('--uninstall') || args.includes('-u');

// Runtime selection - can be set by flags or interactive prompt
let selectedRuntimes = [];
if (hasAll) {
  selectedRuntimes = ['claude', 'opencode', 'gemini', 'roocode'];
} else if (hasBoth) {
  selectedRuntimes = ['claude', 'opencode'];
} else {
  if (hasOpencode) selectedRuntimes.push('opencode');
  if (hasClaude) selectedRuntimes.push('claude');
  if (hasGemini) selectedRuntimes.push('gemini');
  if (hasRoocode) selectedRuntimes.push('roocode');
}

// Helper to get directory name for a runtime (used for local/project installs)
function getDirName(runtime) {
  if (runtime === 'opencode') return '.opencode';
  if (runtime === 'gemini') return '.gemini';
  if (runtime === 'roocode') return '.roo';
  return '.claude';
}

/**
 * Get the global config directory for OpenCode
 * OpenCode follows XDG Base Directory spec and uses ~/.config/opencode/
 * Priority: OPENCODE_CONFIG_DIR > dirname(OPENCODE_CONFIG) > XDG_CONFIG_HOME/opencode > ~/.config/opencode
 */
function getOpencodeGlobalDir() {
  // 1. Explicit OPENCODE_CONFIG_DIR env var
  if (process.env.OPENCODE_CONFIG_DIR) {
    return expandTilde(process.env.OPENCODE_CONFIG_DIR);
  }

  // 2. OPENCODE_CONFIG env var (use its directory)
  if (process.env.OPENCODE_CONFIG) {
    return path.dirname(expandTilde(process.env.OPENCODE_CONFIG));
  }

  // 3. XDG_CONFIG_HOME/opencode
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(expandTilde(process.env.XDG_CONFIG_HOME), 'opencode');
  }

  // 4. Default: ~/.config/opencode (XDG default)
  return path.join(os.homedir(), '.config', 'opencode');
}

/**
 * Get the global config directory for RooCode
 * RooCode uses: ROOCODE_CONFIG_DIR > ~/.roo/
 */
function getRoocodeGlobalDir() {
  if (process.env.ROOCODE_CONFIG_DIR) {
    return expandTilde(process.env.ROOCODE_CONFIG_DIR);
  }
  return path.join(os.homedir(), '.roo');
}

/**
 * Get the global config directory for a runtime
 * @param {string} runtime - 'claude', 'opencode', or 'gemini'
 * @param {string|null} explicitDir - Explicit directory from --config-dir flag
 */
function getGlobalDir(runtime, explicitDir = null) {
  if (runtime === 'opencode') {
    // For OpenCode, --config-dir overrides env vars
    if (explicitDir) {
      return expandTilde(explicitDir);
    }
    return getOpencodeGlobalDir();
  }

  if (runtime === 'gemini') {
    // Gemini: --config-dir > GEMINI_CONFIG_DIR > ~/.gemini
    if (explicitDir) {
      return expandTilde(explicitDir);
    }
    if (process.env.GEMINI_CONFIG_DIR) {
      return expandTilde(process.env.GEMINI_CONFIG_DIR);
    }
    return path.join(os.homedir(), '.gemini');
  }

  if (runtime === 'roocode') {
    // RooCode: --config-dir > ROOCODE_CONFIG_DIR > ~/.roo
    if (explicitDir) {
      return expandTilde(explicitDir);
    }
    return getRoocodeGlobalDir();
  }

  // Claude Code: --config-dir > CLAUDE_CONFIG_DIR > ~/.claude
  if (explicitDir) {
    return expandTilde(explicitDir);
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    return expandTilde(process.env.CLAUDE_CONFIG_DIR);
  }
  return path.join(os.homedir(), '.claude');
}

const banner = '\n' +
  cyan + '   ██████╗ ███████╗██████╗\n' +
  '  ██╔════╝ ██╔════╝██╔══██╗\n' +
  '  ██║  ███╗███████╗██║  ██║\n' +
  '  ██║   ██║╚════██║██║  ██║\n' +
  '  ╚██████╔╝███████║██████╔╝\n' +
  '   ╚═════╝ ╚══════╝╚═════╝' + reset + '\n' +
  '\n' +
  '  Get Shit Done ' + dim + 'v' + pkg.version + reset + '\n' +
  '  A meta-prompting, context engineering and spec-driven\n' +
  '  development system for Claude Code, OpenCode, and Gemini by TÂCHES.\n';

// Parse --config-dir argument
function parseConfigDirArg() {
  const configDirIndex = args.findIndex(arg => arg === '--config-dir' || arg === '-c');
  if (configDirIndex !== -1) {
    const nextArg = args[configDirIndex + 1];
    // Error if --config-dir is provided without a value or next arg is another flag
    if (!nextArg || nextArg.startsWith('-')) {
      console.error(`  ${yellow}--config-dir requires a path argument${reset}`);
      process.exit(1);
    }
    return nextArg;
  }
  // Also handle --config-dir=value format
  const configDirArg = args.find(arg => arg.startsWith('--config-dir=') || arg.startsWith('-c='));
  if (configDirArg) {
    const value = configDirArg.split('=')[1];
    if (!value) {
      console.error(`  ${yellow}--config-dir requires a non-empty path${reset}`);
      process.exit(1);
    }
    return value;
  }
  return null;
}
const explicitConfigDir = parseConfigDirArg();
const hasHelp = args.includes('--help') || args.includes('-h');
const forceStatusline = args.includes('--force-statusline');
const forceInstall = args.includes('--force');

console.log(banner);

// Show help if requested
if (hasHelp) {
  console.log(`  ${yellow}Usage:${reset} npx get-shit-done-cc [options]\n\n  ${yellow}Options:${reset}\n    ${cyan}-g, --global${reset}              Install globally (to config directory)\n    ${cyan}-l, --local${reset}               Install locally (to current directory)\n    ${cyan}--claude${reset}                  Install for Claude Code only\n    ${cyan}--opencode${reset}                Install for OpenCode only\n    ${cyan}--gemini${reset}                  Install for Gemini only\n    ${cyan}--roocode${reset}                 Install for RooCode only\n    ${cyan}--all${reset}                     Install for all runtimes\n    ${cyan}-u, --uninstall${reset}           Uninstall GSD (remove all GSD files)\n    ${cyan}-c, --config-dir <path>${reset}   Specify custom config directory\n    ${cyan}-h, --help${reset}                Show this help message\n    ${cyan}--force-statusline${reset}        Replace existing statusline config\n    ${cyan}--force${reset}                   Bypass validation errors (RooCode)\n\n  ${yellow}Examples:${reset}\n    ${dim}# Interactive install (prompts for runtime and location)${reset}\n    npx get-shit-done-cc\n\n    ${dim}# Install for Claude Code globally${reset}\n    npx get-shit-done-cc --claude --global\n\n    ${dim}# Install for Gemini globally${reset}\n    npx get-shit-done-cc --gemini --global\n\n    ${dim}# Install for all runtimes globally${reset}\n    npx get-shit-done-cc --all --global\n\n    ${dim}# Install for RooCode globally${reset}\n    npx get-shit-done-cc --roocode --global\n\n    ${dim}# Install to custom config directory${reset}\n    npx get-shit-done-cc --claude --global --config-dir ~/.claude-bc\n\n    ${dim}# Install to current project only${reset}\n    npx get-shit-done-cc --claude --local\n\n    ${dim}# Uninstall GSD from Claude Code globally${reset}\n    npx get-shit-done-cc --claude --global --uninstall\n\n  ${yellow}Notes:${reset}\n    The --config-dir option is useful when you have multiple configurations.\n    It takes priority over CLAUDE_CONFIG_DIR / GEMINI_CONFIG_DIR environment variables.\n`);
  process.exit(0);
}

/**
 * Expand ~ to home directory (shell doesn't expand in env vars passed to node)
 */
function expandTilde(filePath) {
  if (filePath && filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Build a hook command path using forward slashes for cross-platform compatibility.
 * On Windows, $HOME is not expanded by cmd.exe/PowerShell, so we use the actual path.
 */
function buildHookCommand(configDir, hookName) {
  // Use forward slashes for Node.js compatibility on all platforms
  const hooksPath = configDir.replace(/\\/g, '/') + '/hooks/' + hookName;
  return `node "${hooksPath}"`;
}

/**
 * Read and parse settings.json, returning empty object if it doesn't exist
 */
function readSettings(settingsPath) {
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

/**
 * Write settings.json with proper formatting
 */
function writeSettings(settingsPath, settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

// Cache for attribution settings (populated once per runtime during install)
const attributionCache = new Map();

// Global RooCode validation results tracking
let roocodeValidationResults = null;

/**
 * Get commit attribution setting for a runtime
 * @param {string} runtime - 'claude', 'opencode', or 'gemini'
 * @returns {null|undefined|string} null = remove, undefined = keep default, string = custom
 */
function getCommitAttribution(runtime) {
  // Return cached value if available
  if (attributionCache.has(runtime)) {
    return attributionCache.get(runtime);
  }

  let result;

  if (runtime === 'opencode') {
    const config = readSettings(path.join(getGlobalDir('opencode', null), 'opencode.json'));
    result = config.disable_ai_attribution === true ? null : undefined;
  } else if (runtime === 'gemini') {
    // Gemini: check gemini settings.json for attribution config
    const settings = readSettings(path.join(getGlobalDir('gemini', explicitConfigDir), 'settings.json'));
    if (!settings.attribution || settings.attribution.commit === undefined) {
      result = undefined;
    } else if (settings.attribution.commit === '') {
      result = null;
    } else {
      result = settings.attribution.commit;
    }
  } else {
    // Claude Code
    const settings = readSettings(path.join(getGlobalDir('claude', explicitConfigDir), 'settings.json'));
    if (!settings.attribution || settings.attribution.commit === undefined) {
      result = undefined;
    } else if (settings.attribution.commit === '') {
      result = null;
    } else {
      result = settings.attribution.commit;
    }
  }

  // Cache and return
  attributionCache.set(runtime, result);
  return result;
}

/**
 * Process Co-Authored-By lines based on attribution setting
 * @param {string} content - File content to process
 * @param {null|undefined|string} attribution - null=remove, undefined=keep, string=replace
 * @returns {string} Processed content
 */
function processAttribution(content, attribution) {
  if (attribution === null) {
    // Remove Co-Authored-By lines and the preceding blank line
    return content.replace(/(\r?\n){2}Co-Authored-By:.*$/gim, '');
  }
  if (attribution === undefined) {
    return content;
  }
  // Replace with custom attribution (escape $ to prevent backreference injection)
  const safeAttribution = attribution.replace(/\$/g, '$$$$');
  return content.replace(/Co-Authored-By:.*$/gim, `Co-Authored-By: ${safeAttribution}`);
}

/**
 * Convert Claude Code frontmatter to opencode format
 * - Converts 'allowed-tools:' array to 'permission:' object
 * @param {string} content - Markdown file content with YAML frontmatter
 * @returns {string} - Content with converted frontmatter
 */
// Color name to hex mapping for opencode compatibility
const colorNameToHex = {
  cyan: '#00FFFF',
  red: '#FF0000',
  green: '#00FF00',
  blue: '#0000FF',
  yellow: '#FFFF00',
  magenta: '#FF00FF',
  orange: '#FFA500',
  purple: '#800080',
  pink: '#FFC0CB',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#808080',
  grey: '#808080',
};

// Tool name mapping from Claude Code to OpenCode
// OpenCode uses lowercase tool names; special mappings for renamed tools
const claudeToOpencodeTools = {
  AskUserQuestion: 'question',
  SlashCommand: 'skill',
  TodoWrite: 'todowrite',
  WebFetch: 'webfetch',
  WebSearch: 'websearch',  // Plugin/MCP - keep for compatibility
};

// Tool name mapping from Claude Code to Gemini CLI
// Gemini CLI uses snake_case built-in tool names
const claudeToGeminiTools = {
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'replace',
  Bash: 'run_shell_command',
  Glob: 'glob',
  Grep: 'search_file_content',
  WebSearch: 'google_web_search',
  WebFetch: 'web_fetch',
  TodoWrite: 'write_todos',
  AskUserQuestion: 'ask_user',
};

/**
 * Convert a Claude Code tool name to OpenCode format
 * - Applies special mappings (AskUserQuestion -> question, etc.)
 * - Converts to lowercase (except MCP tools which keep their format)
 */
function convertToolName(claudeTool) {
  // Check for special mapping first
  if (claudeToOpencodeTools[claudeTool]) {
    return claudeToOpencodeTools[claudeTool];
  }
  // MCP tools (mcp__*) keep their format
  if (claudeTool.startsWith('mcp__')) {
    return claudeTool;
  }
  // Default: convert to lowercase
  return claudeTool.toLowerCase();
}

/**
 * Convert a Claude Code tool name to Gemini CLI format
 * - Applies Claude→Gemini mapping (Read→read_file, Bash→run_shell_command, etc.)
 * - Filters out MCP tools (mcp__*) — they are auto-discovered at runtime in Gemini
 * - Filters out Task — agents are auto-registered as tools in Gemini
 * @returns {string|null} Gemini tool name, or null if tool should be excluded
 */
function convertGeminiToolName(claudeTool) {
  // MCP tools: exclude — auto-discovered from mcpServers config at runtime
  if (claudeTool.startsWith('mcp__')) {
    return null;
  }
  // Task: exclude — agents are auto-registered as callable tools
  if (claudeTool === 'Task') {
    return null;
  }
  // Check for explicit mapping
  if (claudeToGeminiTools[claudeTool]) {
    return claudeToGeminiTools[claudeTool];
  }
  // Default: lowercase
  return claudeTool.toLowerCase();
}

/**
 * Strip HTML <sub> tags for Gemini CLI output
 * Terminals don't support subscript — Gemini renders these as raw HTML.
 * Converts <sub>text</sub> to italic *(text)* for readable terminal output.
 */
function stripSubTags(content) {
  return content.replace(/<sub>(.*?)<\/sub>/g, '*($1)*');
}

/**
 * Convert Claude Code agent frontmatter to Gemini CLI format
 * Gemini agents use .md files with YAML frontmatter, same as Claude,
 * but with different field names and formats:
 * - tools: must be a YAML array (not comma-separated string)
 * - tool names: must use Gemini built-in names (read_file, not Read)
 * - color: must be removed (causes validation error)
 * - mcp__* tools: must be excluded (auto-discovered at runtime)
 */
function convertClaudeToGeminiAgent(content) {
  if (!content.startsWith('---')) return content;

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return content;

  const frontmatter = content.substring(3, endIndex).trim();
  const body = content.substring(endIndex + 3);

  const lines = frontmatter.split('\n');
  const newLines = [];
  let inAllowedTools = false;
  const tools = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Convert allowed-tools YAML array to tools list
    if (trimmed.startsWith('allowed-tools:')) {
      inAllowedTools = true;
      continue;
    }

    // Handle inline tools: field (comma-separated string)
    if (trimmed.startsWith('tools:')) {
      const toolsValue = trimmed.substring(6).trim();
      if (toolsValue) {
        const parsed = toolsValue.split(',').map(t => t.trim()).filter(t => t);
        for (const t of parsed) {
          const mapped = convertGeminiToolName(t);
          if (mapped) tools.push(mapped);
        }
      } else {
        // tools: with no value means YAML array follows
        inAllowedTools = true;
      }
      continue;
    }

    // Strip color field (not supported by Gemini CLI, causes validation error)
    if (trimmed.startsWith('color:')) continue;

    // Collect allowed-tools/tools array items
    if (inAllowedTools) {
      if (trimmed.startsWith('- ')) {
        const mapped = convertGeminiToolName(trimmed.substring(2).trim());
        if (mapped) tools.push(mapped);
        continue;
      } else if (trimmed && !trimmed.startsWith('-')) {
        inAllowedTools = false;
      }
    }

    if (!inAllowedTools) {
      newLines.push(line);
    }
  }

  // Add tools as YAML array (Gemini requires array format)
  if (tools.length > 0) {
    newLines.push('tools:');
    for (const tool of tools) {
      newLines.push(`  - ${tool}`);
    }
  }

  const newFrontmatter = newLines.join('\n').trim();
  return `---\n${newFrontmatter}\n---${stripSubTags(body)}`;
}

/**
 * Validate RooCode color value
 * RooCode accepts: named colors (cyan, yellow, green, red, blue, etc.)
 * and hex values (#RGB or #RRGGBB)
 * @param {string} color - Color value to validate
 * @returns {boolean} - True if valid
 */
function isValidRoocodeColor(color) {
  if (!color) return false;

  const colorLower = color.toLowerCase().trim();

  // Named colors (common terminal colors)
  const namedColors = [
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'bright-black', 'bright-red', 'bright-green', 'bright-yellow',
    'bright-blue', 'bright-magenta', 'bright-cyan', 'bright-white',
    'gray', 'grey', 'orange', 'purple', 'pink'
  ];

  if (namedColors.includes(colorLower)) return true;

  // Hex format (#RGB or #RRGGBB)
  if (/^#[0-9a-f]{3}$/i.test(colorLower) ||
      /^#[0-9a-f]{6}$/i.test(colorLower)) {
    return true;
  }

  return false;
}

/**
 * Parse YAML frontmatter string into a fields object
 * Simple line-by-line parser sufficient for our flat key-value structure
 * @param {string} frontmatter - Frontmatter content (between --- markers)
 * @returns {Object} - Parsed fields object
 */
function parseFrontmatterToFields(frontmatter) {
  const fields = {};
  const lines = frontmatter.split('\n');
  let inArray = false;
  let currentArray = null;
  let currentArrayKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Handle array items (- value)
    if (trimmed.startsWith('- ')) {
      if (currentArrayKey) {
        if (!fields[currentArrayKey]) {
          fields[currentArrayKey] = [];
        }
        fields[currentArrayKey].push(trimmed.substring(2).trim());
      }
      continue;
    }

    // Reset array state on non-array line
    currentArrayKey = null;

    // Handle key: value pairs
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      // Check if this starts an array (key: with no value or just whitespace)
      if (!value || value === '' || value === '|') {
        currentArrayKey = key;
        continue;
      }

      // Remove quotes if present
      fields[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return fields;
}

/**
 * Validate RooCode frontmatter fields
 * @param {Object} fields - Parsed frontmatter fields
 * @param {string} type - 'command' or 'agent'
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
function validateRoocodeFrontmatter(fields, type) {
  const errors = [];
  const warnings = [];

  if (type === 'command') {
    // Commands require: description
    if (!fields.description || typeof fields.description !== 'string') {
      errors.push('Commands require "description" field (string)');
    }

    // Commands should NOT have agent-specific fields (warnings only, already dropped)
    if (fields.name) {
      warnings.push('Commands should not have "name" field (use filename instead)');
    }
    if (fields['allowed-tools']) {
      warnings.push('Commands should not have "allowed-tools" field');
    }
    if (fields.color) {
      warnings.push('Commands should not have "color" field');
    }

    // Check for other unknown fields
    const knownCommandFields = ['description', 'original_path', 'name', 'allowed-tools', 'color', 'argument-hint', 'agent', 'version', 'tools'];
    for (const key of Object.keys(fields)) {
      if (!knownCommandFields.includes(key)) {
        warnings.push(`Unknown field in command: "${key}"`);
      }
    }

  } else if (type === 'agent') {
    // Agents require: name, description, allowed-tools
    if (!fields.name || typeof fields.name !== 'string') {
      errors.push('Agents require "name" field (string)');
    }
    if (!fields.description || typeof fields.description !== 'string') {
      errors.push('Agents require "description" field (string)');
    }
    if (!fields['allowed-tools'] || !Array.isArray(fields['allowed-tools'])) {
      errors.push('Agents require "allowed-tools" field (array)');
    }

    // Optional: validate color if present
    if (fields.color && !isValidRoocodeColor(fields.color)) {
      errors.push(`Invalid color "${fields.color}" (use named color or hex)`);
    }

    // Check for unknown fields (excluding known metadata)
    const knownAgentFields = ['name', 'description', 'allowed-tools', 'color', 'version', 'original_path', 'argument-hint', 'tools'];
    for (const key of Object.keys(fields)) {
      if (!knownAgentFields.includes(key)) {
        warnings.push(`Unknown field in agent: "${key}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Convert Claude Code frontmatter to RooCode format
 * - Commands: keep only 'description'
 * - Agents: keep 'name', 'description', 'allowed-tools', 'color', 'version'
 * - Tool names: NO conversion (RooCode uses identical names)
 * @param {string} content - Markdown file content with YAML frontmatter
 * @param {string} type - 'command' or 'agent'
 * @returns {string} - Content with converted frontmatter
 */
function convertClaudeToRoocodeFrontmatter(content, type) {
  if (!content.startsWith('---')) return content;

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return content;

  const frontmatter = content.substring(3, endIndex).trim();
  const body = content.substring(endIndex + 3);

  const lines = frontmatter.split('\n');
  const newLines = [];

  let inAllowedTools = false;
  const allowedTools = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Fields to ALWAYS drop (Claude-specific, no RooCode equivalent)
    // Silently drop these fields - expected behavior during conversion
    if (trimmed.startsWith('argument-hint:') ||
        trimmed.startsWith('agent:')) {
      continue;
    }

    // Handle different types
    if (type === 'command') {
      // Commands: keep ONLY 'description', drop everything else
      if (trimmed.startsWith('description:')) {
        // Replace /gsd: with /gsd- in description value
        const descValue = trimmed.substring(12).trim().replace(/^["']|["']$/g, '');
        const convertedDesc = descValue.replace(/\/gsd:/g, '/gsd-');
        newLines.push(`description: ${convertedDesc}`);
      } else if (trimmed.startsWith('name:') ||
                 trimmed.startsWith('allowed-tools:') ||
                 trimmed.startsWith('tools:') ||
                 trimmed.startsWith('color:')) {
        // Silently drop command-specific fields
        continue;
      }
      // Preserve original_path if present
      if (trimmed.startsWith('original_path:')) {
        newLines.push(line);
      }

    } else if (type === 'agent') {
      // Agents: keep 'name', 'description', 'allowed-tools', 'color', 'version'

      // Detect start of allowed-tools array
      if (trimmed.startsWith('allowed-tools:')) {
        inAllowedTools = true;
        newLines.push(line);
        continue;
      }

      // Handle inline tools: field (comma-separated)
      if (trimmed.startsWith('tools:')) {
        const toolsValue = trimmed.substring(6).trim();
        if (toolsValue) {
          const parsed = toolsValue.split(',').map(t => t.trim()).filter(t => t);
          // NO tool name conversion for RooCode - names are identical
          allowedTools.push(...parsed);
        } else {
          inAllowedTools = true;
        }
        continue;
      }

      // Collect allowed-tools array items (NO name conversion)
      if (inAllowedTools) {
        if (trimmed.startsWith('- ')) {
          allowedTools.push(trimmed.substring(2).trim());
          continue;
        } else if (trimmed && !trimmed.startsWith('-')) {
          inAllowedTools = false;
        }
      }

      // Keep agent fields - replace /gsd: with /gsd- in description value
      if (trimmed.startsWith('name:') ||
          trimmed.startsWith('color:') ||
          trimmed.startsWith('version:') ||
          trimmed.startsWith('original_path:')) {
        newLines.push(line);
        continue;
      }

      // Handle description field separately to replace /gsd:
      if (trimmed.startsWith('description:')) {
        const descValue = trimmed.substring(12).trim().replace(/^["']|["']$/g, '');
        const convertedDesc = descValue.replace(/\/gsd:/g, '/gsd-');
        newLines.push(`description: ${convertedDesc}`);
        continue;
      }

      // Drop command-specific fields from agents (silently - expected behavior)
      if (trimmed.startsWith('argument-hint:') ||
          trimmed.startsWith('agent:')) {
        continue;
      }

      // Other fields - pass through but warn about unknown fields
      // We'll validate in the validation function
      if (!inAllowedTools) {
        newLines.push(line);
      }
    }
  }

  // For agents: add allowed-tools if we collected any from 'tools:' field
  if (type === 'agent' && allowedTools.length > 0) {
    // Check if allowed-tools already exists
    const hasAllowedTools = newLines.some(line => line.trim().startsWith('allowed-tools:'));
    if (!hasAllowedTools) {
      newLines.push('allowed-tools:');
      for (const tool of allowedTools) {
        newLines.push(`  - ${tool}`);
      }
    }
  }

  const newFrontmatter = newLines.join('\n').trim();

  // Replace /gsd: with /gsd- in body content for flat command structure
  const convertedBody = body.replace(/\/gsd:/g, '/gsd-');

  return `---\n${newFrontmatter}\n---${convertedBody}`;
}

function convertClaudeToOpencodeFrontmatter(content) {
  // Replace tool name references in content (applies to all files)
  let convertedContent = content;
  convertedContent = convertedContent.replace(/\bAskUserQuestion\b/g, 'question');
  convertedContent = convertedContent.replace(/\bSlashCommand\b/g, 'skill');
  convertedContent = convertedContent.replace(/\bTodoWrite\b/g, 'todowrite');
  // Replace /gsd:command with /gsd-command for opencode (flat command structure)
  convertedContent = convertedContent.replace(/\/gsd:/g, '/gsd-');
  // Replace ~/.claude with ~/.config/opencode (OpenCode's correct config location)
  convertedContent = convertedContent.replace(/~\/\.claude\b/g, '~/.config/opencode');

  // Check if content has frontmatter
  if (!convertedContent.startsWith('---')) {
    return convertedContent;
  }

  // Find the end of frontmatter
  const endIndex = convertedContent.indexOf('---', 3);
  if (endIndex === -1) {
    return convertedContent;
  }

  const frontmatter = convertedContent.substring(3, endIndex).trim();
  const body = convertedContent.substring(endIndex + 3);

  // Parse frontmatter line by line (simple YAML parsing)
  const lines = frontmatter.split('\n');
  const newLines = [];
  let inAllowedTools = false;
  const allowedTools = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect start of allowed-tools array
    if (trimmed.startsWith('allowed-tools:')) {
      inAllowedTools = true;
      continue;
    }

    // Detect inline tools: field (comma-separated string)
    if (trimmed.startsWith('tools:')) {
      const toolsValue = trimmed.substring(6).trim();
      if (toolsValue) {
        // Parse comma-separated tools
        const tools = toolsValue.split(',').map(t => t.trim()).filter(t => t);
        allowedTools.push(...tools);
      }
      continue;
    }

    // Remove name: field - opencode uses filename for command name
    if (trimmed.startsWith('name:')) {
      continue;
    }

    // Convert color names to hex for opencode
    if (trimmed.startsWith('color:')) {
      const colorValue = trimmed.substring(6).trim().toLowerCase();
      const hexColor = colorNameToHex[colorValue];
      if (hexColor) {
        newLines.push(`color: "${hexColor}"`);
      } else if (colorValue.startsWith('#')) {
        // Validate hex color format (#RGB or #RRGGBB)
        if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(colorValue)) {
          // Already hex and valid, keep as is
          newLines.push(line);
        }
        // Skip invalid hex colors
      }
      // Skip unknown color names
      continue;
    }

    // Collect allowed-tools items
    if (inAllowedTools) {
      if (trimmed.startsWith('- ')) {
        allowedTools.push(trimmed.substring(2).trim());
        continue;
      } else if (trimmed && !trimmed.startsWith('-')) {
        // End of array, new field started
        inAllowedTools = false;
      }
    }

    // Keep other fields (including name: which opencode ignores)
    if (!inAllowedTools) {
      newLines.push(line);
    }
  }

  // Add tools object if we had allowed-tools or tools
  if (allowedTools.length > 0) {
    newLines.push('tools:');
    for (const tool of allowedTools) {
      newLines.push(`  ${convertToolName(tool)}: true`);
    }
  }

  // Rebuild frontmatter (body already has tool names converted)
  const newFrontmatter = newLines.join('\n').trim();
  return `---\n${newFrontmatter}\n---${body}`;
}

/**
 * Convert Claude Code markdown command to Gemini TOML format
 * @param {string} content - Markdown file content with YAML frontmatter
 * @returns {string} - TOML content
 */
function convertClaudeToGeminiToml(content) {
  // Check if content has frontmatter
  if (!content.startsWith('---')) {
    return `prompt = ${JSON.stringify(content)}\n`;
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return `prompt = ${JSON.stringify(content)}\n`;
  }

  const frontmatter = content.substring(3, endIndex).trim();
  const body = content.substring(endIndex + 3).trim();

  // Extract description from frontmatter
  let description = '';
  const lines = frontmatter.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('description:')) {
      description = trimmed.substring(12).trim();
      break;
    }
  }

  // Construct TOML
  let toml = '';
  if (description) {
    toml += `description = ${JSON.stringify(description)}\n`;
  }

  toml += `prompt = ${JSON.stringify(body)}\n`;

  return toml;
}

/**
 * Copy commands to a flat structure for OpenCode/RooCode
 * OpenCode expects: command/gsd-help.md (invoked as /gsd-help)
 * RooCode expects: commands/gsd-help.md (invoked as /gsd-help)
 * Source structure: commands/gsd/help.md
 *
 * Detects naming conflicts when multiple source files flatten to the same target name.
 * Conflict detection is case-insensitive for cross-platform safety (Windows compatibility).
 *
 * @param {string} srcDir - Source directory (e.g., commands/gsd/)
 * @param {string} destDir - Destination directory (e.g., command/ or commands/)
 * @param {string} prefix - Prefix for filenames (e.g., 'gsd')
 * @param {string} pathPrefix - Path prefix for file references
 * @param {string} runtime - Target runtime ('claude', 'opencode', or 'roocode')
 * @param {Map<string, string>} conflictTracker - Tracks destName → srcPath across recursion
 */
function copyFlattenedCommands(srcDir, destDir, prefix, pathPrefix, runtime, conflictTracker = new Map()) {
  if (!fs.existsSync(srcDir)) {
    return;
  }

  // Remove old gsd-*.md files before copying new ones
  if (fs.existsSync(destDir)) {
    for (const file of fs.readdirSync(destDir)) {
      if (file.startsWith(`${prefix}-`) && file.endsWith('.md')) {
        fs.unlinkSync(path.join(destDir, file));
      }
    }
  } else {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories, adding to prefix
      // e.g., commands/gsd/debug/start.md -> command/gsd-debug-start.md
      copyFlattenedCommands(srcPath, destDir, `${prefix}-${entry.name}`, pathPrefix, runtime, conflictTracker);
    } else if (entry.name.endsWith('.md')) {
      // Flatten: help.md -> gsd-help.md
      const baseName = entry.name.replace('.md', '');
      const destName = `${prefix}-${baseName}.md`;
      const destPath = path.join(destDir, destName);

      // Detect naming conflicts (case-insensitive for Windows compatibility)
      const destNameLower = destName.toLowerCase();
      if (conflictTracker.has(destNameLower)) {
        const existingSource = conflictTracker.get(destNameLower);
        const srcPathFromRepo = path.relative(process.cwd(), srcPath);
        const existingPathFromRepo = path.relative(process.cwd(), existingSource);
        console.error(`\n  ${red}✗ Naming conflict detected:${reset}`);
        console.error(`    ${red}Source 1:${reset} ${existingPathFromRepo}`);
        console.error(`    ${red}Source 2:${reset} ${srcPathFromRepo}`);
        console.error(`    ${red}Both flatten to:${reset} ${destName}`);
        console.error(`    ${red}Action:${reset} Rename one of the source files or restructure directories\n`);
        process.exit(1);
      }

      // Track this flattened name
      conflictTracker.set(destNameLower, srcPath);

      let content = fs.readFileSync(srcPath, 'utf8');
      const claudeDirRegex = /~\/\.claude\//g;
      const opencodeDirRegex = /~\/\.opencode\//g;
      const roocodeDirRegex = /~\/\.roo\//g;
      content = content.replace(claudeDirRegex, pathPrefix);
      content = content.replace(opencodeDirRegex, pathPrefix);
      content = content.replace(roocodeDirRegex, pathPrefix);
      content = processAttribution(content, getCommitAttribution(runtime));

      // Convert frontmatter based on runtime
      if (runtime === 'opencode') {
        content = convertClaudeToOpencodeFrontmatter(content);
      } else if (runtime === 'roocode') {
        // Quick pre-check: verify file has frontmatter
        if (!content.startsWith('---')) {
          console.warn(`  ${yellow}⚠${reset} No frontmatter in ${entry.name}, skipping conversion`);
        } else {
          // Inject original_path before converting for traceability
          const srcPathFromRepo = path.relative(path.join(__dirname, '..'), srcPath);
          content = content.replace(/---\n/, `---\noriginal_path: ${srcPathFromRepo}\n`);
          content = convertClaudeToRoocodeFrontmatter(content, 'command');

          // Post-conversion validation: parse converted frontmatter and validate
          const convertedEndIndex = content.indexOf('---', 3);
          if (convertedEndIndex !== -1) {
            const convertedFrontmatter = content.substring(3, convertedEndIndex).trim();
            const fields = parseFrontmatterToFields(convertedFrontmatter);
            const validation = validateRoocodeFrontmatter(fields, 'command');

            // Track validation for summary (will be collected globally)
            if (!roocodeValidationResults) {
              roocodeValidationResults = { errors: [], warnings: [], files: [] };
            }
            roocodeValidationResults.files.push(destName);
            roocodeValidationResults.warnings.push(...validation.warnings.map(w => `${destName}: ${w}`));

            // Fail on critical errors
            if (validation.errors.length > 0) {
              roocodeValidationResults.errors.push(...validation.errors.map(e => `${destName}: ${e}`));
              console.error(`  ${red}✗${reset} Validation errors in ${cyan}${destName}${reset}:`);
              for (const error of validation.errors) {
                console.error(`    ${red}  -${reset} ${error}`);
              }
            }
          }
        }
      }

      fs.writeFileSync(destPath, content);
    }
  }
}

/**
 * Recursively copy directory, replacing paths in .md files
 * Deletes existing destDir first to remove orphaned files from previous versions
 * @param {string} srcDir - Source directory
 * @param {string} destDir - Destination directory
 * @param {string} pathPrefix - Path prefix for file references
 * @param {string} runtime - Target runtime ('claude', 'opencode', 'gemini')
 */
function copyWithPathReplacement(srcDir, destDir, pathPrefix, runtime) {
  const isOpencode = runtime === 'opencode';
  const dirName = getDirName(runtime);

  // Clean install: remove existing destination to prevent orphaned files
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithPathReplacement(srcPath, destPath, pathPrefix, runtime);
    } else if (entry.name.endsWith('.md')) {
      // Always replace ~/.claude/ as it is the source of truth in the repo
      let content = fs.readFileSync(srcPath, 'utf8');
      const claudeDirRegex = /~\/\.claude\//g;
      content = content.replace(claudeDirRegex, pathPrefix);
      content = processAttribution(content, getCommitAttribution(runtime));

      // Convert frontmatter for opencode compatibility
      if (isOpencode) {
        content = convertClaudeToOpencodeFrontmatter(content);
        fs.writeFileSync(destPath, content);
      } else if (runtime === 'gemini') {
        // Convert to TOML for Gemini (strip <sub> tags — terminals can't render subscript)
        content = stripSubTags(content);
        const tomlContent = convertClaudeToGeminiToml(content);
        // Replace extension with .toml
        const tomlPath = destPath.replace(/\.md$/, '.toml');
        fs.writeFileSync(tomlPath, tomlContent);
      } else {
        fs.writeFileSync(destPath, content);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Clean up orphaned files from previous GSD versions
 */
function cleanupOrphanedFiles(configDir) {
  const orphanedFiles = [
    'hooks/gsd-notify.sh',  // Removed in v1.6.x
    'hooks/statusline.js',  // Renamed to gsd-statusline.js in v1.9.0
  ];

  for (const relPath of orphanedFiles) {
    const fullPath = path.join(configDir, relPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ${green}✓${reset} Removed orphaned ${relPath}`);
    }
  }
}

/**
 * Clean up orphaned hook registrations from settings.json
 */
function cleanupOrphanedHooks(settings) {
  const orphanedHookPatterns = [
    'gsd-notify.sh',  // Removed in v1.6.x
    'hooks/statusline.js',  // Renamed to gsd-statusline.js in v1.9.0
    'gsd-intel-index.js',  // Removed in v1.9.2
    'gsd-intel-session.js',  // Removed in v1.9.2
    'gsd-intel-prune.js',  // Removed in v1.9.2
  ];

  let cleanedHooks = false;

  // Check all hook event types (Stop, SessionStart, etc.)
  if (settings.hooks) {
    for (const eventType of Object.keys(settings.hooks)) {
      const hookEntries = settings.hooks[eventType];
      if (Array.isArray(hookEntries)) {
        // Filter out entries that contain orphaned hooks
        const filtered = hookEntries.filter(entry => {
          if (entry.hooks && Array.isArray(entry.hooks)) {
            // Check if any hook in this entry matches orphaned patterns
            const hasOrphaned = entry.hooks.some(h =>
              h.command && orphanedHookPatterns.some(pattern => h.command.includes(pattern))
            );
            if (hasOrphaned) {
              cleanedHooks = true;
              return false;  // Remove this entry
            }
          }
          return true;  // Keep this entry
        });
        settings.hooks[eventType] = filtered;
      }
    }
  }

  if (cleanedHooks) {
    console.log(`  ${green}✓${reset} Removed orphaned hook registrations`);
  }

  // Fix #330: Update statusLine if it points to old statusline.js path
  if (settings.statusLine && settings.statusLine.command &&
      settings.statusLine.command.includes('statusline.js') &&
      !settings.statusLine.command.includes('gsd-statusline.js')) {
    // Replace old path with new path
    settings.statusLine.command = settings.statusLine.command.replace(
      /statusline\.js/,
      'gsd-statusline.js'
    );
    console.log(`  ${green}✓${reset} Updated statusline path (statusline.js → gsd-statusline.js)`);
  }

  return settings;
}

/**
 * Uninstall GSD from the specified directory for a specific runtime
 * Removes only GSD-specific files/directories, preserves user content
 * @param {boolean} isGlobal - Whether to uninstall from global or local
 * @param {string} runtime - Target runtime ('claude', 'opencode', 'gemini')
 */
function uninstall(isGlobal, runtime = 'claude') {
  const isOpencode = runtime === 'opencode';
  const dirName = getDirName(runtime);

  // Get the target directory based on runtime and install type
  const targetDir = isGlobal
    ? getGlobalDir(runtime, explicitConfigDir)
    : path.join(process.cwd(), dirName);

  const locationLabel = isGlobal
    ? targetDir.replace(os.homedir(), '~')
    : targetDir.replace(process.cwd(), '.');

  let runtimeLabel = 'Claude Code';
  if (runtime === 'opencode') runtimeLabel = 'OpenCode';
  if (runtime === 'gemini') runtimeLabel = 'Gemini';
  if (runtime === 'roocode') runtimeLabel = 'RooCode';

  console.log(`  Uninstalling GSD from ${cyan}${runtimeLabel}${reset} at ${cyan}${locationLabel}${reset}\n`);

  // Check if target directory exists
  if (!fs.existsSync(targetDir)) {
    console.log(`  ${yellow}⚠${reset} Directory does not exist: ${locationLabel}`);
    console.log(`  Nothing to uninstall.\n`);
    return;
  }

  let removedCount = 0;

  // 1. Remove GSD commands directory
  if (isOpencode) {
    // OpenCode: remove command/gsd-*.md files
    const commandDir = path.join(targetDir, 'command');
    if (fs.existsSync(commandDir)) {
      const files = fs.readdirSync(commandDir);
      for (const file of files) {
        if (file.startsWith('gsd-') && file.endsWith('.md')) {
          fs.unlinkSync(path.join(commandDir, file));
          removedCount++;
        }
      }
      console.log(`  ${green}✓${reset} Removed GSD commands from command/`);
    }
  } else {
    // Claude Code & Gemini: remove commands/gsd/ directory
    const gsdCommandsDir = path.join(targetDir, 'commands', 'gsd');
    if (fs.existsSync(gsdCommandsDir)) {
      fs.rmSync(gsdCommandsDir, { recursive: true });
      removedCount++;
      console.log(`  ${green}✓${reset} Removed commands/gsd/`);
    }
  }

  // 2. Remove get-shit-done directory
  const gsdDir = path.join(targetDir, 'get-shit-done');
  if (fs.existsSync(gsdDir)) {
    fs.rmSync(gsdDir, { recursive: true });
    removedCount++;
    console.log(`  ${green}✓${reset} Removed get-shit-done/`);
  }

  // 3. Remove GSD agents (gsd-*.md files only)
  const agentsDir = path.join(targetDir, 'agents');
  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir);
    let agentCount = 0;
    for (const file of files) {
      if (file.startsWith('gsd-') && file.endsWith('.md')) {
        fs.unlinkSync(path.join(agentsDir, file));
        agentCount++;
      }
    }
    if (agentCount > 0) {
      removedCount++;
      console.log(`  ${green}✓${reset} Removed ${agentCount} GSD agents`);
    }
  }

  // 4. Remove GSD hooks
  const hooksDir = path.join(targetDir, 'hooks');
  if (fs.existsSync(hooksDir)) {
    const gsdHooks = ['gsd-statusline.js', 'gsd-check-update.js', 'gsd-check-update.sh'];
    let hookCount = 0;
    for (const hook of gsdHooks) {
      const hookPath = path.join(hooksDir, hook);
      if (fs.existsSync(hookPath)) {
        fs.unlinkSync(hookPath);
        hookCount++;
      }
    }
    if (hookCount > 0) {
      removedCount++;
      console.log(`  ${green}✓${reset} Removed ${hookCount} GSD hooks`);
    }
  }

  // 5. Clean up settings.json (remove GSD hooks and statusline)
  const settingsPath = path.join(targetDir, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    let settings = readSettings(settingsPath);
    let settingsModified = false;

    // Remove GSD statusline if it references our hook
    if (settings.statusLine && settings.statusLine.command &&
        settings.statusLine.command.includes('gsd-statusline')) {
      delete settings.statusLine;
      settingsModified = true;
      console.log(`  ${green}✓${reset} Removed GSD statusline from settings`);
    }

    // Remove GSD hooks from SessionStart
    if (settings.hooks && settings.hooks.SessionStart) {
      const before = settings.hooks.SessionStart.length;
      settings.hooks.SessionStart = settings.hooks.SessionStart.filter(entry => {
        if (entry.hooks && Array.isArray(entry.hooks)) {
          // Filter out GSD hooks
          const hasGsdHook = entry.hooks.some(h =>
            h.command && (h.command.includes('gsd-check-update') || h.command.includes('gsd-statusline'))
          );
          return !hasGsdHook;
        }
        return true;
      });
      if (settings.hooks.SessionStart.length < before) {
        settingsModified = true;
        console.log(`  ${green}✓${reset} Removed GSD hooks from settings`);
      }
      // Clean up empty array
      if (settings.hooks.SessionStart.length === 0) {
        delete settings.hooks.SessionStart;
      }
      // Clean up empty hooks object
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
    }

    if (settingsModified) {
      writeSettings(settingsPath, settings);
      removedCount++;
    }
  }

  // 6. For OpenCode, clean up permissions from opencode.json
  if (isOpencode) {
    const opencodeConfigDir = getOpencodeGlobalDir();
    const configPath = path.join(opencodeConfigDir, 'opencode.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        let modified = false;

        // Remove GSD permission entries
        if (config.permission) {
          for (const permType of ['read', 'external_directory']) {
            if (config.permission[permType]) {
              const keys = Object.keys(config.permission[permType]);
              for (const key of keys) {
                if (key.includes('get-shit-done')) {
                  delete config.permission[permType][key];
                  modified = true;
                }
              }
              // Clean up empty objects
              if (Object.keys(config.permission[permType]).length === 0) {
                delete config.permission[permType];
              }
            }
          }
          if (Object.keys(config.permission).length === 0) {
            delete config.permission;
          }
        }

        if (modified) {
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
          removedCount++;
          console.log(`  ${green}✓${reset} Removed GSD permissions from opencode.json`);
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
  }

  if (removedCount === 0) {
    console.log(`  ${yellow}⚠${reset} No GSD files found to remove.`);
  }

  console.log(`
  ${green}Done!${reset} GSD has been uninstalled from ${runtimeLabel}.
  Your other files and settings have been preserved.
`);
}

/**
 * Parse JSONC (JSON with Comments) by stripping comments and trailing commas.
 * OpenCode supports JSONC format via jsonc-parser, so users may have comments.
 * This is a lightweight inline parser to avoid adding dependencies.
 */
function parseJsonc(content) {
  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  // Remove single-line and block comments while preserving strings
  let result = '';
  let inString = false;
  let i = 0;
  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];

    if (inString) {
      result += char;
      // Handle escape sequences
      if (char === '\\' && i + 1 < content.length) {
        result += next;
        i += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      i++;
    } else {
      if (char === '"') {
        inString = true;
        result += char;
        i++;
      } else if (char === '/' && next === '/') {
        // Skip single-line comment until end of line
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
      } else if (char === '/' && next === '*') {
        // Skip block comment
        i += 2;
        while (i < content.length - 1 && !(content[i] === '*' && content[i + 1] === '/')) {
          i++;
        }
        i += 2; // Skip closing */
      } else {
        result += char;
        i++;
      }
    }
  }

  // Remove trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, '$1');

  return JSON.parse(result);
}

/**
 * Configure OpenCode permissions to allow reading GSD reference docs
 * This prevents permission prompts when GSD accesses the get-shit-done directory
 */
function configureOpencodePermissions() {
  // OpenCode config file is at ~/.config/opencode/opencode.json
  const opencodeConfigDir = getOpencodeGlobalDir();
  const configPath = path.join(opencodeConfigDir, 'opencode.json');

  // Ensure config directory exists
  fs.mkdirSync(opencodeConfigDir, { recursive: true });

  // Read existing config or create empty object
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      config = parseJsonc(content);
    } catch (e) {
      // Cannot parse - DO NOT overwrite user's config
      console.log(`  ${yellow}⚠${reset} Could not parse opencode.json - skipping permission config`);
      console.log(`    ${dim}Reason: ${e.message}${reset}`);
      console.log(`    ${dim}Your config was NOT modified. Fix the syntax manually if needed.${reset}`);
      return;
    }
  }

  // Ensure permission structure exists
  if (!config.permission) {
    config.permission = {};
  }

  // Build the GSD path using the actual config directory
  // Use ~ shorthand if it's in the default location, otherwise use full path
  const defaultConfigDir = path.join(os.homedir(), '.config', 'opencode');
  const gsdPath = opencodeConfigDir === defaultConfigDir
    ? '~/.config/opencode/get-shit-done/*'
    : `${opencodeConfigDir.replace(/\\/g, '/')}/get-shit-done/*`;

  let modified = false;

  // Configure read permission
  if (!config.permission.read || typeof config.permission.read !== 'object') {
    config.permission.read = {};
  }
  if (config.permission.read[gsdPath] !== 'allow') {
    config.permission.read[gsdPath] = 'allow';
    modified = true;
  }

  // Configure external_directory permission (the safety guard for paths outside project)
  if (!config.permission.external_directory || typeof config.permission.external_directory !== 'object') {
    config.permission.external_directory = {};
  }
  if (config.permission.external_directory[gsdPath] !== 'allow') {
    config.permission.external_directory[gsdPath] = 'allow';
    modified = true;
  }

  if (!modified) {
    return; // Already configured
  }

  // Write config back
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ${green}✓${reset} Configured read permission for GSD docs`);
}

/**
 * Verify a directory exists and contains files
 */
function verifyInstalled(dirPath, description) {
  if (!fs.existsSync(dirPath)) {
    console.error(`  ${yellow}✗${reset} Failed to install ${description}: directory not created`);
    return false;
  }
  try {
    const entries = fs.readdirSync(dirPath);
    if (entries.length === 0) {
      console.error(`  ${yellow}✗${reset} Failed to install ${description}: directory is empty`);
      return false;
    }
  } catch (e) {
    console.error(`  ${yellow}✗${reset} Failed to install ${description}: ${e.message}`);
    return false;
  }
  return true;
}

/**
 * Verify a file exists
 */
function verifyFileInstalled(filePath, description) {
  if (!fs.existsSync(filePath)) {
    console.error(`  ${yellow}✗${reset} Failed to install ${description}: file not created`);
    return false;
  }
  return true;
}

/**
 * Check if RooCode runtime supports user interaction (AskUserQuestion)
 * @returns {boolean} - true if supported, false otherwise
 *
 * Note: RooCode provides AskUserQuestion natively (verified in Phase 1 research).
 * This check documents the requirement and provides a bypass mechanism.
 *
 * AskUserQuestion is a built-in RooCode tool with identical name to Claude Code.
 * It works for parent commands; agent interaction capability is verified in Phase 8.
 *
 * Detection approach:
 * - Option A: Check for ~/.roo/ directory (indicates RooCode is installed)
 * - Option B: AskUserQuestion availability cannot be detected programmatically
 * - Option C: Document requirement, skip runtime check (assumption-based)
 *
 * Implementation: We document the requirement and assume availability.
 * Actual verification requires testing in RooCode VSCode extension environment.
 */
function checkRoocodeInteractionSupport() {
  // RooCode installation is confirmed by ~/.roo/ directory existence
  // AskUserQuestion is built-in to RooCode (verified from Phase 1 research)

  // Check if RooCode config directory exists
  const roocodeDir = getRoocodeGlobalDir();

  if (!fs.existsSync(roocodeDir)) {
    // RooCode not installed — but this is unlikely since we're installing to it
    // This might be a first-time install scenario
    return true; // Assume available — actual verification happens at runtime
  }

  // RooCode is installed, AskUserQuestion is built-in
  // No additional runtime check needed — tool availability is confirmed at runtime
  return true;
}

/**
 * Install to the specified directory for a specific runtime
 * @param {boolean} isGlobal - Whether to install globally or locally
 * @param {string} runtime - Target runtime ('claude', 'opencode', 'gemini')
 */

// ──────────────────────────────────────────────────────
// Local Patch Persistence
// ──────────────────────────────────────────────────────

const PATCHES_DIR_NAME = 'gsd-local-patches';
const MANIFEST_NAME = 'gsd-file-manifest.json';

/**
 * Compute SHA256 hash of file contents
 */
function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively collect all files in dir with their hashes
 */
function generateManifest(dir, baseDir) {
  if (!baseDir) baseDir = dir;
  const manifest = {};
  if (!fs.existsSync(dir)) return manifest;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      Object.assign(manifest, generateManifest(fullPath, baseDir));
    } else {
      manifest[relPath] = fileHash(fullPath);
    }
  }
  return manifest;
}

/**
 * Write file manifest after installation for future modification detection
 */
function writeManifest(configDir) {
  const gsdDir = path.join(configDir, 'get-shit-done');
  const commandsDir = path.join(configDir, 'commands', 'gsd');
  const agentsDir = path.join(configDir, 'agents');
  const manifest = { version: pkg.version, timestamp: new Date().toISOString(), files: {} };

  const gsdHashes = generateManifest(gsdDir);
  for (const [rel, hash] of Object.entries(gsdHashes)) {
    manifest.files['get-shit-done/' + rel] = hash;
  }
  if (fs.existsSync(commandsDir)) {
    const cmdHashes = generateManifest(commandsDir);
    for (const [rel, hash] of Object.entries(cmdHashes)) {
      manifest.files['commands/gsd/' + rel] = hash;
    }
  }
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (file.startsWith('gsd-') && file.endsWith('.md')) {
        manifest.files['agents/' + file] = fileHash(path.join(agentsDir, file));
      }
    }
  }

  fs.writeFileSync(path.join(configDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Detect user-modified GSD files by comparing against install manifest.
 * Backs up modified files to gsd-local-patches/ for reapply after update.
 */
function saveLocalPatches(configDir) {
  const manifestPath = path.join(configDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return [];

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return []; }

  const patchesDir = path.join(configDir, PATCHES_DIR_NAME);
  const modified = [];

  for (const [relPath, originalHash] of Object.entries(manifest.files || {})) {
    const fullPath = path.join(configDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const currentHash = fileHash(fullPath);
    if (currentHash !== originalHash) {
      const backupPath = path.join(patchesDir, relPath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(fullPath, backupPath);
      modified.push(relPath);
    }
  }

  if (modified.length > 0) {
    const meta = {
      backed_up_at: new Date().toISOString(),
      from_version: manifest.version,
      files: modified
    };
    fs.writeFileSync(path.join(patchesDir, 'backup-meta.json'), JSON.stringify(meta, null, 2));
    console.log('  ' + yellow + 'i' + reset + '  Found ' + modified.length + ' locally modified GSD file(s) — backed up to ' + PATCHES_DIR_NAME + '/');
    for (const f of modified) {
      console.log('     ' + dim + f + reset);
    }
  }
  return modified;
}

/**
 * After install, report backed-up patches for user to reapply.
 */
function reportLocalPatches(configDir) {
  const patchesDir = path.join(configDir, PATCHES_DIR_NAME);
  const metaPath = path.join(patchesDir, 'backup-meta.json');
  if (!fs.existsSync(metaPath)) return [];

  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { return []; }

  if (meta.files && meta.files.length > 0) {
    console.log('');
    console.log('  ' + yellow + 'Local patches detected' + reset + ' (from v' + meta.from_version + '):');
    for (const f of meta.files) {
      console.log('     ' + cyan + f + reset);
    }
    console.log('');
    console.log('  Your modifications are saved in ' + cyan + PATCHES_DIR_NAME + '/' + reset);
    console.log('  Run ' + cyan + '/gsd:reapply-patches' + reset + ' to merge them into the new version.');
    console.log('  Or manually compare and merge the files.');
    console.log('');
  }
  return meta.files || [];
}

function install(isGlobal, runtime = 'claude') {
  const isOpencode = runtime === 'opencode';
  const isGemini = runtime === 'gemini';
  const isRoocode = runtime === 'roocode';
  const dirName = getDirName(runtime);
  const src = path.join(__dirname, '..');

  // Get the target directory based on runtime and install type
  const targetDir = isGlobal
    ? getGlobalDir(runtime, explicitConfigDir)
    : path.join(process.cwd(), dirName);

  const locationLabel = isGlobal
    ? targetDir.replace(os.homedir(), '~')
    : targetDir.replace(process.cwd(), '.');

  // Path prefix for file references in markdown content
  // For global installs: use full path
  // For local installs: use relative
  const pathPrefix = isGlobal
    ? `${targetDir.replace(/\\/g, '/')}/`
    : `./${dirName}/`;

  let runtimeLabel = 'Claude Code';
  if (isOpencode) runtimeLabel = 'OpenCode';
  if (isGemini) runtimeLabel = 'Gemini';
  if (runtime === 'roocode') runtimeLabel = 'RooCode';

  console.log(`  Installing for ${cyan}${runtimeLabel}${reset} to ${cyan}${locationLabel}${reset}\n`);

  // Track installation failures
  const failures = [];

  // Save any locally modified GSD files before they get wiped
  saveLocalPatches(targetDir);

  // Clean up orphaned files from previous versions
  cleanupOrphanedFiles(targetDir);

  // OpenCode & RooCode use flat command structure (command/ or commands/)
  // Claude Code & Gemini use nested structure (commands/gsd/)
  if (isOpencode || isRoocode) {
    // OpenCode: command/ directory, RooCode: commands/ directory
    const commandDirName = isOpencode ? 'command' : 'commands';
    const commandDir = path.join(targetDir, commandDirName);
    fs.mkdirSync(commandDir, { recursive: true });

    // Copy commands/gsd/*.md as gsd-*.md (flatten structure)
    const gsdSrc = path.join(src, 'commands', 'gsd');
    copyFlattenedCommands(gsdSrc, commandDir, 'gsd', pathPrefix, runtime);
    if (verifyInstalled(commandDir, `${commandDirName}/gsd-*`)) {
      const count = fs.readdirSync(commandDir).filter(f => f.startsWith('gsd-')).length;
      console.log(`  ${green}✓${reset} Installed ${count} commands to ${commandDirName}/`);
    } else {
      failures.push(`${commandDirName}/gsd-*`);
    }
  } else {
    // Claude Code & Gemini: nested structure in commands/ directory
    const commandsDir = path.join(targetDir, 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const gsdSrc = path.join(src, 'commands', 'gsd');
    const gsdDest = path.join(commandsDir, 'gsd');
    copyWithPathReplacement(gsdSrc, gsdDest, pathPrefix, runtime);
    if (verifyInstalled(gsdDest, 'commands/gsd')) {
      console.log(`  ${green}✓${reset} Installed commands/gsd`);
    } else {
      failures.push('commands/gsd');
    }
  }

  // Copy get-shit-done skill with path replacement
  const skillSrc = path.join(src, 'get-shit-done');
  const skillDest = path.join(targetDir, 'get-shit-done');
  copyWithPathReplacement(skillSrc, skillDest, pathPrefix, runtime);
  if (verifyInstalled(skillDest, 'get-shit-done')) {
    console.log(`  ${green}✓${reset} Installed get-shit-done`);
  } else {
    failures.push('get-shit-done');
  }

  // Copy agents to agents directory
  const agentsSrc = path.join(src, 'agents');
  if (fs.existsSync(agentsSrc)) {
    const agentsDest = path.join(targetDir, 'agents');
    fs.mkdirSync(agentsDest, { recursive: true });

    // Remove old GSD agents (gsd-*.md) before copying new ones
    if (fs.existsSync(agentsDest)) {
      for (const file of fs.readdirSync(agentsDest)) {
        if (file.startsWith('gsd-') && file.endsWith('.md')) {
          fs.unlinkSync(path.join(agentsDest, file));
        }
      }
    }

    // Copy new agents
    const agentEntries = fs.readdirSync(agentsSrc, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        let content = fs.readFileSync(path.join(agentsSrc, entry.name), 'utf8');
        // Always replace ~/.claude/ as it is the source of truth in the repo
        const dirRegex = /~\/\.claude\//g;
        content = content.replace(dirRegex, pathPrefix);
        content = processAttribution(content, getCommitAttribution(runtime));
        // Convert frontmatter for runtime compatibility
        if (isOpencode) {
          content = convertClaudeToOpencodeFrontmatter(content);
        } else if (isGemini) {
          content = convertClaudeToGeminiAgent(content);
        } else if (isRoocode) {
          content = convertClaudeToRoocodeFrontmatter(content, 'agent');

          // Post-conversion validation for agents
          if (content.startsWith('---')) {
            const convertedEndIndex = content.indexOf('---', 3);
            if (convertedEndIndex !== -1) {
              const convertedFrontmatter = content.substring(3, convertedEndIndex).trim();
              const fields = parseFrontmatterToFields(convertedFrontmatter);
              const validation = validateRoocodeFrontmatter(fields, 'agent');

              // Track validation for summary
              if (!roocodeValidationResults) {
                roocodeValidationResults = { errors: [], warnings: [], files: [] };
              }
              roocodeValidationResults.files.push(entry.name);
              roocodeValidationResults.warnings.push(...validation.warnings.map(w => `${entry.name}: ${w}`));

              // Collect errors for --force flag handling
              if (validation.errors.length > 0) {
                roocodeValidationResults.errors.push(...validation.errors.map(e => `${entry.name}: ${e}`));
                console.error(`  ${red}✗${reset} Validation errors in ${cyan}${entry.name}${reset}:`);
                for (const error of validation.errors) {
                  console.error(`    ${red}  -${reset} ${error}`);
                }
              }
            }
          }
        }
        fs.writeFileSync(path.join(agentsDest, entry.name), content);
      }
    }
    if (verifyInstalled(agentsDest, 'agents')) {
      console.log(`  ${green}✓${reset} Installed agents`);
    } else {
      failures.push('agents');
    }
  }

  // RooCode: Generate .roomodes file and copy agent definitions
  if (isRoocode) {
    const agentsSrc = path.join(src, 'agents');
    if (fs.existsSync(agentsSrc)) {
      // .roomodes goes in project root, not in .roo/ config directory
      // For local installs: project root is parent of targetDir
      // For global installs: place in global config directory (legacy behavior)
      const roomodesDest = isGlobal
        ? path.join(targetDir, '.roomodes')
        : path.join(path.dirname(targetDir), '.roomodes');
      const agentFiles = fs.readdirSync(agentsSrc).filter(f => f.startsWith('gsd-') && f.endsWith('.md'));

      if (agentFiles.length > 0) {
        // Build .roomodes YAML from agent definitions
        let roomodesContent = 'customModes:\n';

        for (const agentFile of agentFiles.sort()) {
          const agentPath = path.join(agentsSrc, agentFile);
          let content = fs.readFileSync(agentPath, 'utf8');

          // Extract roleDefinition from <role>...</role> tag
          let roleDefinition = '';
          const roleMatch = content.match(/<role>([\s\S]*?)<\/role>/);
          if (roleMatch) {
            roleDefinition = roleMatch[1].trim();
            // Replace /gsd: with /gsd- in roleDefinition for RooCode
            roleDefinition = roleDefinition.replace(/\/gsd:/g, '/gsd-');
          }

          // Parse frontmatter for name, description, tools
          let name = agentFile.replace('.md', '');
          let description = '';
          let tools = [];

          if (content.startsWith('---')) {
            const endIndex = content.indexOf('---', 3);
            if (endIndex !== -1) {
              const frontmatter = content.substring(3, endIndex).trim();
              const lines = frontmatter.split('\n');
              let inTools = false;

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('name:')) {
                  name = trimmed.substring(5).trim().replace(/^["']|["']$/g, '');
                } else if (trimmed.startsWith('description:')) {
                  description = trimmed.substring(12).trim().replace(/^["']|["']$/g, '');
                } else if (trimmed.startsWith('tools:')) {
                  const toolsValue = trimmed.substring(6).trim();
                  if (toolsValue) {
                    tools = toolsValue.split(',').map(t => t.trim()).filter(t => t);
                  }
                } else if (trimmed.startsWith('allowed-tools:')) {
                  inTools = true;
                } else if (inTools && trimmed.startsWith('- ')) {
                  tools.push(trimmed.substring(2).trim());
                } else if (inTools && !trimmed.startsWith('-')) {
                  inTools = false;
                }
              }
            }
          }

          // Map agent filename to slug
          const slug = agentFile.replace('.md', '');

          // Map tool names to valid RooCode group names
          // Valid groups: read, edit, browser, command, mcp
          const groupMap = {
            'Read': 'read',
            'Write': 'edit',
            'Edit': 'edit',
            'Bash': 'command',
            'Grep': 'read',      // searching is reading
            'Glob': 'read',      // finding files is reading
            'AskUserQuestion': 'command',  // user interaction is a command
            'Task': 'command',  // spawning tasks is a command
            'TodoWrite': 'edit', // writing todos is editing
          };

          const groups = tools.map(t => groupMap[t] || 'read').filter((v, i, a) => a.indexOf(v) === i);
          if (groups.length === 0) groups.push('read', 'edit', 'command');

          // Add mode to .roomodes
          // Replace /gsd: with /gsd- in description and roleDefinition for RooCode
          const convertedDescription = description.replace(/\/gsd:/g, '/gsd-');
          roomodesContent += `  - slug: ${slug}\n`;
          roomodesContent += `    name: ${name}\n`;
          roomodesContent += `    description: ${convertedDescription}\n`;
          if (roleDefinition) {
            roomodesContent += `    roleDefinition: |-\n      ${roleDefinition.replace(/\n/g, '\n      ')}\n`;
          }
          roomodesContent += `    groups:\n`;
          for (const group of groups) {
            roomodesContent += `      - ${group}\n`;
          }
          roomodesContent += '\n';

          // Copy agent definition to .roo/rules-{slug}/ directory
          const rulesDir = path.join(targetDir, `rules-${slug}`);
          fs.mkdirSync(rulesDir, { recursive: true });

          // Replace /gsd: with /gsd- in agent content
          content = content.replace(/\/gsd:/g, '/gsd-');

          // Write agent definition to rules directory
          fs.writeFileSync(path.join(rulesDir, agentFile), content);
        }

        // Write .roomodes file
        fs.writeFileSync(roomodesDest, roomodesContent.trim() + '\n');
        if (verifyFileInstalled(roomodesDest, '.roomodes')) {
          console.log(`  ${green}✓${reset} Generated .roomodes (${agentFiles.length} custom modes)`);
        } else {
          failures.push('.roomodes');
        }
      }
    }
  }

  // RooCode validation: handle critical errors with --force flag bypass
  if (isRoocode && roocodeValidationResults && roocodeValidationResults.errors.length > 0) {
    if (!forceInstall) { // forceInstall is set by --force flag
      console.error(`\n  ${red}✗ Installation aborted: ${roocodeValidationResults.errors.length} validation error(s)${reset}`);
      console.error(`    Re-run with ${cyan}--force${reset} to bypass validation\n`);
      process.exit(1);
    }
    console.log(`  ${yellow}⚠${reset} Continuing despite validation errors (--force)...\n`);
  }

  // RooCode: Check for AskUserQuestion support (user interaction capability)
  if (isRoocode) {
    const interactionSupport = checkRoocodeInteractionSupport();
    if (!interactionSupport) {
      if (!forceInstall) {
        console.error(`\n  ${red}✗ RooCode runtime does not support user interaction (AskUserQuestion)${reset}`);
        console.error(`    ${yellow}Required for:${reset} Decision gates, confirmation prompts, interactive commands`);
        console.error(`    Re-run with ${cyan}--force${reset} to install anyway (interactive commands may not work)\n`);
        process.exit(1);
      }
      console.log(`  ${yellow}⚠${reset} Installing without user interaction support (--force)`);
      console.log(`    ${yellow}Interactive commands may not work correctly\n`);
    } else {
      console.log(`  ${green}✓${reset} RooCode user interaction support verified`);
    }
  }

  // Copy CHANGELOG.md
  const changelogSrc = path.join(src, 'CHANGELOG.md');
  const changelogDest = path.join(targetDir, 'get-shit-done', 'CHANGELOG.md');
  if (fs.existsSync(changelogSrc)) {
    fs.copyFileSync(changelogSrc, changelogDest);
    if (verifyFileInstalled(changelogDest, 'CHANGELOG.md')) {
      console.log(`  ${green}✓${reset} Installed CHANGELOG.md`);
    } else {
      failures.push('CHANGELOG.md');
    }
  }

  // Write VERSION file
  const versionDest = path.join(targetDir, 'get-shit-done', 'VERSION');
  fs.writeFileSync(versionDest, pkg.version);
  if (verifyFileInstalled(versionDest, 'VERSION')) {
    console.log(`  ${green}✓${reset} Wrote VERSION (${pkg.version})`);
  } else {
    failures.push('VERSION');
  }

  // Copy hooks from dist/ (bundled with dependencies)
  const hooksSrc = path.join(src, 'hooks', 'dist');
  if (fs.existsSync(hooksSrc)) {
    const hooksDest = path.join(targetDir, 'hooks');
    fs.mkdirSync(hooksDest, { recursive: true });
    const hookEntries = fs.readdirSync(hooksSrc);
    for (const entry of hookEntries) {
      const srcFile = path.join(hooksSrc, entry);
      if (fs.statSync(srcFile).isFile()) {
        const destFile = path.join(hooksDest, entry);
        // For RooCode, replace /gsd: with /gsd- in hook files
        if (isRoocode && entry.endsWith('.js')) {
          let content = fs.readFileSync(srcFile, 'utf8');
          content = content.replace(/\/gsd:/g, '/gsd-');
          fs.writeFileSync(destFile, content);
        } else {
          fs.copyFileSync(srcFile, destFile);
        }
      }
    }
    if (verifyInstalled(hooksDest, 'hooks')) {
      console.log(`  ${green}✓${reset} Installed hooks (bundled)`);
    } else {
      failures.push('hooks');
    }
  }

  if (failures.length > 0) {
    console.error(`\n  ${yellow}Installation incomplete!${reset} Failed: ${failures.join(', ')}`);
    process.exit(1);
  }

  // Configure statusline and hooks in settings.json
  // Gemini shares same hook system as Claude Code for now
  const settingsPath = path.join(targetDir, 'settings.json');
  const settings = cleanupOrphanedHooks(readSettings(settingsPath));
  const statuslineCommand = isGlobal
    ? buildHookCommand(targetDir, 'gsd-statusline.js')
    : 'node ' + dirName + '/hooks/gsd-statusline.js';
  const updateCheckCommand = isGlobal
    ? buildHookCommand(targetDir, 'gsd-check-update.js')
    : 'node ' + dirName + '/hooks/gsd-check-update.js';

  // Enable experimental agents for Gemini CLI (required for custom sub-agents)
  if (isGemini) {
    if (!settings.experimental) {
      settings.experimental = {};
    }
    if (!settings.experimental.enableAgents) {
      settings.experimental.enableAgents = true;
      console.log(`  ${green}✓${reset} Enabled experimental agents`);
    }
  }

  // Configure SessionStart hook for update checking (skip for opencode)
  if (!isOpencode) {
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.SessionStart) {
      settings.hooks.SessionStart = [];
    }

    const hasGsdUpdateHook = settings.hooks.SessionStart.some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('gsd-check-update'))
    );

    if (!hasGsdUpdateHook) {
      settings.hooks.SessionStart.push({
        hooks: [
          {
            type: 'command',
            command: updateCheckCommand
          }
        ]
      });
      console.log(`  ${green}✓${reset} Configured update check hook`);
    }
  }

  // Write file manifest for future modification detection
  writeManifest(targetDir);
  console.log(`  ${green}✓${reset} Wrote file manifest (${MANIFEST_NAME})`);

  // Report any backed-up local patches
  reportLocalPatches(targetDir);

  // Show RooCode validation summary
  if (isRoocode && roocodeValidationResults) {
    if (roocodeValidationResults.errors.length === 0 && roocodeValidationResults.warnings.length === 0) {
      console.log(`  ${green}✓${reset} All frontmatter validated successfully`);
    } else if (roocodeValidationResults.errors.length === 0) {
      console.log(`  ${yellow}⚠${reset} Frontmatter validated with ${roocodeValidationResults.warnings.length} warning(s)`);
    }
  }

  return { settingsPath, settings, statuslineCommand, runtime };
}

/**
 * Apply statusline config, then print completion message
 */
function finishInstall(settingsPath, settings, statuslineCommand, shouldInstallStatusline, runtime = 'claude') {
  const isOpencode = runtime === 'opencode';
  const isRoocode = runtime === 'roocode';

  if (shouldInstallStatusline && !isOpencode && !isRoocode) {
    settings.statusLine = {
      type: 'command',
      command: statuslineCommand
    };
    console.log(`  ${green}✓${reset} Configured statusline`);
  }

  // Always write settings
  writeSettings(settingsPath, settings);

  // Configure OpenCode permissions
  if (isOpencode) {
    configureOpencodePermissions();
  }

  let program = 'Claude Code';
  if (runtime === 'opencode') program = 'OpenCode';
  if (runtime === 'gemini') program = 'Gemini';
  if (runtime === 'roocode') program = 'RooCode';

  // RooCode & OpenCode use flat structure (/gsd-help)
  // Claude Code & Gemini use nested structure (/gsd:help)
  const command = (isOpencode || isRoocode) ? '/gsd-help' : '/gsd:help';

  // RooCode requires VSCode reload to pick up new commands
  const reloadNote = isRoocode ? ' (reload VSCode if needed)' : '';

  console.log(`
  ${green}Done!${reset} Launch ${program} and run ${cyan}${command}${reset}${reloadNote}.

  ${cyan}Join the community:${reset} https://discord.gg/5JJgD5svVS
`);
}

/**
 * Handle statusline configuration with optional prompt
 */
function handleStatusline(settings, isInteractive, callback) {
  const hasExisting = settings.statusLine != null;

  if (!hasExisting) {
    callback(true);
    return;
  }

  if (forceStatusline) {
    callback(true);
    return;
  }

  if (!isInteractive) {
    console.log(`  ${yellow}⚠${reset} Skipping statusline (already configured)`);
    console.log(`    Use ${cyan}--force-statusline${reset} to replace\n`);
    callback(false);
    return;
  }

  const existingCmd = settings.statusLine.command || settings.statusLine.url || '(custom)';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`
  ${yellow}⚠${reset} Existing statusline detected\n
  Your current statusline:
    ${dim}command: ${existingCmd}${reset}

  GSD includes a statusline showing:
    • Model name
    • Current task (from todo list)
    • Context window usage (color-coded)

  ${cyan}1${reset}) Keep existing
  ${cyan}2${reset}) Replace with GSD statusline
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    rl.close();
    const choice = answer.trim() || '1';
    callback(choice === '2');
  });
}

/**
 * Prompt for runtime selection
 */
function promptRuntime(callback) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let answered = false;

  rl.on('close', () => {
    if (!answered) {
      answered = true;
      console.log(`\n  ${yellow}Installation cancelled${reset}\n`);
      process.exit(0);
    }
  });

  console.log(`  ${yellow}Which runtime(s) would you like to install for?${reset}\n\n  ${cyan}1${reset}) Claude Code ${dim}(~/.claude)${reset}
  ${cyan}2${reset}) OpenCode    ${dim}(~/.config/opencode)${reset} - open source, free models
  ${cyan}3${reset}) Gemini      ${dim}(~/.gemini)${reset}
  ${cyan}4${reset}) RooCode     ${dim}(~/.roo)${reset}
  ${cyan}5${reset}) All
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    answered = true;
    rl.close();
    const choice = answer.trim() || '1';
    if (choice === '5') {
      callback(['claude', 'opencode', 'gemini', 'roocode']);
    } else if (choice === '4') {
      callback(['roocode']);
    } else if (choice === '3') {
      callback(['gemini']);
    } else if (choice === '2') {
      callback(['opencode']);
    } else {
      callback(['claude']);
    }
  });
}

/**
 * Prompt for install location
 */
function promptLocation(runtimes) {
  if (!process.stdin.isTTY) {
    console.log(`  ${yellow}Non-interactive terminal detected, defaulting to global install${reset}\n`);
    installAllRuntimes(runtimes, true, false);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let answered = false;

  rl.on('close', () => {
    if (!answered) {
      answered = true;
      console.log(`\n  ${yellow}Installation cancelled${reset}\n`);
      process.exit(0);
    }
  });

  const pathExamples = runtimes.map(r => {
    const globalPath = getGlobalDir(r, explicitConfigDir);
    return globalPath.replace(os.homedir(), '~');
  }).join(', ');

  const localExamples = runtimes.map(r => `./${getDirName(r)}`).join(', ');

  console.log(`  ${yellow}Where would you like to install?${reset}\n\n  ${cyan}1${reset}) Global ${dim}(${pathExamples})${reset} - available in all projects
  ${cyan}2${reset}) Local  ${dim}(${localExamples})${reset} - this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    answered = true;
    rl.close();
    const choice = answer.trim() || '1';
    const isGlobal = choice !== '2';
    installAllRuntimes(runtimes, isGlobal, true);
  });
}

/**
 * Install GSD for all selected runtimes
 */
function installAllRuntimes(runtimes, isGlobal, isInteractive) {
  const results = [];

  for (const runtime of runtimes) {
    // Reset validation results for each runtime
    roocodeValidationResults = null;
    const result = install(isGlobal, runtime);
    results.push(result);
  }

  // Handle statusline for Claude & Gemini (OpenCode and RooCode use different UI)
  const claudeResult = results.find(r => r.runtime === 'claude');
  const geminiResult = results.find(r => r.runtime === 'gemini');
  const roocodeResult = results.find(r => r.runtime === 'roocode');
  const opencodeResult = results.find(r => r.runtime === 'opencode');

  // Logic: if Claude or Gemini are present, ask once if interactive? Or ask for each?
  // Simpler: Ask once and apply to both if applicable.

  if (claudeResult || geminiResult) {
    // Use whichever settings exist to check for existing statusline
    const primaryResult = claudeResult || geminiResult;

    handleStatusline(primaryResult.settings, isInteractive, (shouldInstallStatusline) => {
      if (claudeResult) {
        finishInstall(claudeResult.settingsPath, claudeResult.settings, claudeResult.statuslineCommand, shouldInstallStatusline, 'claude');
      }
      if (geminiResult) {
         finishInstall(geminiResult.settingsPath, geminiResult.settings, geminiResult.statuslineCommand, shouldInstallStatusline, 'gemini');
      }

      if (opencodeResult) {
        finishInstall(opencodeResult.settingsPath, opencodeResult.settings, opencodeResult.statuslineCommand, false, 'opencode');
      }
      if (roocodeResult) {
        finishInstall(roocodeResult.settingsPath, roocodeResult.settings, roocodeResult.statuslineCommand, false, 'roocode');
      }
    });
  } else {
    // Only OpenCode and/or RooCode (no statusline for these)
    if (opencodeResult) {
      finishInstall(opencodeResult.settingsPath, opencodeResult.settings, opencodeResult.statuslineCommand, false, 'opencode');
    }
    if (roocodeResult) {
      finishInstall(roocodeResult.settingsPath, roocodeResult.settings, roocodeResult.statuslineCommand, false, 'roocode');
    }
  }
}

// Main logic
if (hasGlobal && hasLocal) {
  console.error(`  ${yellow}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (explicitConfigDir && hasLocal) {
  console.error(`  ${yellow}Cannot use --config-dir with --local${reset}`);
  process.exit(1);
} else if (hasUninstall) {
  if (!hasGlobal && !hasLocal) {
    console.error(`  ${yellow}--uninstall requires --global or --local${reset}`);
    process.exit(1);
  }
  const runtimes = selectedRuntimes.length > 0 ? selectedRuntimes : ['claude'];
  for (const runtime of runtimes) {
    uninstall(hasGlobal, runtime);
  }
} else if (selectedRuntimes.length > 0) {
  if (!hasGlobal && !hasLocal) {
    promptLocation(selectedRuntimes);
  } else {
    installAllRuntimes(selectedRuntimes, hasGlobal, false);
  }
} else if (hasGlobal || hasLocal) {
  // Default to Claude if no runtime specified but location is
  installAllRuntimes(['claude'], hasGlobal, false);
} else {
  // Interactive
  if (!process.stdin.isTTY) {
    console.log(`  ${yellow}Non-interactive terminal detected, defaulting to Claude Code global install${reset}\n`);
    installAllRuntimes(['claude'], true, false);
  } else {
    promptRuntime((runtimes) => {
      promptLocation(runtimes);
    });
  }
}
